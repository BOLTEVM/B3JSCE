/**
 * B3JS Mining Middleware Stub — local QUAI miner telemetry server.
 *
 * Simulates a rig with MinerSim (Poisson share process over a
 * mean-reverting hashrate walk) and serves the B3JS middleware protocol
 * via the shared serveTelemetry helper. See docs/mining-middleware.md.
 *
 * This is a DEVELOPMENT stub. It mines nothing; it exists so the
 * real-transport code path (WS framing, reconnects, stall watchdogs)
 * can be tested end-to-end without a GPU. For real hardware, see
 * adapter.ts (`bun run miner:adapter`).
 *
 * Run:  bun run miner:stub     (from repo root)
 * Env:  QAXE_MW_WS_PORT (8001), QAXE_MW_HTTP_PORT (8081),
 *       QAXE_MW_HASHRATE (40e6), QAXE_MW_SEED (random if unset)
 */

import { MinerSim, DEFAULT_RIG } from './sim';
import { serveTelemetry } from './serve';

const SEED = process.env.QAXE_MW_SEED !== undefined ? Number(process.env.QAXE_MW_SEED) : undefined;

const sim = new MinerSim({
    ...DEFAULT_RIG,
    nominalHashrate: Number(process.env.QAXE_MW_HASHRATE ?? DEFAULT_RIG.nominalHashrate),
}, SEED);

// Advance the sim once per second regardless of client count.
setInterval(() => sim.tick(1), 1000);

serveTelemetry(() => sim.payload(), {
    wsPort: Number(process.env.QAXE_MW_WS_PORT ?? 8001),
    httpPort: Number(process.env.QAXE_MW_HTTP_PORT ?? 8081),
    label: 'stub',
});

console.log(`[stub] rig → ${(sim.profile.nominalHashrate / 1e6).toFixed(0)} MH/s nominal, share diff ${sim.profile.shareDifficulty.toExponential(1)} (≈${sim.expectedShareIntervalSec.toFixed(0)}s/share)`);
