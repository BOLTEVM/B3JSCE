/**
 * @b3js/engine — QuaiAxeGame
 *
 * The in-world QuaiAxe (quaiaxe.com) burn-mining mini-game layer.
 *
 * Pipeline:
 *   QuaiMinerClient (web3 pkg)  →  accepted shares accrue an *estimated*
 *   QUAI balance (clearly labeled — real rewards come from the pool)  →
 *   executeBurnBatch() applies the exact QuaiAxe V2 split  →  the burn
 *   side feeds the Furnace (heat, glow) and the payout side feeds the
 *   player's spendable balance  →  the balance buys pixels on the
 *   32×32 Furnace Wall, mirroring quaiaxe.com's pricing
 *   (10 QUAI empty pixel / 150 QUAI overwrite).
 *
 * All money math is bigint wei via @b3js/web3's quaiAxeSplit.
 * DOM events (`b3js:qaxe:*`) let the UI and logic bricks react without
 * polling; everything is guarded so the class also runs under Bun tests.
 */

import * as THREE from 'three';
import {
    QuaiMinerClient,
    quaiAxeSplit,
    QUAI_WEI,
} from '@b3js/web3';
import type {
    QuaiMinerConfig,
    QuaiMinerEvent,
    QuaiAxeSplit,
} from '@b3js/web3';

// ═══════════════════════════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════════════════════════

/** Furnace Wall resolution (mirrors quaiaxe.com's wall). */
export const QAXE_WALL_SIZE = 32;
/** Painting an empty pixel costs 10 QUAI (site parity). */
export const QAXE_WALL_EMPTY_COST = 10n * QUAI_WEI;
/** Overwriting a painted pixel costs 150 QUAI (site parity). */
export const QAXE_WALL_OVERWRITE_COST = 150n * QUAI_WEI;
/**
 * Estimated QUAI earned per accepted share. This is an ESTIMATE used for
 * gameplay pacing — the authoritative reward comes from the pool/contract.
 * Default 0.25 QUAI/share keeps the wall reachable in a demo session.
 */
export const QAXE_DEFAULT_SHARE_ESTIMATE = QUAI_WEI / 4n;

export interface QuaiAxeWallPixel {
    x: number;
    y: number;
    /** CSS color, e.g. '#ff6600'. */
    color: string;
    /** Painter identity (worker name / wallet / 'local'). */
    painter: string;
    paintedAt: number;
}

export interface QuaiAxeBurnRecord {
    id: number;
    at: number;
    split: QuaiAxeSplit;
}

export interface PaintResult {
    ok: boolean;
    reason?: 'out-of-bounds' | 'insufficient-payout';
    cost: bigint;
    balance: bigint;
    pixel?: QuaiAxeWallPixel;
}

export type QuaiAxeGameEvent =
    | { type: 'telemetry'; snapshot: QuaiAxeSnapshot }
    | { type: 'share'; amountWei: bigint; snapshot: QuaiAxeSnapshot }
    | { type: 'config'; snapshot: QuaiAxeSnapshot }
    | { type: 'burn'; record: QuaiAxeBurnRecord; snapshot: QuaiAxeSnapshot }
    | { type: 'paint'; pixel: QuaiAxeWallPixel; cost: bigint; snapshot: QuaiAxeSnapshot };

/** JSON-safe snapshot for UI panels and DOM event payloads. */
export interface QuaiAxeSnapshot {
    minerState: string;
    hashrate: number;
    hashrate1m: number;
    hashrate15m: number;
    sharesAccepted: number;
    sharesRejected: number;
    acceptanceBps: number;
    burnSharePercent: number;
    /** All QUAI amounts as decimal strings (4dp) for direct display. */
    pendingGross: string;
    payoutBalance: string;
    totalMined: string;
    totalBurned: string;
    totalFees: string;
    totalGas: string;
    totalPaidOut: string;
    burnBatches: number;
    furnaceHeat: number;
    wallPixelsPainted: number;
    /** True when the miner is in explicit simulation mode. */
    simulated: boolean;
}

type GameListener = (e: QuaiAxeGameEvent) => void;

// ═══════════════════════════════════════════════════════════════════
//  QuaiAxeGame
// ═══════════════════════════════════════════════════════════════════

export class QuaiAxeGame {
    /** The production miner client (telemetry + accounting primitives). */
    public readonly miner: QuaiMinerClient;

    // ── Session accounting (bigint wei; estimates until pool confirms) ──
    private shareRewardEstimateWei: bigint = QAXE_DEFAULT_SHARE_ESTIMATE;
    public pendingGrossWei: bigint = 0n;
    public payoutBalanceWei: bigint = 0n;
    public totalMinedWei: bigint = 0n;
    public totalBurnBuyWei: bigint = 0n;
    public totalFeeWei: bigint = 0n;
    public totalGasWei: bigint = 0n;
    public totalPayoutWei: bigint = 0n;
    public readonly burnLog: QuaiAxeBurnRecord[] = [];
    private burnIdSeq = 0;

    // ── Furnace state ──
    /** 0 = cold, grows with each burn batch, decays over time. */
    public furnaceHeat = 0;
    private furnaceGroup: THREE.Group | null = null;
    private furnaceCoreMat: THREE.MeshStandardMaterial | null = null;
    private furnaceLight: THREE.PointLight | null = null;

    // ── Furnace Wall state ──
    private wallPixels = new Map<string, QuaiAxeWallPixel>();
    private wallMesh: THREE.Mesh | null = null;
    private wallCanvas: HTMLCanvasElement | null = null;
    private wallCtx: CanvasRenderingContext2D | null = null;
    private wallTexture: THREE.CanvasTexture | null = null;

    private listeners: GameListener[] = [];

    constructor(private engine: any, minerConfig: Partial<QuaiMinerConfig> = {}) {
        this.miner = new QuaiMinerClient(minerConfig);
        this.miner.on((e) => this.handleMinerEvent(e));
    }

    // ─── Events ──────────────────────────────────────────────────

    on(listener: GameListener): () => void {
        this.listeners.push(listener);
        return () => { this.listeners = this.listeners.filter((l) => l !== listener); };
    }

    private emit(e: QuaiAxeGameEvent): void {
        for (const l of this.listeners) l(e);
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
            window.dispatchEvent(new CustomEvent(`b3js:qaxe:${e.type}`, { detail: e }));
        }
    }

    // ─── Miner lifecycle ─────────────────────────────────────────

    /** Start mining. Pass `{ simulate: true }` for offline/demo play. */
    startMiner(config: Partial<QuaiMinerConfig> = {}): void {
        Object.assign(this.miner.config, config);
        this.miner.start();
    }

    stopMiner(): void {
        this.miner.stop();
    }

    /** Burn-share percent (10–100), forwarded to the miner config. */
    setBurnSharePercent(percent: number): void {
        this.miner.setBurnSharePercent(percent);
        this.emit({ type: 'config', snapshot: this.getSnapshot() });
    }

    /**
     * Set the estimated QUAI per accepted share (wei). Estimates pace the
     * game; they are replaced by authoritative pool accounting when a real
     * QuaiAxe deposit address settles.
     */
    setShareRewardEstimate(wei: bigint): void {
        if (wei < 0n) throw new Error('QuaiAxeGame: share estimate must be ≥ 0');
        this.shareRewardEstimateWei = wei;
    }

    // ─── Share → gross accrual ───────────────────────────────────

    private handleMinerEvent(e: QuaiMinerEvent): void {
        if (e.type === 'share' && e.share.accepted) {
            this.creditAcceptedShare();
        }
        if (e.type === 'telemetry') {
            this.emit({ type: 'telemetry', snapshot: this.getSnapshot() });
        }
    }

    /**
     * Credit one accepted share's estimated reward into the pending gross.
     * Called automatically on miner share events; exposed for tests and
     * for logic bricks that credit shares from other sources.
     */
    creditAcceptedShare(amountWei?: bigint): void {
        const amount = amountWei ?? this.shareRewardEstimateWei;
        this.pendingGrossWei += amount;
        this.totalMinedWei += amount;
        this.emit({ type: 'share', amountWei: amount, snapshot: this.getSnapshot() });
    }

    // ─── Burn batch (the core QuaiAxe loop) ──────────────────────

    /**
     * Execute a QuaiAxe burn batch over the pending gross: 0.5% fee,
     * burn share buys+burns $QAXE (minus ≤3% gas refund), remainder is
     * credited to the spendable payout balance. Returns null when the
     * pending pot is empty.
     */
    executeBurnBatch(): QuaiAxeBurnRecord | null {
        if (this.pendingGrossWei <= 0n) return null;

        const split = quaiAxeSplit(this.pendingGrossWei, BigInt(this.miner.config.burnShareBps));
        this.pendingGrossWei = 0n;

        this.payoutBalanceWei += split.payout;
        this.totalBurnBuyWei += split.burnBuy;
        this.totalFeeWei += split.fee;
        this.totalGasWei += split.gasRefund;
        this.totalPayoutWei += split.payout;

        const record: QuaiAxeBurnRecord = { id: ++this.burnIdSeq, at: Date.now(), split };
        this.burnLog.push(record);
        if (this.burnLog.length > 256) this.burnLog.shift();

        // Feed the furnace — log-ish scaling so big burns still feel bigger.
        const burnedQuai = Number(split.burnBuy) / Number(QUAI_WEI);
        this.furnaceHeat = Math.min(2.5, this.furnaceHeat + 0.35 + Math.log10(1 + burnedQuai) * 0.4);

        // Publish to the lobby's shared furnace log when online.
        try {
            this.engine?.spacetime?.pushQaxeBurn?.({
                batch_id: String(record.id),
                miner_name: this.miner.config.workerName,
                burn_share_bps: this.miner.config.burnShareBps,
                gross_wei: split.gross.toString(),
                burn_buy_wei: split.burnBuy.toString(),
                payout_wei: split.payout.toString(),
                fee_wei: split.fee.toString(),
                gas_wei: split.gasRefund.toString(),
            });
        } catch { /* offline play — local-only burn */ }

        this.emit({ type: 'burn', record, snapshot: this.getSnapshot() });
        return record;
    }

    /**
     * Handle a burn event published by another lobby member: their fire
     * heats the shared furnace too. Amounts were already validated by the
     * server reducer (conservation check).
     */
    handleRemoteBurn(data: { minerName: string; burnShareBps: number; burnBuyWei: bigint; grossWei: bigint }): void {
        const burnedQuai = Number(data.burnBuyWei) / Number(QUAI_WEI);
        this.furnaceHeat = Math.min(2.5, this.furnaceHeat + 0.2 + Math.log10(1 + burnedQuai) * 0.3);
        this.emit({ type: 'telemetry', snapshot: this.getSnapshot() });
    }

    // ─── Furnace Wall ────────────────────────────────────────────

    getPixel(x: number, y: number): QuaiAxeWallPixel | undefined {
        return this.wallPixels.get(`${x},${y}`);
    }

    getWallPixels(): QuaiAxeWallPixel[] {
        return [...this.wallPixels.values()];
    }

    /** Price of painting (x,y) right now: 10 QUAI empty, 150 QUAI overwrite. */
    pixelCost(x: number, y: number): bigint {
        if (x < 0 || y < 0 || x >= QAXE_WALL_SIZE || y >= QAXE_WALL_SIZE) return 0n;
        return this.wallPixels.has(`${x},${y}`) ? QAXE_WALL_OVERWRITE_COST : QAXE_WALL_EMPTY_COST;
    }

    /**
     * Paint a wall pixel, paid from the burn-batch payout balance.
     * Emits `b3js:qaxe:paint` for UI + multiplayer relay.
     */
    paintPixel(x: number, y: number, color: string, painter = 'local'): PaintResult {
        if (x < 0 || y < 0 || x >= QAXE_WALL_SIZE || y >= QAXE_WALL_SIZE) {
            return { ok: false, reason: 'out-of-bounds', cost: 0n, balance: this.payoutBalanceWei };
        }
        const cost = this.pixelCost(x, y);
        if (this.payoutBalanceWei < cost) {
            return { ok: false, reason: 'insufficient-payout', cost, balance: this.payoutBalanceWei };
        }

        this.payoutBalanceWei -= cost;
        const pixel: QuaiAxeWallPixel = { x, y, color, painter, paintedAt: Date.now() };
        this.wallPixels.set(`${x},${y}`, pixel);
        this.drawPixelToCanvas(pixel);
        this.emit({ type: 'paint', pixel, cost, snapshot: this.getSnapshot() });

        // Publish to the lobby when online; remote members apply it via
        // applyRemotePaint without being charged.
        try {
            this.engine?.spacetime?.pushQaxePixel?.({ x, y, color, painter });
        } catch { /* offline play — local-only pixel */ }

        return { ok: true, cost, balance: this.payoutBalanceWei, pixel };
    }

    /**
     * Apply a pixel painted by a remote player (multiplayer sync).
     * No local charge — the remote side already paid.
     */
    applyRemotePaint(pixel: QuaiAxeWallPixel): void {
        if (pixel.x < 0 || pixel.y < 0 || pixel.x >= QAXE_WALL_SIZE || pixel.y >= QAXE_WALL_SIZE) return;
        this.wallPixels.set(`${pixel.x},${pixel.y}`, pixel);
        this.drawPixelToCanvas(pixel);
        this.emit({ type: 'paint', pixel, cost: 0n, snapshot: this.getSnapshot() });
    }

    serializeWall(): string {
        return JSON.stringify(this.getWallPixels());
    }

    loadWall(json: string, remote = true): void {
        try {
            const pixels = JSON.parse(json) as QuaiAxeWallPixel[];
            for (const p of pixels) {
                if (remote) this.applyRemotePaint(p);
                else {
                    this.wallPixels.set(`${p.x},${p.y}`, p);
                    this.drawPixelToCanvas(p);
                }
            }
        } catch (e) {
            console.warn('QuaiAxeGame: failed to load wall', e);
        }
    }

    // ─── In-world visuals (browser only) ─────────────────────────

    /**
     * Spawn the Furnace: a dark crucible with an emissive molten core and
     * a point light whose intensity tracks furnaceHeat.
     */
    spawnFurnace(position: THREE.Vector3 = new THREE.Vector3(0, 0, 0)): THREE.Group {
        if (this.furnaceGroup) return this.furnaceGroup;

        const group = new THREE.Group();
        group.name = 'QuaiAxe Furnace';

        const body = new THREE.Mesh(
            new THREE.CylinderGeometry(1.2, 1.5, 2.4, 24, 1, true),
            new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.6, metalness: 0.8, side: THREE.DoubleSide }),
        );
        body.position.y = 1.2;
        group.add(body);

        this.furnaceCoreMat = new THREE.MeshStandardMaterial({
            color: 0xff5500, emissive: 0xff3300, emissiveIntensity: 0.2,
        });
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.85, 24, 16), this.furnaceCoreMat);
        core.position.y = 2.1;
        core.name = 'Furnace Core';
        group.add(core);

        this.furnaceLight = new THREE.PointLight(0xff6600, 0.5, 30);
        this.furnaceLight.position.y = 2.6;
        group.add(this.furnaceLight);

        group.position.copy(position);
        this.furnaceGroup = group;
        this.engine?.scene?.add(group);
        return group;
    }

    /**
     * Spawn the Furnace Wall: a 32×32 canvas-texture plane. Painted pixels
     * render immediately; the same canvas backs multiplayer sync.
     */
    spawnFurnaceWall(
        position: THREE.Vector3 = new THREE.Vector3(0, 3, 0),
        rotationY = 0,
        worldSize = 8,
    ): THREE.Mesh | null {
        if (this.wallMesh) return this.wallMesh;
        if (typeof document === 'undefined') return null; // headless (tests)

        this.wallCanvas = document.createElement('canvas');
        this.wallCanvas.width = QAXE_WALL_SIZE;
        this.wallCanvas.height = QAXE_WALL_SIZE;
        this.wallCtx = this.wallCanvas.getContext('2d');
        if (this.wallCtx) {
            this.wallCtx.fillStyle = '#0b0b10';
            this.wallCtx.fillRect(0, 0, QAXE_WALL_SIZE, QAXE_WALL_SIZE);
            for (const p of this.wallPixels.values()) this.drawPixelToCanvas(p);
        }

        this.wallTexture = new THREE.CanvasTexture(this.wallCanvas);
        this.wallTexture.magFilter = THREE.NearestFilter;
        this.wallTexture.minFilter = THREE.NearestFilter;

        const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(worldSize, worldSize),
            new THREE.MeshBasicMaterial({ map: this.wallTexture }),
        );
        mesh.name = 'QuaiAxe Furnace Wall';
        mesh.position.copy(position);
        mesh.rotation.y = rotationY;

        // Frame
        const frame = new THREE.Mesh(
            new THREE.BoxGeometry(worldSize + 0.3, worldSize + 0.3, 0.1),
            new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.7, metalness: 0.6 }),
        );
        frame.position.z = -0.06;
        mesh.add(frame);

        this.wallMesh = mesh;
        this.engine?.scene?.add(mesh);
        return mesh;
    }

    private drawPixelToCanvas(p: QuaiAxeWallPixel): void {
        if (!this.wallCtx) return;
        this.wallCtx.fillStyle = p.color;
        this.wallCtx.fillRect(p.x, p.y, 1, 1);
        if (this.wallTexture) this.wallTexture.needsUpdate = true;
    }

    // ─── Per-frame update ────────────────────────────────────────

    update(delta: number): void {
        // Heat decays toward cold
        this.furnaceHeat = Math.max(0, this.furnaceHeat - delta * 0.12);

        if (this.furnaceCoreMat) {
            this.furnaceCoreMat.emissiveIntensity = 0.2 + this.furnaceHeat * 2.2;
        }
        if (this.furnaceLight) {
            this.furnaceLight.intensity = 0.5 + this.furnaceHeat * 40;
        }
    }

    // ─── Snapshot ────────────────────────────────────────────────

    getSnapshot(): QuaiAxeSnapshot {
        const t = this.miner.telemetry;
        const q = (wei: bigint) => (Number(wei) / Number(QUAI_WEI)).toFixed(4);
        return {
            minerState: t.state,
            hashrate: t.hashrate,
            hashrate1m: t.hashrate1m,
            hashrate15m: t.hashrate15m,
            sharesAccepted: t.sharesAccepted,
            sharesRejected: t.sharesRejected,
            acceptanceBps: this.miner.acceptanceBps,
            burnSharePercent: this.miner.burnSharePercent,
            pendingGross: q(this.pendingGrossWei),
            payoutBalance: q(this.payoutBalanceWei),
            totalMined: q(this.totalMinedWei),
            totalBurned: q(this.totalBurnBuyWei),
            totalFees: q(this.totalFeeWei),
            totalGas: q(this.totalGasWei),
            totalPaidOut: q(this.totalPayoutWei),
            burnBatches: this.burnLog.length,
            furnaceHeat: this.furnaceHeat,
            wallPixelsPainted: this.wallPixels.size,
            simulated: t.state === 'SIMULATING',
        };
    }
}
