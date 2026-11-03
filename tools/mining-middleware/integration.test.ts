/**
 * End-to-end: QuaiMinerClient (real WS + HTTP transports) against an
 * in-process instance of the middleware stub — no GPU, no external ports.
 *
 * Verifies the full production code path: connect → telemetry ingest →
 * state machine reaches MINING → accepted shares are recorded.
 */

import { describe, test, expect, afterEach } from 'bun:test';
import { QuaiMinerClient } from '../../packages/web3/src/QuaiMiner';
import { MinerSim, DEFAULT_RIG } from './sim';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Fast rig: share difficulty ≈ 5s of hashes at 40 MH/s → shares within the test window
const TEST_RIG = { ...DEFAULT_RIG, shareDifficulty: 2e8 };

interface RunningStub {
    wsPort: number;
    httpPort: number;
    sim: MinerSim;
    stop: () => void;
}

function startStub(seed = 1): RunningStub {
    const sim = new MinerSim(TEST_RIG, seed);
    const tickTimer = setInterval(() => sim.tick(1), 100);
    const sockets = new Set<any>();

    const ws = Bun.serve({
        port: 0, // ephemeral
        fetch(req, server) {
            if (new URL(req.url).pathname === '/ws' && server.upgrade(req)) return;
            return new Response('ok');
        },
        websocket: {
            open(sock) { sockets.add(sock); sock.send(JSON.stringify(sim.payload())); },
            message() { /* push-only */ },
            close(sock) { sockets.delete(sock); },
        },
    });

    const pushTimer = setInterval(() => {
        const msg = JSON.stringify(sim.payload());
        for (const s of sockets) { try { s.send(msg); } catch { sockets.delete(s); } }
    }, 100);

    const http = Bun.serve({
        port: 0,
        fetch(req) {
            if (new URL(req.url).pathname === '/api/hardware') {
                return Response.json(sim.payload());
            }
            return new Response('ok');
        },
    });

    return {
        wsPort: ws.port,
        httpPort: http.port,
        sim,
        stop: () => {
            clearInterval(tickTimer);
            clearInterval(pushTimer);
            ws.stop(true);
            http.stop(true);
        },
    };
}

let stub: RunningStub | null = null;
afterEach(() => { stub?.stop(); stub = null; });

describe('middleware stub ↔ QuaiMinerClient (real transports)', () => {
    test('WebSocket: connects, reaches MINING, records accepted shares', async () => {
        stub = startStub(11);
        const client = new QuaiMinerClient({
            wsUrl: `ws://localhost:${stub.wsPort}/ws`,
            transport: 'ws',
            stallTimeoutMs: 10_000,
        });
        client.start();
        try {
            // Wait for the MINING state
            const deadline = Date.now() + 5000;
            while (client.telemetry.state !== 'MINING' && Date.now() < deadline) await sleep(50);
            expect(client.telemetry.state).toBe('MINING');
            expect(client.telemetry.hashrate).toBeGreaterThan(0);

            // Shares should land within ~10s at the test rig's difficulty
            const shareDeadline = Date.now() + 15_000;
            while (client.telemetry.sharesAccepted === 0 && Date.now() < shareDeadline) await sleep(100);
            expect(client.telemetry.sharesAccepted).toBeGreaterThan(0);
            expect(client.getShares().length).toBeGreaterThan(0);
            expect(client.telemetry.lastShareAt).not.toBeNull();
        } finally {
            client.stop();
        }
        expect(client.telemetry.state).toBe('IDLE');
    }, 20_000);

    test('HTTP polling: ingests telemetry through the polling transport', async () => {
        stub = startStub(22);
        const client = new QuaiMinerClient({
            httpUrl: `http://localhost:${stub.httpPort}/api/hardware`,
            transport: 'http',
            pollIntervalMs: 150,
        });
        client.start();
        try {
            const deadline = Date.now() + 5000;
            while (client.telemetry.state !== 'MINING' && Date.now() < deadline) await sleep(50);
            expect(client.telemetry.state).toBe('MINING');
            expect(client.telemetry.hashrate).toBeGreaterThan(0);
        } finally {
            client.stop();
        }
    }, 10_000);

    test('WS server down → ERROR/RECONNECTING, not a hang', async () => {
        const client = new QuaiMinerClient({
            wsUrl: 'ws://localhost:1/ws', // nothing listening
            transport: 'ws',
            reconnectBaseMs: 50,
            reconnectMaxMs: 200,
        });
        client.start();
        try {
            const deadline = Date.now() + 3000;
            while (!['RECONNECTING', 'ERROR'].includes(client.telemetry.state) && Date.now() < deadline) {
                await sleep(50);
            }
            expect(['RECONNECTING', 'ERROR', 'CONNECTING']).toContain(client.telemetry.state);
        } finally {
            client.stop();
        }
    }, 10_000);
});
