/**
 * Vendor API normalizer — maps miner-specific HTTP API payloads onto the
 * B3JS mining middleware wire format (docs/mining-middleware.md §2).
 *
 * Supported shapes (first match wins per field):
 *   - XMRig-compatible (`hashrate.total[0]`, `results.shares_good`, …).
 *     Rigel ≥1.20 (the primary QUAI GPU miner) exposes an
 *     XMRig-compatible summary, as do many KawPow/ProgPow miners.
 *   - Rigel REST style (`gpus[].hashrate`, `pools[].shares.{accepted,rejected}`)
 *     for builds exposing the `/api/v1/status` shape.
 *   - Flat shape (already normalized) — pass-through for forward compat.
 *
 * Pure and defensive: unknown fields are ignored, missing fields fall
 * back to safe defaults. The adapter layer decides `running`.
 */

import type { TelemetryPayload } from '../sim';

function num(v: unknown, fallback = 0): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

/** Sum hashrate over a device list, tolerating missing entries. */
function sumDeviceHashrate(devices: unknown): number {
    if (!Array.isArray(devices)) return 0;
    let total = 0;
    for (const d of devices) total += num((d as any)?.hashrate);
    return total;
}

export function normalizeVendorPayload(
    data: any,
    opts: { running?: boolean; uptimeSec?: number } = {},
): TelemetryPayload {
    const running = opts.running ?? true;
    const uptime = opts.uptimeSec ?? num(data?.uptime ?? data?.uptime_sec);

    // ── Hashrate ────────────────────────────────────────────────
    let hashrate =
        num(data?.hashrate?.total?.[0])          // XMRig: instant window
        || num(data?.hashrate?.total?.[1])       // XMRig: 10s window fallback
        || sumDeviceHashrate(data?.devices)      // Rigel legacy: devices[]
        || sumDeviceHashrate(data?.gpus)         // Rigel REST: gpus[]
        || num(data?.hashrate)                   // flat
        || 0;

    // ── Shares ──────────────────────────────────────────────────
    let accepted = 0;
    let rejected = 0;

    const results = data?.results;
    if (results && (results.shares_good !== undefined || results.shares_total !== undefined)) {
        // XMRig-compatible
        accepted = num(results.shares_good);
        rejected = Math.max(0, num(results.shares_total) - accepted);
    } else {
        // Rigel REST: pools[0].shares.{accepted,rejected} (sum across pools)
        const pools = Array.isArray(data?.pools) ? data.pools : [];
        for (const p of pools) {
            accepted += num(p?.shares?.accepted);
            rejected += num(p?.shares?.rejected) + num(p?.shares?.stale);
        }
        if (pools.length === 0) {
            // Flat fallback
            accepted = num(data?.shares_accepted ?? data?.shares?.accepted);
            rejected = num(data?.shares_rejected ?? data?.shares?.rejected);
        }
    }

    // ── Difficulty ──────────────────────────────────────────────
    const difficulty =
        num(data?.results?.diff_current)         // XMRig
        || num(data?.pools?.[0]?.difficulty)     // Rigel REST
        || num(data?.difficulty)                 // flat
        || 0;

    // ── Hardware errors ─────────────────────────────────────────
    const hwErrors =
        num(data?.results?.hw_errors)
        || num(data?.hardware_errors)
        || num(data?.hw_errors)
        || 0;

    return {
        hashrate: running ? Math.round(hashrate) : 0,
        shares_accepted: accepted,
        shares_rejected: rejected,
        difficulty,
        hardware_errors: hwErrors,
        uptime_sec: uptime,
        running,
    };
}
