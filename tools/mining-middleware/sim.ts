/**
 * Mining Middleware Simulator — pure telemetry model, no I/O.
 *
 * Produces the exact payload shape the engine's QuaiMinerClient ingests:
 *   { hashrate, shares_accepted, shares_rejected, difficulty, hardware_errors }
 *
 * The model is deliberately realistic enough to exercise the client's
 * machinery honestly:
 *   - Hashrate is a random walk around the rig's nominal rate (per-tick
 *     drift, bounded), NOT white noise — 1m/15m averages should behave
 *     like a real rig's.
 *   - Shares arrive on a Poisson process: expected interval =
 *     shareDifficulty / hashrate seconds. The simulator draws from an
 *     exponential distribution per tick, so share cadence emerges from
 *     the same math as real mining rather than a scripted timer.
 *   - ~3% of shares are rejected (stale / low-diff), occasional hardware
 *     errors accumulate.
 *
 * Seeded RNG keeps tests deterministic.
 */

export interface RigProfile {
    /** Nominal hashrate in H/s (e.g. 40e6 for a mid GPU). */
    nominalHashrate: number;
    /** Pool share difficulty (expected hashes per share). */
    shareDifficulty: number;
    /** Per-tick relative drift of the hashrate walk (e.g. 0.02 = ±2%). */
    drift: number;
    /** Probability a found share is rejected. */
    rejectRate: number;
    /** Hardware errors per tick (Poisson-ish expectation). */
    hwErrorRate: number;
}

export const DEFAULT_RIG: RigProfile = {
    nominalHashrate: 40e6,
    shareDifficulty: 4e9,   // ≈ 100s between shares at 40 MH/s
    drift: 0.02,
    rejectRate: 0.03,
    hwErrorRate: 0.001,
};

export interface TelemetryPayload {
    hashrate: number;
    shares_accepted: number;
    shares_rejected: number;
    difficulty: number;
    hardware_errors: number;
    uptime_sec: number;
    /** true while the rig is hashing. */
    running: boolean;
}

/** Deterministic RNG (mulberry32) so tests can pin sequences. */
export function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export class MinerSim {
    public hashrate: number;
    public sharesAccepted = 0;
    public sharesRejected = 0;
    public hardwareErrors = 0;
    public running = true;

    /** Progress toward the next share, in hashes. */
    private shareProgress = 0;
    /** Draw threshold: next share lands when progress crosses this. */
    private nextShareAt: number;
    private startedAt = Date.now();
    private readonly rand: () => number;

    constructor(
        public readonly profile: RigProfile = DEFAULT_RIG,
        seed?: number,
    ) {
        this.hashrate = profile.nominalHashrate;
        this.rand = seed === undefined ? Math.random : mulberry32(seed);
        this.nextShareAt = this.drawShareInterval();
    }

    /**
     * Draw the next share interval in hashes — exponential distribution
     * with mean = shareDifficulty, which is exactly how Poisson mining works.
     */
    private drawShareInterval(): number {
        return -Math.log(1 - this.rand()) * this.profile.shareDifficulty;
    }

    /** Advance the simulation by `dtSec` seconds. */
    tick(dtSec = 1): void {
        if (!this.running) return;

        // Hashrate random walk: multiplicative drift, mean-reverting to nominal
        const drift = (this.rand() - 0.5) * 2 * this.profile.drift;
        const meanRevert = (this.profile.nominalHashrate - this.hashrate) / this.profile.nominalHashrate * 0.05;
        this.hashrate = Math.max(
            this.profile.nominalHashrate * 0.5,
            this.hashrate * (1 + drift + meanRevert),
        );

        // Hashes done this tick advance toward the next share
        this.shareProgress += this.hashrate * dtSec;
        while (this.shareProgress >= this.nextShareAt) {
            this.shareProgress -= this.nextShareAt;
            this.nextShareAt = this.drawShareInterval();
            if (this.rand() < this.profile.rejectRate) this.sharesRejected++;
            else this.sharesAccepted++;
        }

        // Occasional hardware errors
        if (this.rand() < this.profile.hwErrorRate) this.hardwareErrors++;
    }

    /** Current telemetry payload in the middleware's wire format. */
    payload(): TelemetryPayload {
        return {
            hashrate: this.running ? Math.round(this.hashrate) : 0,
            shares_accepted: this.sharesAccepted,
            shares_rejected: this.sharesRejected,
            difficulty: this.profile.shareDifficulty,
            hardware_errors: this.hardwareErrors,
            uptime_sec: Math.floor((Date.now() - this.startedAt) / 1000),
            running: this.running,
        };
    }

    /** Expected seconds between shares at the current hashrate. */
    get expectedShareIntervalSec(): number {
        return this.profile.shareDifficulty / this.hashrate;
    }
}
