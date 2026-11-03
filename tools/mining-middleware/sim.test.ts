/**
 * Tests for the mining middleware simulator — deterministic via seeded RNG.
 */

import { describe, test, expect } from 'bun:test';
import { MinerSim, DEFAULT_RIG, mulberry32 } from './sim';

describe('MinerSim', () => {
    test('seeded runs are deterministic', () => {
        const a = new MinerSim(DEFAULT_RIG, 42);
        const b = new MinerSim(DEFAULT_RIG, 42);
        for (let i = 0; i < 100; i++) { a.tick(1); b.tick(1); }
        expect(a.payload()).toEqual(b.payload());
    });

    test('hashrate walk stays near nominal and positive', () => {
        const sim = new MinerSim(DEFAULT_RIG, 7);
        for (let i = 0; i < 1000; i++) sim.tick(1);
        expect(sim.hashrate).toBeGreaterThan(DEFAULT_RIG.nominalHashrate * 0.4);
        // Mean-reverting: after 1000s the walk should be within ±25% of nominal
        expect(Math.abs(sim.hashrate - DEFAULT_RIG.nominalHashrate) / DEFAULT_RIG.nominalHashrate)
            .toBeLessThan(0.25);
    });

    test('shares arrive on a Poisson process with the expected mean interval', () => {
        const sim = new MinerSim(DEFAULT_RIG, 1234);
        // Simulate 24 hours at 1s ticks. Expected shares = 86400 / (4e9/40e6) = 864
        for (let i = 0; i < 86400; i++) sim.tick(1);
        const total = sim.sharesAccepted + sim.sharesRejected;
        // Statistical sanity: within ±20% of the Poisson expectation
        expect(total).toBeGreaterThan(864 * 0.8);
        expect(total).toBeLessThan(864 * 1.2);
        // Reject rate ≈ 3%
        expect(sim.sharesRejected / total).toBeLessThan(0.08);
    });

    test('payload matches the middleware wire format', () => {
        const sim = new MinerSim(DEFAULT_RIG, 5);
        sim.tick(1);
        const p = sim.payload();
        expect(typeof p.hashrate).toBe('number');
        expect(typeof p.shares_accepted).toBe('number');
        expect(typeof p.shares_rejected).toBe('number');
        expect(p.difficulty).toBe(DEFAULT_RIG.shareDifficulty);
        expect(p.running).toBe(true);
        expect(p.uptime_sec).toBeGreaterThanOrEqual(0);
    });

    test('stopped rig reports zero hashrate and accrues nothing', () => {
        const sim = new MinerSim(DEFAULT_RIG, 9);
        sim.running = false;
        const before = sim.sharesAccepted;
        sim.tick(1);
        expect(sim.payload().hashrate).toBe(0);
        expect(sim.sharesAccepted).toBe(before);
    });

    test('mulberry32 produces values in [0,1)', () => {
        const rand = mulberry32(1);
        for (let i = 0; i < 1000; i++) {
            const v = rand();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });
});
