/**
 * B3JS Mining Adapter — production bridge between a REAL QUAI miner
 * (Rigel ≥1.20, XMRig-compatible miners, …) and the engine.
 *
 * Polls the miner's own HTTP JSON API, normalizes it with
 * adapters/vendorApi.ts, and re-serves it as the B3JS mining middleware
 * protocol (WS :8001/ws + HTTP :8081/api/hardware) — the exact protocol
 * the development stub serves, so the engine cannot tell the difference.
 *
 * Miner setup: start your miner with its API enabled, e.g.
 *   rigel.exe -a quai -o stratum+tcp://<pool> -u <QUAIAXE_DEPOSIT_ADDR> \
 *             -w rig1 --api-bind 127.0.0.1:5000
 *
 * Run:  bun run miner:adapter
 * Env:  QUAI_MINER_API_URL   (default http://127.0.0.1:5000/)
 *       QUAI_MINER_API_PATHS (comma list, default "/,/summary,/api/v1/status")
 *       QAXE_MW_POLL_MS      (default 1000)
 *       QAXE_MW_WS_PORT / QAXE_MW_HTTP_PORT (default 8001 / 8081)
 *
 * Failure policy (per docs/mining-middleware.md §4): when the miner's API
 * is unreachable the adapter keeps serving the LAST good payload with
 * running:false — it never crashes on vendor errors.
 */

import { serveTelemetry } from './serve';
import { normalizeVendorPayload } from './adapters/vendorApi';
import type { TelemetryPayload } from './sim';

const API_URL = (process.env.QUAI_MINER_API_URL ?? 'http://127.0.0.1:5000').replace(/\/$/, '');
const API_PATHS = (process.env.QUAI_MINER_API_PATHS ?? '/,/summary,/api/v1/status').split(',');
const POLL_MS = Number(process.env.QAXE_MW_POLL_MS ?? 1000);

/** Last payload served. Starts as an honest "not running" zero state. */
let last: TelemetryPayload = {
    hashrate: 0,
    shares_accepted: 0,
    shares_rejected: 0,
    difficulty: 0,
    hardware_errors: 0,
    uptime_sec: 0,
    running: false,
};

let consecutiveErrors = 0;
let activePath: string | null = null;

async function pollOnce(): Promise<void> {
    // Try each known API path until one answers; remember the winner.
    const paths = activePath ? [activePath] : API_PATHS;

    for (const path of paths) {
        try {
            const res = await fetch(`${API_URL}${path}`, {
                signal: AbortSignal.timeout(Math.max(500, POLL_MS - 100)),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            last = normalizeVendorPayload(data, { running: true });
            if (activePath !== path) {
                activePath = path;
                console.log(`[adapter] miner API found at ${API_URL}${path}`);
            }
            if (consecutiveErrors > 0) {
                console.log(`[adapter] miner API recovered after ${consecutiveErrors} error(s)`);
            }
            consecutiveErrors = 0;
            return;
        } catch {
            // try next path
        }
    }

    // All paths failed — keep serving the last counters with running:false.
    consecutiveErrors++;
    if (consecutiveErrors === 1 || consecutiveErrors % 10 === 0) {
        console.warn(`[adapter] miner API unreachable at ${API_URL} (${consecutiveErrors} consecutive) — serving last known state, running:false`);
    }
    last = { ...last, hashrate: 0, running: false };
    activePath = null; // re-probe all paths next tick
}

async function main(): Promise<void> {
    await pollOnce(); // warm the first payload before serving
    setInterval(() => { void pollOnce(); }, POLL_MS);

    serveTelemetry(() => last, {
        wsPort: Number(process.env.QAXE_MW_WS_PORT ?? 8001),
        httpPort: Number(process.env.QAXE_MW_HTTP_PORT ?? 8081),
        label: 'adapter',
    });

    console.log(`[adapter] polling ${API_URL} (${API_PATHS.join(' ')}) every ${POLL_MS}ms`);
}

void main();
