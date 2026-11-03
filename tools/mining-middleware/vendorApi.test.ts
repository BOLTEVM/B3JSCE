/**
 * Tests for the vendor API normalizer — fixture payloads in the shapes
 * real QUAI miners actually emit.
 */

import { describe, test, expect } from 'bun:test';
import { normalizeVendorPayload } from './adapters/vendorApi';

// XMRig-compatible summary (Rigel ≥1.20, XMRig, many KawPow miners)
const XMRIG_STYLE = {
    hashrate: { total: [39514061, 39400000, 40100000] },
    results: {
        diff_current: 4000000000,
        shares_good: 118,
        shares_total: 121,
        hw_errors: 2,
    },
    uptime: 3600,
};

// Rigel REST style (/api/v1/status)
const RIGEL_REST_STYLE = {
    gpus: [
        { name: 'RTX 3080', hashrate: 25000000 },
        { name: 'RTX 3070', hashrate: 15000000 },
    ],
    pools: [
        { url: 'stratum+tcp://quai.pool:3333', difficulty: 4e9, shares: { accepted: 40, rejected: 1, stale: 1 } },
        { url: 'stratum+tcp://backup.pool:3333', difficulty: 4e9, shares: { accepted: 8, rejected: 0, stale: 0 } },
    ],
};

// Flat shape (already normalized)
const FLAT = {
    hashrate: 12000000,
    shares_accepted: 7,
    shares_rejected: 1,
    difficulty: 2e9,
    hardware_errors: 0,
    uptime_sec: 60,
};

describe('normalizeVendorPayload', () => {
    test('XMRig-compatible payload maps to the wire format', () => {
        const p = normalizeVendorPayload(XMRIG_STYLE);
        expect(p.hashrate).toBe(39514061);
        expect(p.shares_accepted).toBe(118);
        expect(p.shares_rejected).toBe(3); // 121 total − 118 good
        expect(p.difficulty).toBe(4e9);
        expect(p.hardware_errors).toBe(2);
        expect(p.uptime_sec).toBe(3600);
        expect(p.running).toBe(true);
    });

    test('Rigel REST payload sums devices and pools', () => {
        const p = normalizeVendorPayload(RIGEL_REST_STYLE);
        expect(p.hashrate).toBe(40000000); // 25M + 15M
        expect(p.shares_accepted).toBe(48); // 40 + 8
        expect(p.shares_rejected).toBe(2);  // 1 rejected + 1 stale
        expect(p.difficulty).toBe(4e9);
    });

    test('flat payload passes through', () => {
        const p = normalizeVendorPayload(FLAT);
        expect(p.hashrate).toBe(12000000);
        expect(p.shares_accepted).toBe(7);
        expect(p.shares_rejected).toBe(1);
        expect(p.difficulty).toBe(2e9);
    });

    test('running:false zeroes hashrate but preserves counters', () => {
        const p = normalizeVendorPayload(XMRIG_STYLE, { running: false });
        expect(p.hashrate).toBe(0);
        expect(p.shares_accepted).toBe(118);
        expect(p.running).toBe(false);
    });

    test('garbage in → safe zeros, no throw', () => {
        for (const bad of [null, undefined, {}, { hashrate: 'nope' }, { results: null }, []]) {
            const p = normalizeVendorPayload(bad);
            expect(p.hashrate).toBe(0);
            expect(p.shares_accepted).toBe(0);
            expect(p.running).toBe(true);
        }
    });

    test('XMRig instant-window fallback: total[0]=0 falls back to total[1]', () => {
        const p = normalizeVendorPayload({
            hashrate: { total: [0, 25000000, 24000000] },
            results: { shares_good: 1, shares_total: 1 },
        });
        expect(p.hashrate).toBe(25000000);
    });
});
