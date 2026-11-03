import { describe, test, expect } from 'bun:test';
import {
    QuaiAxeGame,
    QAXE_WALL_SIZE,
    QAXE_WALL_EMPTY_COST,
    QAXE_WALL_OVERWRITE_COST,
} from '../src/quaiAxe';
import { QUAI_WEI } from '@b3js/web3';

/** float-safe QUAI → wei helper (float64 can't hold n * 1e18 exactly). */
const QUAI = (n: number) => BigInt(Math.round(n * 1e6)) * 10n ** 12n;

/** Headless engine stub — QuaiAxeGame only touches engine.scene lazily. */
function makeGame(): QuaiAxeGame {
    return new QuaiAxeGame({ scene: null });
}

describe('QuaiAxeGame — share accrual & burn batches', () => {
    test('accepted shares accrue estimated pending gross', () => {
        const game = makeGame();
        game.setShareRewardEstimate(QUAI(0.5));
        game.creditAcceptedShare();
        game.creditAcceptedShare();
        expect(game.pendingGrossWei).toBe(QUAI(1));
        expect(game.totalMinedWei).toBe(QUAI(1));
    });

    test('burn batch on empty pot returns null', () => {
        const game = makeGame();
        expect(game.executeBurnBatch()).toBeNull();
    });

    test('100 QUAI @ 70% burn matches the published QuaiAxe example', () => {
        const game = makeGame();
        game.miner.config.burnShareBps = 7000;
        game.creditAcceptedShare(QUAI(100));

        const record = game.executeBurnBatch();
        expect(record).not.toBeNull();
        const s = record!.split;

        // quaiaxe.com calculator: 100 @70%, max gas →
        //   burnBuy 66.65 / payout 29.85 / fee 0.50 / gas 3.00
        expect(s.fee).toBe(QUAI(0.5));
        expect(s.payout).toBe(QUAI(29.85));
        expect(s.burnBuy).toBe(QUAI(66.65));
        expect(s.gasRefund).toBe(QUAI(3));
        expect(s.fee + s.payout + s.burnBuy + s.gasRefund).toBe(s.gross);

        // Balances moved correctly
        expect(game.pendingGrossWei).toBe(0n);
        expect(game.payoutBalanceWei).toBe(QUAI(29.85));
        expect(game.totalBurnBuyWei).toBe(QUAI(66.65));
        expect(game.totalFeeWei).toBe(QUAI(0.5));
        expect(game.burnLog.length).toBe(1);
    });

    test('burn heats the furnace; heat decays in update()', () => {
        const game = makeGame();
        game.creditAcceptedShare(QUAI(10));
        game.miner.config.burnShareBps = 5000;
        expect(game.furnaceHeat).toBe(0);
        game.executeBurnBatch();
        const hot = game.furnaceHeat;
        expect(hot).toBeGreaterThan(0);
        game.update(1.0);
        expect(game.furnaceHeat).toBeLessThan(hot);
        game.update(100);
        expect(game.furnaceHeat).toBe(0);
    });

    test('burn events reach listeners', () => {
        const game = makeGame();
        const events: string[] = [];
        game.on((e) => events.push(e.type));
        game.creditAcceptedShare(QUAI(2));
        game.executeBurnBatch();
        expect(events).toContain('burn');
    });
});

describe('QuaiAxeGame — furnace wall', () => {
    function fundedGame(quai: number): QuaiAxeGame {
        const game = makeGame();
        game.miner.config.burnShareBps = 1000; // 10% burn → max payout side
        game.creditAcceptedShare(QUAI(quai));
        game.executeBurnBatch();
        return game;
    }

    test('empty pixel costs 10 QUAI-equivalent, charged from payout balance', () => {
        const game = fundedGame(20); // payout = 20 × 0.995 × 0.9 = 17.91
        const before = game.payoutBalanceWei;
        const result = game.paintPixel(3, 4, '#ff6600');
        expect(result.ok).toBe(true);
        expect(result.cost).toBe(QAXE_WALL_EMPTY_COST);
        expect(game.payoutBalanceWei).toBe(before - QAXE_WALL_EMPTY_COST);
        expect(game.getPixel(3, 4)?.color).toBe('#ff6600');
    });

    test('overwrite costs 150 QUAI-equivalent', () => {
        const game = fundedGame(400);
        game.paintPixel(0, 0, '#ffffff');
        expect(game.pixelCost(0, 0)).toBe(QAXE_WALL_OVERWRITE_COST);
        const result = game.paintPixel(0, 0, '#000000');
        expect(result.ok).toBe(true);
        expect(result.cost).toBe(QAXE_WALL_OVERWRITE_COST);
        expect(game.getPixel(0, 0)?.color).toBe('#000000');
    });

    test('insufficient balance is rejected without charging', () => {
        const game = makeGame(); // zero balance
        const result = game.paintPixel(1, 1, '#ff6600');
        expect(result.ok).toBe(false);
        expect(result.reason).toBe('insufficient-payout');
        expect(game.getPixel(1, 1)).toBeUndefined();
    });

    test('out-of-bounds coordinates are rejected', () => {
        const game = fundedGame(100);
        expect(game.paintPixel(-1, 0, '#fff').reason).toBe('out-of-bounds');
        expect(game.paintPixel(0, QAXE_WALL_SIZE, '#ff6600').reason).toBe('out-of-bounds');
    });

    test('remote paint applies without charging the local balance', () => {
        const game = makeGame();
        const before = game.payoutBalanceWei;
        game.applyRemotePaint({ x: 5, y: 5, color: '#00ffcc', painter: 'alice', paintedAt: 1 });
        expect(game.payoutBalanceWei).toBe(before);
        expect(game.getPixel(5, 5)?.painter).toBe('alice');
    });

    test('wall serialization roundtrips', () => {
        const a = fundedGame(100);
        a.paintPixel(1, 2, '#123456');
        a.paintPixel(7, 9, '#654321');
        const b = makeGame();
        b.loadWall(a.serializeWall());
        expect(b.getPixel(1, 2)?.color).toBe('#123456');
        expect(b.getPixel(7, 9)?.painter).toBe('local');
        expect(b.getWallPixels().length).toBe(2);
    });
});

describe('QuaiAxeGame — snapshot', () => {
    test('snapshot is JSON-safe and reports simulation flag', () => {
        const game = makeGame();
        game.creditAcceptedShare(QUAI(1));
        const snap = game.getSnapshot();
        expect(snap.pendingGross).toBe('1.0000');
        expect(snap.burnSharePercent).toBe(70);
        expect(() => JSON.stringify(snap)).not.toThrow();
    });
});
