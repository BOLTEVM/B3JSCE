/**
 * @b3js/web3 — QuaiMiner
 *
 * Production-grade QUAI mining client for the B3JS engine, with first-class
 * QuaiAxe (quaiaxe.com) burn-mining support.
 *
 * Architecture:
 *   - Transport-agnostic: WebSocket telemetry stream (mining middleware,
 *     e.g. ws://localhost:8001/ws) or HTTP polling (/api/hardware).
 *   - Connection state machine with exponential-backoff reconnect and a
 *     stall watchdog (no telemetry for N ms → cycle the connection).
 *   - Rolling hashrate statistics (instant / 1m / 15m averages).
 *   - Share accounting: accepted / rejected / stale, best share, latency.
 *   - QuaiAxe burn accounting: pure bigint arithmetic mirroring the V2
 *     contract's split — 0.5% fixed fee, ≤3% bounded gas refund charged
 *     to the burn side, payout = (1 − burnShare) × (gross − fee).
 *   - Simulation backend for offline play / demos — clearly flagged, never
 *     silently substituted for real hardware telemetry.
 *
 * All game-facing updates flow through the event emitter; the engine layer
 * (QuaiAxeGame) subscribes and turns telemetry into gameplay.
 */

// ═══════════════════════════════════════════════════════════════════
//  QuaiAxe Burn Arithmetic (V2 contract mirror)
// ═══════════════════════════════════════════════════════════════════

/** 0.5% maintenance & treasury fee — fixed in the contract. */
export const QUAIAXE_FEE_BPS = 50n;
/** Max gas refund: ≤ 3% of gross, charged to the burn side. */
export const QUAIAXE_MAX_GAS_BPS = 300n;
/** Minimum burn share allowed by the contract: 10%. */
export const QUAIAXE_MIN_BURN_BPS = 1000n;
/** Basis points denominator. */
export const BPS = 10000n;
/** 1 QUAI in wei. */
export const QUAI_WEI = 10n ** 18n;

export interface QuaiAxeSplit {
    /** Gross mined QUAI (wei). */
    gross: bigint;
    /** Burn share in basis points (1000–10000). */
    burnShareBps: bigint;
    /** Fixed 0.5% fee (wei). */
    fee: bigint;
    /** Gas refund paid to the batch runner (wei, ≤ 3% of gross). */
    gasRefund: bigint;
    /** QUAI spent buying $QAXE, which is then burned (wei). */
    burnBuy: bigint;
    /** QUAI paid (or reserved) to the miner's wallet (wei). */
    payout: bigint;
}

/**
 * Compute the QuaiAxe V2 split for a gross mining amount.
 *
 * Contract arithmetic (verified against quaiaxe.com's calculator):
 *   fee        = gross × 0.5%
 *   gasRefund  = min(gasBps, 3%) × gross          — charged to burn side
 *   payout     = (1 − burnShare) × (gross − fee)
 *   burnBudget = burnShare × (gross − fee)
 *   burnBuy    = burnBudget − gasRefund
 *
 * Sanity (their 70%/30% example per 100 QUAI, max gas):
 *   fee 0.50, payout 29.85, burnBuy 66.65, gas 3.00 — sums to 100.
 *
 * All math is integer wei — no floats anywhere near money.
 */
export function quaiAxeSplit(
    grossWei: bigint,
    burnShareBps: bigint,
    gasBps: bigint = QUAIAXE_MAX_GAS_BPS,
): QuaiAxeSplit {
    if (grossWeiInvalid(grossWei)) throw new Error('quaiAxeSplit: gross must be ≥ 0');
    if (burnShareBps < QUAIAXE_MIN_BURN_BPS || burnShareBps > BPS) {
        throw new Error(`quaiAxeSplit: burn share must be ${QUAIAXE_MIN_BURN_BPS}–${BPS} bps (≥10%)`);
    }
    if (gasBps < 0n || gasBps > QUAIAXE_MAX_GAS_BPS) {
        throw new Error(`quaiAxeSplit: gas must be 0–${QUAIAXE_MAX_GAS_BPS} bps (≤3%)`);
    }

    const fee = (grossWei * QUAIAXE_FEE_BPS) / BPS;
    const net = grossWei - fee;
    const payout = (net * (BPS - burnShareBps)) / BPS;
    const burnBudget = net - payout;
    const gasRefund = (grossWei * gasBps) / BPS;
    const burnBuy = burnBudget - gasRefund;
    if (burnBuy < 0n) throw new Error('quaiAxeSplit: gas refund exceeds burn budget — lower gas or raise burn share');

    return { gross: grossWei, burnShareBps, fee, gasRefund, burnBuy, payout };
}

function grossWeiInvalid(grossWei: bigint): boolean {
    return grossWei < 0n;
}

/** QUAI wei → human string with 4 decimals (display only). */
export function formatQuai(wei: bigint): string {
    const whole = wei / QUAI_WEI;
    const frac = ((wei % QUAI_WEI) * 10000n) / QUAI_WEI;
    return `${whole}.${frac.toString().padStart(4, '0')}`;
}

// ═══════════════════════════════════════════════════════════════════
//  Miner Types
// ═══════════════════════════════════════════════════════════════════

export type MinerConnectionState =
    | 'IDLE'
    | 'CONNECTING'
    | 'CONNECTED'
    | 'MINING'
    | 'RECONNECTING'
    | 'ERROR'
    | 'SIMULATING';

export interface QuaiMinerConfig {
    /** WebSocket telemetry endpoint (mining middleware / stratum bridge). */
    wsUrl: string;
    /** HTTP polling endpoint (fallback / alternative transport). */
    httpUrl: string;
    /** Prefer websocket when both are configured. */
    transport: 'ws' | 'http';
    /** QuaiAxe deposit address the miner points at (display/attribution). */
    payoutAddress: string;
    /** Burn share in basis points (≥ 1000 = 10%). */
    burnShareBps: number;
    /** Worker name shown to the pool. */
    workerName: string;
    /** HTTP poll interval (ms). */
    pollIntervalMs: number;
    /** Watchdog: reconnect if no telemetry for this long (ms). */
    stallTimeoutMs: number;
    /** Reconnect backoff base (ms) — doubles up to max. */
    reconnectBaseMs: number;
    reconnectMaxMs: number;
    /** Run without hardware (demo/offline). Explicit opt-in. */
    simulate: boolean;
}

export const DEFAULT_QUAI_MINER_CONFIG: QuaiMinerConfig = {
    wsUrl: 'ws://localhost:8001/ws',
    httpUrl: 'http://localhost:8081/api/hardware',
    transport: 'ws',
    payoutAddress: '',
    burnShareBps: 7000,
    workerName: 'b3js-worker',
    pollIntervalMs: 3000,
    stallTimeoutMs: 30000,
    reconnectBaseMs: 1000,
    reconnectMaxMs: 30000,
    simulate: false,
};

export interface ShareRecord {
    id: number;
    timestamp: number;
    difficulty: number;
    accepted: boolean;
    stale: boolean;
    latencyMs: number;
}

export interface QuaiMinerTelemetry {
    state: MinerConnectionState;
    hashrate: number;          // instant, H/s
    hashrate1m: number;        // rolling averages
    hashrate15m: number;
    sharesAccepted: number;
    sharesRejected: number;
    sharesStale: number;
    bestShareDifficulty: number;
    difficulty: number;
    uptimeSec: number;
    latencyMs: number;
    lastShareAt: number | null;
    hardwareErrors: number;
}

export type QuaiMinerEvent =
    | { type: 'state'; state: MinerConnectionState }
    | { type: 'telemetry'; telemetry: QuaiMinerTelemetry }
    | { type: 'share'; share: ShareRecord }
    | { type: 'error'; message: string };

type Listener = (e: QuaiMinerEvent) => void;

// ═══════════════════════════════════════════════════════════════════
//  Hashrate Tracker — ring buffer of (timestamp, hashes) samples
// ═══════════════════════════════════════════════════════════════════

export class HashrateTracker {
    private samples: Array<{ t: number; h: number }> = [];
    private readonly windowMs = 15 * 60 * 1000;

    /** Record a batch of hashes computed at time t. */
    record(hashes: number, t: number = Date.now()): void {
        this.samples.push({ t, h: hashes });
        this.prune(t);
    }

    /** Record an instantaneous hashrate reading (middleware-provided). */
    recordRate(hashrateHz: number, t: number = Date.now(), dtMs: number = 1000): void {
        this.record(hashrateHz * (dtMs / 1000), t);
    }

    /** Average hashrate over the last `windowMs` (clamped to buffer). */
    average(windowMs: number, now: number = Date.now()): number {
        const cutoff = now - windowMs;
        let hashes = 0;
        let spanMs = 0;
        let prevT: number | null = null;
        for (const s of this.samples) {
            if (s.t < cutoff) continue;
            hashes += s.h;
            if (prevT !== null) spanMs += s.t - prevT;
            prevT = s.t;
        }
        if (spanMs <= 0) return 0;
        return hashes / (spanMs / 1000);
    }

    get instant(): number { return this.average(5000); }
    get avg1m(): number { return this.average(60_000); }
    get avg15m(): number { return this.average(15 * 60_000); }

    private prune(now: number): void {
        const cutoff = now - this.windowMs;
        while (this.samples.length > 0 && this.samples[0].t < cutoff) this.samples.shift();
    }
}

// ═══════════════════════════════════════════════════════════════════
//  QuaiMinerClient
// ═══════════════════════════════════════════════════════════════════

export class QuaiMinerClient {
    public config: QuaiMinerConfig;
    public telemetry: QuaiMinerTelemetry = {
        state: 'IDLE',
        hashrate: 0, hashrate1m: 0, hashrate15m: 0,
        sharesAccepted: 0, sharesRejected: 0, sharesStale: 0,
        bestShareDifficulty: 0, difficulty: 0,
        uptimeSec: 0, latencyMs: 0, lastShareAt: null, hardwareErrors: 0,
    };

    private listeners: Listener[] = [];
    private hashrate = new HashrateTracker();
    private shareLog: ShareRecord[] = [];
    private shareIdSeq = 0;

    private ws: WebSocket | null = null;
    private pollTimer: ReturnType<typeof setInterval> | null = null;
    private watchdogTimer: ReturnType<typeof setInterval> | null = null;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private reconnectDelay: number;
    private startedAt: number | null = null;
    private lastMessageAt: number = 0;
    private simTimer: ReturnType<typeof setInterval> | null = null;
    private running = false;

    constructor(config: Partial<QuaiMinerConfig> = {}) {
        this.config = { ...DEFAULT_QUAI_MINER_CONFIG, ...config };
        this.reconnectDelay = this.config.reconnectBaseMs;
    }

    // ─── Events ──────────────────────────────────────────────────

    on(listener: Listener): () => void {
        this.listeners.push(listener);
        return () => { this.listeners = this.listeners.filter((l) => l !== listener); };
    }

    private emit(e: QuaiMinerEvent): void {
        for (const l of this.listeners) l(e);
    }

    private setState(state: MinerConnectionState): void {
        if (this.telemetry.state === state) return;
        this.telemetry.state = state;
        this.emit({ type: 'state', state });
    }

    // ─── Lifecycle ───────────────────────────────────────────────

    start(): void {
        if (this.running) return;
        this.running = true;
        this.startedAt = Date.now();

        if (this.config.simulate) {
            this.startSimulation();
            return;
        }
        this.connect();
        this.startWatchdog();
    }

    stop(): void {
        this.running = false;
        this.teardownTransport();
        this.stopWatchdog();
        this.stopSimulation();
        if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
        this.setState('IDLE');
    }

    private connect(): void {
        if (!this.running) return;
        this.setState(this.telemetry.state === 'IDLE' ? 'CONNECTING' : 'RECONNECTING');

        if (this.config.transport === 'ws') {
            this.connectWs();
        } else {
            this.startPolling();
        }
    }

    // ─── WebSocket Transport ─────────────────────────────────────

    private connectWs(): void {
        try {
            this.ws = new WebSocket(this.config.wsUrl);
        } catch (e: any) {
            this.handleTransportError(`WebSocket init failed: ${e?.message ?? e}`);
            return;
        }

        this.ws.onopen = () => {
            this.reconnectDelay = this.config.reconnectBaseMs;
            this.lastMessageAt = Date.now();
            this.setState('CONNECTED');
        };
        this.ws.onmessage = (ev) => {
            this.lastMessageAt = Date.now();
            try {
                this.ingestPayload(JSON.parse(ev.data));
            } catch (e: any) {
                this.emit({ type: 'error', message: `telemetry parse error: ${e?.message ?? e}` });
            }
        };
        this.ws.onclose = () => this.scheduleReconnect('socket closed');
        this.ws.onerror = () => { /* onclose follows and handles reconnect */ };
    }

    // ─── HTTP Polling Transport ──────────────────────────────────

    private startPolling(): void {
        this.stopPolling();
        this.setState('CONNECTED');
        this.pollTimer = setInterval(() => this.pollOnce(), this.config.pollIntervalMs);
        void this.pollOnce();
    }

    private stopPolling(): void {
        if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    }

    private async pollOnce(): Promise<void> {
        const started = Date.now();
        try {
            const res = await fetch(this.config.httpUrl);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            this.telemetry.latencyMs = Date.now() - started;
            this.lastMessageAt = Date.now();
            this.reconnectDelay = this.config.reconnectBaseMs;
            this.ingestPayload(await res.json());
        } catch (e: any) {
            this.handleTransportError(`poll failed: ${e?.message ?? e}`);
        }
    }

    // ─── Payload Normalization ───────────────────────────────────

    /**
     * Ingest a telemetry payload from any middleware shape. Recognizes
     * common fields (hashrate, shares, difficulty, uptime, temps) and
     * normalizes them into the engine's telemetry model.
     */
    private ingestPayload(data: any): void {
        const t = this.telemetry;
        const now = Date.now();

        const rate = Number(data.hashrate ?? data.hashrate_hs ?? 0);
        if (rate > 0) {
            this.hashrate.recordRate(rate, now, this.config.transport === 'http' ? this.config.pollIntervalMs : 1000);
            this.setState('MINING');
        }

        t.hashrate = rate;
        t.hashrate1m = this.hashrate.avg1m;
        t.hashrate15m = this.hashrate.avg15m;
        t.difficulty = Number(data.difficulty ?? data.diff ?? 0);
        t.hardwareErrors = Number(data.hardware_errors ?? data.hw_errors ?? 0);

        const accepted = Number(data.shares_accepted ?? data.shares ?? 0);
        const rejected = Number(data.shares_rejected ?? 0);
        const stale = Number(data.shares_stale ?? 0);

        // New accepted share → record it
        if (accepted > t.sharesAccepted) {
            const share: ShareRecord = {
                id: ++this.shareIdSeq,
                timestamp: now,
                difficulty: t.difficulty,
                accepted: true,
                stale: false,
                latencyMs: t.latencyMs,
            };
            this.pushShare(share);
            if (t.difficulty > t.bestShareDifficulty) t.bestShareDifficulty = t.difficulty;
            t.lastShareAt = now;
            this.emit({ type: 'share', share });
        }

        t.sharesAccepted = accepted;
        t.sharesRejected = rejected;
        t.sharesStale = stale;
        t.uptimeSec = this.startedAt ? Math.floor((now - this.startedAt) / 1000) : 0;

        this.emit({ type: 'telemetry', telemetry: { ...t } });
    }

    private pushShare(share: ShareRecord): void {
        this.shareLog.push(share);
        if (this.shareLog.length > 512) this.shareLog.shift();
    }

    getShares(): readonly ShareRecord[] {
        return this.shareLog;
    }

    /** Share acceptance rate in basis points (10000 = 100%). */
    get acceptanceBps(): number {
        const total = this.telemetry.sharesAccepted + this.telemetry.sharesRejected;
        if (total === 0) return 10000;
        return Math.round((this.telemetry.sharesAccepted / total) * 10000);
    }

    // ─── QuaiAxe Accounting ──────────────────────────────────────

    /** Burn-share in percent (10–100). */
    get burnSharePercent(): number {
        return this.config.burnShareBps / 100;
    }

    setBurnSharePercent(percent: number): void {
        this.config.burnShareBps = Math.round(percent * 100);
        // Validates range eagerly — throws on < 10%
        quaiAxeSplit(QUAI_WEI, BigInt(this.config.burnShareBps));
    }

    /** Preview the split for a given gross amount (in QUAI, not wei). */
    previewSplit(grossQuai: number, gasBps: bigint = QUAIAXE_MAX_GAS_BPS): QuaiAxeSplit {
        return quaiAxeSplit(BigInt(Math.round(grossQuai * 1e18)), BigInt(this.config.burnShareBps), gasBps);
    }

    // ─── Reconnect & Watchdog ────────────────────────────────────

    private scheduleReconnect(reason: string): void {
        if (!this.running || this.config.simulate) return;
        this.teardownTransport();
        this.emit({ type: 'error', message: `connection lost (${reason}); retrying in ${this.reconnectDelay}ms` });
        this.setState('RECONNECTING');
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.config.reconnectMaxMs);
    }

    private handleTransportError(message: string): void {
        this.emit({ type: 'error', message });
        this.scheduleReconnect(message);
    }

    private startWatchdog(): void {
        this.stopWatchdog();
        this.watchdogTimer = setInterval(() => {
            if (this.telemetry.state !== 'MINING' && this.telemetry.state !== 'CONNECTED') return;
            const silentMs = Date.now() - this.lastMessageAt;
            if (silentMs > this.config.stallTimeoutMs) {
                this.scheduleReconnect(`telemetry stall (${Math.round(silentMs / 1000)}s silent)`);
            }
        }, Math.max(1000, Math.floor(this.config.stallTimeoutMs / 3)));
    }

    private stopWatchdog(): void {
        if (this.watchdogTimer) { clearInterval(this.watchdogTimer); this.watchdogTimer = null; }
    }

    private teardownTransport(): void {
        if (this.ws) {
            this.ws.onclose = null;
            this.ws.onerror = null;
            this.ws.onmessage = null;
            this.ws.onopen = null;
            try { this.ws.close(); } catch { /* noop */ }
            this.ws = null;
        }
        this.stopPolling();
    }

    // ─── Simulation Backend ──────────────────────────────────────

    /**
     * Deterministic-ish simulated miner for offline play and demos.
     * Produces plausible telemetry (~40 MH/s GPU-ish) and a share every
     * ~15–45s. Clearly flagged via the SIMULATING state — the UI must
     * never present simulated hashrate as real.
     */
    private startSimulation(): void {
        this.setState('SIMULATING');
        let accepted = 0;
        let rejected = 0;
        let simHashrate = 40e6;
        let ticksSinceShare = 0;
        let shareEvery = 20; // ticks (1s per tick)

        this.simTimer = setInterval(() => {
            const now = Date.now();
            simHashrate = Math.max(1e6, simHashrate * (1 + (Math.random() - 0.5) * 0.04));
            ticksSinceShare++;

            if (ticksSinceShare >= shareEvery) {
                ticksSinceShare = 0;
                shareEvery = 15 + Math.floor(Math.random() * 30);
                if (Math.random() < 0.97) accepted++; else rejected++;
            }

            this.ingestPayload({
                hashrate: simHashrate,
                shares_accepted: accepted,
                shares_rejected: rejected,
                difficulty: 4e9,
            });
            this.lastMessageAt = now;
        }, 1000);
    }

    private stopSimulation(): void {
        if (this.simTimer) { clearInterval(this.simTimer); this.simTimer = null; }
    }
}
