/**
 * QuaiAxePanel — QUAI miner + QuaiAxe burn-mining mini-game UI.
 *
 * Three surfaces:
 *   1. MINER   — connection state, hashrate telemetry, share accounting
 *   2. FURNACE — burn-share slider with a live split preview (mirrors the
 *                quaiaxe.com V2 contract math), burn-batch execution, totals
 *   3. WALL    — the 32×32 Furnace Wall pixel canvas (10 QUAI empty /
 *                150 QUAI overwrite, paid from the payout balance)
 *
 * Educational by design: every number is labeled with where it comes from
 * and the panel explains the fee → gas → burn → payout pipeline.
 */

import * as webjsx from 'webjsx';
import { formatQuai, QUAIAXE_MIN_BURN_BPS } from '@b3js/web3';
import type { QuaiAxeSnapshot } from '@b3js/engine';
import { QAXE_WALL_SIZE, QAXE_WALL_EMPTY_COST, QAXE_WALL_OVERWRITE_COST } from '@b3js/engine';

const ORANGE = '#ff7a1a';

function fmtHashrate(hz: number): string {
    if (hz >= 1e9) return `${(hz / 1e9).toFixed(2)} GH/s`;
    if (hz >= 1e6) return `${(hz / 1e6).toFixed(2)} MH/s`;
    if (hz >= 1e3) return `${(hz / 1e3).toFixed(2)} kH/s`;
    return `${hz.toFixed(0)} H/s`;
}

// Per-engine panel state (webjsx re-renders blow away closures)
function panelState(engine: any) {
    if (!(engine as any)._qaxePanel) {
        (engine as any)._qaxePanel = {
            simulate: true,
            selectedColor: '#ff6600',
            statusLine: '',
            bound: false,
        };
    }
    return (engine as any)._qaxePanel;
}

export const QuaiAxePanel = ({ engine, onRender }: any) => {
    const game = engine?.quaiAxe;
    if (!game) {
        return <div style="padding: 15px; color: #ff3366;">QuaiAxeGame not initialized.</div>;
    }
    const state = panelState(engine);

    // Bind game events → re-render (once per engine)
    if (!state.bound && typeof window !== 'undefined') {
        state.bound = true;
        let lastRender = 0;
        const rerender = () => {
            const now = Date.now();
            if (now - lastRender < 500) return; // throttle 1Hz telemetry
            lastRender = now;
            onRender();
        };
        for (const evt of ['telemetry', 'share', 'config', 'burn', 'paint']) {
            window.addEventListener(`b3js:qaxe:${evt}`, rerender);
        }
    }

    const snap: QuaiAxeSnapshot = game.getSnapshot();
    const setStatus = (msg: string) => { state.statusLine = msg; onRender(); };

    // Live split preview against the pending pot (or a 100 QUAI reference)
    const pendingNum = Number(snap.pendingGross);
    const previewGross = pendingNum > 0 ? pendingNum : 100;
    const preview = game.miner.previewSplit(previewGross);

    const sectionTitle = (text: string) => (
        <div style="color: #aaa; margin-bottom: 6px; font-weight: bold; font-size: 10px; text-transform: uppercase; letter-spacing: 1px;">{text}</div>
    );

    const btn = (label: string, onClick: () => void, color = ORANGE, disabled = false) => (
        <button
            style={`background: ${disabled ? '#333' : color}; color: ${disabled ? '#777' : '#000'}; border: none; border-radius: 4px; padding: 4px 10px; font-size: 10px; cursor: ${disabled ? 'default' : 'pointer'}; font-weight: bold;`}
            disabled={disabled}
            onClick={onClick}
        >{label}</button>
    );

    const stat = (label: string, value: string, hint = '') => (
        <div style="display: flex; justify-content: space-between; font-size: 10px; padding: 2px 0;" title={hint}>
            <span style="color: #888;">{label}</span>
            <span style="color: #ddd; font-family: monospace;">{value}</span>
        </div>
    );

    // ─── Actions ────────────────────────────────────────────────

    const toggleMiner = () => {
        if (snap.minerState === 'IDLE' || snap.minerState === 'ERROR') {
            game.startMiner({ simulate: state.simulate });
            setStatus(state.simulate
                ? '⛏️ Simulated miner started (demo mode — no real QUAI)'
                : '⛏️ Connecting to mining middleware…');
        } else {
            game.stopMiner();
            setStatus('Miner stopped');
        }
    };

    const feedFurnace = () => {
        const rec = game.executeBurnBatch();
        if (rec) {
            setStatus(`🔥 Batch #${rec.id}: burned ${formatQuai(rec.split.burnBuy)} QUAI of $QAXE, paid out ${formatQuai(rec.split.payout)} QUAI`);
        } else {
            setStatus('Furnace is hungry — no pending QUAI to burn yet. Mine some shares first.');
        }
    };

    const spawnWorld = () => {
        const cam = engine.camera;
        const dir = cam.position.clone();
        cam.getWorldDirection(dir);
        const pos = cam.position.clone().addScaledVector(dir, 10);
        pos.y = Math.max(0, pos.y - 2);
        game.spawnFurnace(pos);
        const wallPos = pos.clone(); wallPos.y += 4; wallPos.addScaledVector(dir, 2);
        game.spawnFurnaceWall(wallPos, Math.atan2(-dir.x, -dir.z));
        setStatus('🏭 Furnace + Wall spawned in front of you');
    };

    // ─── Wall grid ──────────────────────────────────────────────

    const pixels = game.getWallPixels();
    const pixelMap = new Map(pixels.map((p: any) => [`${p.x},${p.y}`, p]));

    const paintAt = (x: number, y: number) => {
        const result = game.paintPixel(x, y, state.selectedColor);
        if (!result.ok) {
            setStatus(result.reason === 'insufficient-payout'
                ? `Need ${formatQuai(result.cost)} QUAI payout balance — you have ${formatQuai(result.balance)}`
                : 'Pixel out of bounds');
        }
        onRender();
    };

    const cell = 7; // px per wall cell
    const gridCells = [];
    for (let y = 0; y < QAXE_WALL_SIZE; y++) {
        for (let x = 0; x < QAXE_WALL_SIZE; x++) {
            const p = pixelMap.get(`${x},${y}`);
            gridCells.push(
                <div
                    key={`${x}-${y}`}
                    title={p ? `(${x},${y}) by ${p.painter}` : `(${x},${y}) — ${formatQuai(game.pixelCost(x, y))} QUAI`}
                    style={`width: ${cell}px; height: ${cell}px; background: ${p ? p.color : '#15151c'}; cursor: pointer; box-sizing: border-box; border: 1px solid #1e1e26;`}
                    onClick={() => paintAt(x, y)}
                />
            );
        }
    }

    const mining = snap.minerState === 'MINING' || snap.minerState === 'SIMULATING';

    return (
        <div style="padding: 12px; background: #1a1a1a; height: 100%; color: #ddd; overflow-y: auto; display: flex; flex-direction: column; gap: 14px;">
            {/* Header */}
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; padding-bottom: 8px;">
                <div style={`font-size: 13px; font-weight: bold; color: ${ORANGE};`}>🔥 QuaiAxe Furnace</div>
                <div style="font-size: 9px; color: #888;">
                    {snap.simulated ? '🧪 SIMULATED' : snap.minerState} · heat {(snap.furnaceHeat * 100).toFixed(0)}%
                </div>
            </div>

            {/* Educational banner */}
            <div style="font-size: 9px; color: #999; background: #20180f; border: 1px solid #3a2c14; border-radius: 4px; padding: 6px 8px; line-height: 1.5;">
                <b style={`color: ${ORANGE};`}>How QuaiAxe works:</b> your mined QUAI goes to the QuaiAxe deposit
                address. Each batch: <b>0.5% fee</b> → the <b>burn share you pick (≥10%)</b> buys $QAXE and
                <b> burns it</b> (minus a ≤3% gas refund) → the rest is <b>paid out to you</b>. Burning pumps
                $QAXE scarcity; your payout funds pixels on the Furnace Wall.
            </div>

            {/* World + tutorial entry */}
            <div style="display: flex; gap: 6px;">
                {btn('🏭 Load Furnace World (Tutorial)', async () => {
                    await engine.createQuaiAxeFurnaceTemplate();
                    onRender();
                }, '#6a3bd8')}
            </div>

            {/* Status line */}
            {state.statusLine && (
                <div style="font-size: 10px; color: #f6ad55; background: #2a2216; padding: 4px 8px; border-radius: 4px;">
                    {state.statusLine}
                </div>
            )}

            {/* ── 1. Miner ── */}
            <div>
                {sectionTitle('⛏️ QUAI Miner')}
                <div style="display: flex; gap: 6px; align-items: center; margin-bottom: 6px;">
                    {btn(mining ? 'Stop Miner' : 'Start Miner', toggleMiner, mining ? '#ff3366' : '#00ff88')}
                    <label style="display: flex; gap: 4px; align-items: center; font-size: 9px; color: #888;">
                        <input type="checkbox" checked={state.simulate}
                            onChange={(e: any) => { state.simulate = e.target.checked; onRender(); }} />
                        simulate (no hardware)
                    </label>
                    {btn('🏭 Spawn Furnace + Wall', spawnWorld, '#6a3bd8')}
                </div>
                {stat('State', snap.minerState)}
                {stat('Hashrate', `${fmtHashrate(snap.hashrate)} (1m ${fmtHashrate(snap.hashrate1m)} · 15m ${fmtHashrate(snap.hashrate15m)})`)}
                {stat('Shares', `${snap.sharesAccepted} accepted / ${snap.sharesRejected} rejected`)}
                {stat('Acceptance', `${(snap.acceptanceBps / 100).toFixed(2)}%`)}
            </div>

            {/* ── 2. Furnace / burn split ── */}
            <div>
                {sectionTitle('🏭 Burn Furnace')}
                <div style="margin-bottom: 6px;">
                    <div style="display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 3px;">
                        <span style="color: #888;">Burn share (goes to $QAXE buy+burn)</span>
                        <b style={`color: ${ORANGE};`}>{snap.burnSharePercent.toFixed(0)}%</b>
                    </div>
                    <input type="range" min={Number(QUAIAXE_MIN_BURN_BPS) / 100} max={100} step={1}
                        value={snap.burnSharePercent}
                        style="width: 100%;"
                        onInput={(e: any) => { game.setBurnSharePercent(Number(e.target.value)); onRender(); }} />
                </div>
                <div style="font-size: 9px; color: #888; margin-bottom: 4px;">
                    Split preview per {previewGross.toFixed(4)} QUAI {pendingNum > 0 ? '(your pending pot)' : '(reference)'}:
                </div>
                {stat('🔥 $QAXE burn buy', `${formatQuai(preview.burnBuy)} QUAI`, 'Buys $QAXE which is immediately burned')}
                {stat('💰 Your payout', `${formatQuai(preview.payout)} QUAI`, 'Paid to your wallet — spendable on the Wall')}
                {stat('⛽ Gas refund (≤3%)', `${formatQuai(preview.gasRefund)} QUAI`, 'Charged to the burn side, pays the batch runner')}
                {stat('🏦 Protocol fee (0.5%)', `${formatQuai(preview.fee)} QUAI`, 'Fixed maintenance & treasury fee')}
                <div style="border-top: 1px solid #333; margin-top: 6px; padding-top: 6px;">
                    {stat('Pending pot (est.)', `${snap.pendingGross} QUAI`, 'Estimated from accepted shares; the pool is authoritative')}
                    {stat('Payout balance', `${snap.payoutBalance} QUAI`, 'Spendable on Furnace Wall pixels')}
                    {stat('Total burned', `${snap.totalBurned} QUAI → $QAXE`)}
                    {stat('Batches executed', `${snap.burnBatches}`)}
                </div>
                <div style="margin-top: 6px;">
                    {btn('🔥 Feed the Furnace (burn batch)', feedFurnace, ORANGE, pendingNum <= 0)}
                </div>
            </div>

            {/* ── 3. Furnace Wall ── */}
            <div>
                {sectionTitle('🎨 Furnace Wall (32×32)')}
                <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 6px; font-size: 9px; color: #888;">
                    <input type="color" value={state.selectedColor}
                        style="width: 28px; height: 20px; border: none; background: none; cursor: pointer;"
                        onInput={(e: any) => { state.selectedColor = e.target.value; }} />
                    <span>empty {formatQuai(QAXE_WALL_EMPTY_COST)} QUAI · overwrite {formatQuai(QAXE_WALL_OVERWRITE_COST)} QUAI</span>
                    <span>{snap.wallPixelsPainted} painted</span>
                </div>
                <div style={`display: grid; grid-template-columns: repeat(${QAXE_WALL_SIZE}, ${cell}px); width: fit-content; border: 1px solid #333;`}>
                    {gridCells}
                </div>
            </div>
        </div>
    );
};
