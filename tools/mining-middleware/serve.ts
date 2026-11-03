/**
 * Shared telemetry serving for the mining middleware: one helper used by
 * both the simulator stub (server.ts) and the production hardware
 * adapter (adapter.ts).
 *
 * Serves the B3JS mining middleware protocol (docs/mining-middleware.md):
 *   - WS push at /ws (payload on connect + on every broadcast tick)
 *   - HTTP GET /api/hardware with CORS
 */

import type { TelemetryPayload } from './sim';

export interface ServeOptions {
    wsPort?: number;
    httpPort?: number;
    /** Broadcast/poll-snapshot cadence (ms). Default 1000. */
    intervalMs?: number;
    /** Label for log lines, e.g. 'stub' or 'adapter'. */
    label?: string;
}

export interface TelemetryServer {
    wsPort: number;
    httpPort: number;
    stop: () => void;
}

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

export function serveTelemetry(
    getPayload: () => TelemetryPayload,
    opts: ServeOptions = {},
): TelemetryServer {
    const wsPort = opts.wsPort ?? 8001;
    const httpPort = opts.httpPort ?? 8081;
    const intervalMs = opts.intervalMs ?? 1000;
    const label = opts.label ?? 'middleware';

    const sockets = new Set<any>();

    const ws = Bun.serve({
        port: wsPort,
        fetch(req, server) {
            const url = new URL(req.url);
            if (url.pathname === '/ws' && server.upgrade(req)) return;
            return new Response(`B3JS mining ${label} — WS at /ws`, { status: 200 });
        },
        websocket: {
            open(sock) {
                sockets.add(sock);
                console.log(`[${label}] client connected (:${wsPort}/ws, ${sockets.size} total)`);
                try { sock.send(JSON.stringify(getPayload())); } catch { /* send on next tick */ }
            },
            message() { /* telemetry is push-only */ },
            close(sock) {
                sockets.delete(sock);
                console.log(`[${label}] client disconnected (${sockets.size} total)`);
            },
        },
    });

    const timer = setInterval(() => {
        if (sockets.size === 0) return;
        const msg = JSON.stringify(getPayload());
        for (const sock of sockets) {
            try { sock.send(msg); } catch { sockets.delete(sock); }
        }
    }, intervalMs);

    const http = Bun.serve({
        port: httpPort,
        fetch(req) {
            const url = new URL(req.url);
            if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
            if (url.pathname === '/api/hardware') {
                return Response.json(getPayload(), { headers: CORS });
            }
            return new Response(`B3JS mining ${label} — GET /api/hardware`, {
                status: 200, headers: CORS,
            });
        },
    });

    console.log(`[${label}] telemetry up`);
    console.log(`[${label}]   WS   → ws://localhost:${wsPort}/ws`);
    console.log(`[${label}]   HTTP → http://localhost:${httpPort}/api/hardware`);

    return {
        wsPort: ws.port,
        httpPort: http.port,
        stop: () => {
            clearInterval(timer);
            ws.stop(true);
            http.stop(true);
        },
    };
}
