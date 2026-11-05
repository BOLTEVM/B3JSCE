# Rhythm Arcade — DeFi Rhythm Mini-Games (Quai Network)

- Added `packages/engine/src/rhythm/`: timing core (judgement windows, combo tiers, FEVER, seeded charts, Conductor with latency calibration), bigint DeFi primitives (constant-product AMM, lending health factor, per-beat staking, Quai Prime/Region/Zone hierarchy, QI↔QUAI converter)
- Five games: Burn Beat (QuaiAxe burn split), Swap Tempo (AMM slippage/MEV), Yield Stairway (hold-to-compound), Liquidation Dodge (endless health-factor survival), Merge Pulse (Quai merged-mining polyrhythm)
- Cross-platform `InputAdapter` (keyboard, multi-touch, gamepad, XR/custom), procedural WebAudio `BeatSynth`, DPR-aware responsive `CanvasRenderer`, haptics
- Progression: XP/levels, difficulty unlocks, bests, daily streak, seeded daily quests (localStorage)
- `engine.rhythm` (RhythmArcade) + `createRhythmArcadeTemplate` 3D arcade hall; UI 🕹️ Arcade tab (`RhythmArcadePanel`); logic bricks `RhythmBeatSensor`, `RhythmJudgementSensor`, `RhythmFeverSensor`, `RhythmStartActuator`, `RhythmLaneActuator`
- XR Mini Game Arcade (`engine.rhythm.xr`, `packages/engine/src/rhythm/xr/`): WebXR stage with note highways and drum pads (`XRRhythmStage` as a pluggable `ArcadeView`), controller/hand-tracked pad input with trigger-point fallback and controller haptics (`XRRhythmInput`), in-world game picker with difficulty chips (`XRArcade`), `createXRArcadeTemplate` world; `XRManager` yields locomotion while a run owns the controllers
- Tests: `packages/engine/tests/rhythm.test.ts` (46 tests incl. headless full runs of every game and XR layout/view checks)

# GLB Hyperfy-Compatible Parser

- Added glbParser.ts: processGlbPhysics extracts collider/rigidbody/mesh/lod/snap nodes from GLB userData (Hyperfy format)
- Updated templates.ts: BoltEVM models now load with full physics (colliders create CANNON.Trimesh/ConvexPolyhedron, rigidbodies create CANNON.Body)
- Updated index.ts: handleFilesDrop now processes GLB physics; export glbParser module
- Collider meshes auto-hidden from rendering
