# Rhythm Arcade — DeFi Rhythm Mini-Games for Quai Network

`engine.rhythm` (`packages/engine/src/rhythm/`) is a set of five rhythm
mini-games whose scoring is driven by real DeFi math, themed around the Quai
Network. They run on desktop, mobile, gamepad and XR from one code path, and
headlessly under Bun tests.

## The games

| Game | Lanes | DeFi model | What timing does |
| --- | --- | --- | --- |
| 🔥 **Burn Beat** | 4 rigs | QuaiAxe V2 burn split (`quaiAxeSplit`) | Notes are mining shares. PERFECT = full share value, MISS = stale. Every 16 shares a burn batch fires; combo raises the burn share 10% → 90%. |
| 🔁 **Swap Tempo** | SELL·SELL·BUY·BUY | Constant-product AMM (x·y=k, 0.30% fee) | Market price oscillates with the song. PERFECT executes at mid + 0.8% edge; GOOD adds slippage; MISS is a 2% sandwich. Score = PnL. |
| 📈 **Yield Stairway** | 3 vaults | Per-beat compounding vault | Hold notes are staking epochs. Hold to compound (boosted by combo ×), release on the tail to claim, release early → 10% penalty. |
| 🛡️ **Liquidation Dodge** | +COLL·+COLL·REPAY·REPAY | Lending health factor | Endless. Notes are oracle shocks; hit to add collateral or repay. Interest accrues every beat. HF < 1.0 = liquidated, run over. |
| ⛓️ **Merge Pulse** | ZONE·REGION·PRIME·QI | Quai hierarchy (1 Prime / 3 Regions / 9 Zones) + QI↔QUAI | Polyrhythm: zone every beat, region every 3rd, prime every 9th. Hit all three on a prime beat for a merged block +50%. Lane 4 converts QUAI→QI at a spread that tightens with timing. |

All money is `bigint` wei; percentages are bps. The Quai parameters are
stylised for gameplay, not mainnet parity.

## The loop (why it is sticky)

- Four judgement windows (±40 / ±85 / ±130 ms) → near-misses read as "almost".
- Combo tiers ×1 → ×2 (10) → ×4 (25) → ×8 (50).
- FEVER meter fills on PERFECTs; full meter = ×2 for 16 beats.
- Deterministic seeded charts → shareable seeds, fair comparisons.
- Difficulty (easy / normal / hard / insane) scales BPM, density, length and a
  final score multiplier; hard unlocks at level 3, insane at level 6.
- Progression (`PlayerProgress`, localStorage): XP + levels, per-game bests,
  daily UTC streak, three seeded daily quests, recent runs, lifetime
  simulated QUAI delta.
- Instant restart (R / tap on results), pause on tab hide, Esc to exit.

## Cross-platform input

`InputAdapter` normalises everything into `{ lane, down, timeMs }`:

- Keyboard: `D F J K` (4 lanes) / `D Space K` (3 lanes), arrows as alternates.
- Touch / mouse / pen: pointer events over lane columns, multi-touch safe,
  thumb zone under the hit line.
- Gamepad: polled every frame (d-pad, face buttons, shoulders).
- XR / custom: `engine.rhythm.press(lane, down)` or the `RhythmLaneActuator`
  logic brick.

Event timestamps come from the input event itself for sub-frame accuracy.
A latency calibration (`Auto-calibrate` in the Arcade tab, or the slider)
stores a median tap offset that shifts the judgement windows.

Audio is fully procedural WebAudio (`BeatSynth`): kick / snare / hat / bass
scheduled on the AudioContext clock from song time, plus per-judgement SFX.
No samples to download, so it works offline on first load. Haptics use
`navigator.vibrate` and, when connected, the bHaptics vest via
`engine.haptics`.

## Using it

```ts
// From the editor: bottom bar → 🕹️ Arcade → pick a game, or
// Templates → 🕹️ Rhythm Arcade (DeFi Mini-Games) for the 3D arcade hall.

await engine.rhythm.start('merge-pulse', { difficulty: 'hard', seed: 'friday' });
engine.rhythm.on(e => { if (e.type === 'end') console.log(e.finalScore, e.summary.headline); });
```

DOM events on `window`: `b3js:rhythm:start | beat | judgement | fever |
feedback | end | phase`.

Logic bricks (`logic/rhythm_nodes.ts`): `RhythmBeatSensor`,
`RhythmJudgementSensor`, `RhythmFeverSensor`, `RhythmStartActuator`,
`RhythmLaneActuator`.

## Adding a game

Extend `RhythmMiniGame<Payload>`: implement `meta`, `buildChart(seed,
difficulty)`, `onEvent(sessionEvent)`, `hud()`, `summary()`, `reset()`, and
register with `engine.rhythm.registerGame(id, () => new MyGame())`. The game
is pure rules — no DOM — so it is testable with `RhythmArcade.tick()` as in
`packages/engine/tests/rhythm.test.ts`.
