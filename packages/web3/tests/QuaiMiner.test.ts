/**
 * @b3js/web3 tests — QuaiMiner & QuaiAxe burn arithmetic
 *
 * The split math is validated against quaiaxe.com's published calculator
 * example: per 100 QUAI at a 70% burn share with max gas →
 * 66.65 buy-and-burn, 29.85 payout, 0.50 fee, 3.00 gas.
 */

import { describe, test, expect } from 'bun:test';
import {
    quaiAxeSplit,
    formatQuai,
    QuaiMinerClient,
    HashrateTracker,
    QUAI_WEI,
    QUAIAXE_MAX_GAS_BPS,
    QUAIAXE_MIN_BURN_BPS,
} from '../src/QuaiMiner';

// Bigint-safe: scale via micro-units to avoid float64 precision loss at 1e18+
const QUAI = (n: number) => BigInt(Math.round(n * 1e6)) * 10n ** 12n;

describe('quaiAxeSplit', () => {
    test('matches the published 70/30 example per 100 QUAI (max gas)', () => {
        const s = quaiAxeSplit(QUAI(100), 7000n, QUAIAXE_MAX_GAS_BPS);
        expect(s.fee).toBe(QUAI(0.5));
        expect(s.payout).toBe(QUAI(29.85));
        expect(s.burnBuy).toBe(QUAI(66.65));
        expect(s.gasRefund).toBe(QUAI(3));
        // Conservation: everything accounted for
        expect(s.fee + s.payout + s.burnBuy + s.gasRefund).toBe(s.gross);
    });

    test('zero gas refund pushes the full burn budget into the buy', () => {
        const s = quaiAxeSplit(QUAI(100), 7000n, 0n);
        expect(s.burnBuy).toBe(QUAI(69.65)); // 70% of 99.5
        expect(s.gasRefund).toBe(0n);
        expect(s.fee + s.payout + s.burnBuy + s.gasRefund).toBe(s.gross);
    });

    test('100% burn share pays nothing out', () => {
        const s = quaiAxeSplit(QUAI(50), 10000n);
        expect(s.payout).toBe(0n);
        expect(s.burnBuy).toBe(QUAI(50) - QUAI(0.25) - QUAI(1.5));
    });

    test('minimum burn share is 10%', () => {
        const s = quaiAxeSplit(QUAI(100), 1000n);
        expect(s.payout).toBe(QUAI(89.55)); // 90% of 99.5
        expect(() => quaiAxeSplit(QUAI(100), 999n)).toThrow('≥10%');
    });

    test('gas above 3% is rejected; burn side stays positive at minimum burn share', () => {
        expect(() => quaiAxeSplit(QUAI(100), 7000n, 301n)).toThrow('≤3%');
        // At the 10% minimum burn share, the 3% gas bound can never exceed
        // the burn budget (9.95% of gross) — the buy always stays positive.
        const s = quaiAxeSplit(QUAI(0.1), 1000n, 300n);
        expect(s.burnBuy).toBeGreaterThan(0n);
    });

    test('negative gross rejected; exact conservation at dust levels', () => {
        expect(() => quaiAxeSplit(-1n, 7000n)).toThrow();
        const s = quaiAxeSplit(1n, 5000n, 0n); // 1 wei
        expect(s.fee + s.payout + s.burnBuy + s.gasRefund).toBe(1n);
    });

    test('formatQuai renders 4 decimals', () => {
        expect(formatQuai(QUAI(66.65))).toBe('66.6500');
        expect(formatQuai(0n)).toBe('0.0000');
        expect(formatQuai(QUAI(0.0001))).toBe('0.0001');
    });
});

describe('HashrateTracker', () => {
    test('averages over rolling windows', () => {
        const t = new HashrateTracker();
        const t0 = 1_000_000;
        // 100 H/s for 10 seconds = 1000 hashes
        for (let i = 0; i < 10; i++) t.record(100, t0 + i * 1000);
        const avg = t.average(60_000, t0 + 10_000);
        expect(avg).toBeGreaterThan(90);  // ~100 H/s modulo span alignment
        expect(avg).toBeLessThan(115);
    });

    test('old samples fall out of the window', () => {
        const t = new HashrateTracker();
        t.record(1000, 0);
        expect(t.average(5000, 10_000)).toBe(0);
    });
});

describe('QuaiMinerClient', () => {
    test('starts in IDLE; stop returns to IDLE', () => {
        const m = new QuaiMinerClient({ simulate: true });
        expect(m.telemetry.state).toBe('IDLE');
        m.start();
        expect(m.telemetry.state).toBe('SIMULATING');
        m.stop();
        expect(m.telemetry.state).toBe('IDLE');
    });

    test('simulation produces telemetry and shares', async () => {
        const m = new QuaiMinerClient({ simulate: true });
        const events: string[] = [];
        m.on((e) => events.push(e.type));
        m.start();
        await new Promise((r) => setTimeout(r, 2500));
        m.stop();

        expect(m.telemetry.hashrate).toBeGreaterThan(0);
        expect(events).toContain('telemetry');
        expect(events).toContain('state');
        expect(m.telemetry.uptimeSec).toBeGreaterThan(0);
    });

    test('burn share setter validates the 10% floor', () => {
        const m = new QuaiMinerClient();
        m.setBurnSharePercent(70);
        expect(m.burnSharePercent).toBe(70);
        expect(() => m.setBurnSharePercent(5)).toThrow();
    });

    test('previewSplit matches the contract arithmetic', () => {
        const m = new QuaiMinerClient({ burnShareBps: 7000 });
        const s = m.previewSplit(100);
        expect(formatQuai(s.burnBuy)).toBe('66.6500');
        expect(formatQuai(s.payout)).toBe('29.8500');
    });

    test('acceptance rate tracks shares', () => {
        const m = new QuaiMinerClient({ simulate: true });
        m.start();
        m.stop();
        // No shares yet → 100% by convention
        expect(m.acceptanceBps).toBe(10000);
    });
});
