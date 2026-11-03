# Mining Middleware Protocol

How B3JS talks to QUAI mining hardware, and how to write a real hardware
adapter that the engine accepts without modification.

The engine never talks to a miner directly. It talks to a **middleware
process** running on the miner's machine (or LAN) that owns the hardware
and exposes a small, stable protocol. The reference implementation —
`tools/mining-middleware/` — is a development stub that simulates a rig;
production adapters (for `quai-gpu-miner`, `lolMiner`, custom ASIC
controllers, …) implement the same wire format.

```
┌──────────────┐   WS / HTTP   ┌──────────────────┐   vendor API   ┌───────┐
│ B3JS engine  │ ◄───────────► │ mining middleware │ ◄────────────► │  rig  │
│ QuaiMinerClient             │  (this protocol)  │                └───────┘
└──────────────┘               └──────────────────┘
```

---

## 1. Running the reference stub

```bash
# From the repo root
bun run miner:stub
```

This starts both transports with a simulated 40 MH/s rig:

| Transport | Endpoint |
|---|---|
| WebSocket (primary) | `ws://localhost:8001/ws` |
| HTTP polling (fallback) | `http://localhost:8081/api/hardware` |

Environment variables:

| Variable | Default | Meaning |
|---|---|---|
| `QAXE_MW_WS_PORT` | `8001` | WebSocket listen port |
| `QAXE_MW_HTTP_PORT` | `8081` | HTTP listen port |
| `QAXE_MW_HASHRATE` | `40e6` | Nominal simulated hashrate (H/s) |
| `QAXE_MW_SEED` | unset | Fix the RNG seed for reproducible telemetry |

In the editor: open the **QuaiAxe** tab, **uncheck "simulate"**, press
**Start Miner**. The engine connects to the stub over the real WebSocket
transport — same code path as production hardware.

## 1.5 Running the production adapter (real hardware)

The repo ships a production bridge, `tools/mining-middleware/adapter.ts`,
that polls a real miner's HTTP JSON API and re-serves it in this
protocol — the engine cannot tell it apart from the stub.

```bash
# 1. Start your QUAI miner with its API enabled, e.g. Rigel ≥1.20:
rigel.exe -a quai -o stratum+tcp://<pool> -u <QUAIAXE_DEPOSIT_ADDR> -w rig1 --api-bind 127.0.0.1:5000

# 2. Start the adapter (from the repo root)
bun run miner:adapter
```

The adapter auto-probes `/`, `/summary`, and `/api/v1/status` on the
miner API and normalizes XMRig-compatible payloads (which Rigel emits),
Rigel REST payloads (`gpus[].hashrate`, `pools[].shares`), and flat
payloads. When the miner API is unreachable it keeps serving the last
good counters with `running: false` instead of crashing.

| Variable | Default | Meaning |
|---|---|---|
| `QUAI_MINER_API_URL` | `http://127.0.0.1:5000` | Base URL of the miner's API |
| `QUAI_MINER_API_PATHS` | `/,/summary,/api/v1/status` | Paths probed, in order |
| `QAXE_MW_POLL_MS` | `1000` | Miner poll interval |
| `QAXE_MW_WS_PORT` / `QAXE_MW_HTTP_PORT` | `8001` / `8081` | Engine-facing endpoints |

The normalizer lives in `tools/mining-middleware/adapters/vendorApi.ts` —
add a shape there to support another miner (fixtures go in
`vendorApi.test.ts`).

## 2. The wire format

Both transports carry the **same JSON payload**. Field names are
deliberately close to common miner APIs (XMRig-style) to make adapters
thin.

```json
{
  "hashrate": 39514061,
  "shares_accepted": 12,
  "shares_rejected": 0,
  "difficulty": 4000000000,
  "hardware_errors": 0,
  "uptime_sec": 312,
  "running": true
}
```

| Field | Type | Required | Meaning |
|---|---|---|---|
| `hashrate` | number | **yes** | Instantaneous hashrate, H/s. `0` while idle. |
| `shares_accepted` | number | **yes** | Cumulative accepted share count (monotonic). |
| `shares_rejected` | number | yes | Cumulative rejected count. Default `0`. |
| `difficulty` | number | yes | Current share difficulty (hashes per expected share). |
| `hardware_errors` | number | no | Cumulative hardware error count. Default `0`. |
| `uptime_sec` | number | no | Informational; the client tracks its own uptime. |
| `running` | boolean | no | `false` parks the client state machine. |

### Field rules

- **Counters are cumulative and monotonic.** The client detects new
  shares by diffing `shares_accepted` between messages — never send a
  per-interval count. Resetting a counter to `0` mid-session confuses
  share detection; restart the middleware instead.
- **`hashrate > 0` is what flips the client into `MINING`.** Send `0`
  (or stop sending) when the rig pauses.
- **Numbers, not strings.** JSON numbers are fine up to 2⁵³ — hashrates
  and share difficulties fit comfortably.

### Field aliases

The client also accepts `hashrate_hs` (→ `hashrate`), `diff` (→
`difficulty`), `shares` (→ `shares_accepted`), `shares_stale`, and
`hw_errors` (→ `hardware_errors`). Adapters may pass vendor payloads
through with minimal renaming.

## 3. Transports

### 3.1 WebSocket — `ws://<host>:8001/ws` (primary)

- Server **pushes** the payload to every connected client, ~1 Hz.
- Send one payload immediately on connect (clients render instantly
  instead of waiting for the first tick).
- Messages are text frames containing one JSON payload. No envelope, no
  acknowledgements — the stream is one-way.
- Clients may connect and disconnect freely; the middleware must not
  require any handshake or authentication on the LAN stub. (If you
  expose this beyond localhost, put it behind your own auth.)

### 3.2 HTTP polling — `GET http://<host>:8081/api/hardware` (fallback)

- `GET` returns the current payload as `application/json`.
- Include CORS headers (`Access-Control-Allow-Origin: *`) so the browser
  build can call it directly; the Vite dev server also proxies
  `/api/hardware` → `localhost:8081`.
- `OPTIONS` preflight should return `204`/`200` with the same headers.

### Which transport wins?

`QuaiMinerConfig.transport` (`'ws' | 'http'`) chooses. Default is `ws`.
The client's stall watchdog (default 30 s without a message) reconnects
with exponential backoff (1 s → 30 s cap) — so middleware restarts are
absorbed gracefully on either transport.

## 4. Writing a hardware adapter

A minimal adapter is a loop that reads vendor stats and republishes
them:

```ts
// 1. Read your miner's API (XMRig HTTP, cgminer RPC, vendor CLI…)
const vendor = await fetch('http://127.0.0.1:4067/summary').then(r => r.json());

// 2. Map to the wire format
const payload = {
  hashrate:        vendor.hashrate.total[0],
  shares_accepted: vendor.results.shares_good,
  shares_rejected: vendor.results.shares_total - vendor.results.shares_good,
  difficulty:      vendor.results.diff_current,
  hardware_errors: vendor.results.hw_errors ?? 0,
  running:         true,
};

// 3. Serve it on both transports — copy the Bun.serve blocks from
//    tools/mining-middleware/server.ts and replace `sim.payload()`
//    with your payload.
```

Checklist for a production-grade adapter:

- [ ] Serve **both** transports (WS push 1 Hz + HTTP GET).
- [ ] Cumulative, monotonic share counters.
- [ ] `hashrate = 0` when the rig is idle/paused (drives the client's
      state machine honestly).
- [ ] Handle the miner being unreachable: keep serving the last payload
      with `running: false`, or close sockets — never crash on vendor
      API errors.
- [ ] Point the engine at it via the QuaiAxe panel (default URLs) or
      `engine.quaiAxe.startMiner({ wsUrl, httpUrl, transport })`.

## 5. What the engine does with the telemetry

| Layer | Consumes |
|---|---|
| `QuaiMinerClient` (`@b3js/web3`) | Connection state machine, rolling hashrate (instant/1m/15m), share log, acceptance rate, stall watchdog, backoff reconnect |
| `QuaiAxeGame` (`@b3js/engine`) | Accepted shares → estimated pending QUAI → burn batches (`quaiAxeSplit`) → furnace heat + payout balance → Furnace Wall pixels |
| Logic bricks | `QuaiAxeMiningSensor` (fires while hashing), `QuaiAxeBurnSensor` (pulses per burn batch), `QuaiAxeFeedActuator`, `QuaiAxePaintActuator` |
| DOM events | `b3js:qaxe:telemetry` / `share` / `config` / `burn` / `paint` — usable by any UI or scripting layer |

### Estimated vs. authoritative rewards

Share → QUAI conversion in the game layer is an **estimate**
(`QAXE_DEFAULT_SHARE_ESTIMATE`, 0.25 QUAI/share) used for pacing. When a
real QuaiAxe deposit address settles on-chain, the pool/contract ledger
is authoritative. Adapters do not need to report earnings — only work.

## 6. Testing your adapter

The repo ships integration tests that exercise the client against an
in-process stub over real sockets — reuse the pattern in
`tools/mining-middleware/integration.test.ts`:

```bash
bun test tools/mining-middleware/
```

Manual smoke test:

```bash
bun run miner:stub &
curl http://localhost:8081/api/hardware   # expect one JSON payload
```

Then start the editor (`bun run dev`), open the QuaiAxe tab, uncheck
"simulate", and Start Miner: state should go `CONNECTING → CONNECTED →
MINING` within a second, and the Furnace World rig fans should spin.
