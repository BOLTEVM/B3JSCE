# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

B3JS is a browser-based 3D game engine and editor built on Three.js and Cannon-es, with Web3 integration, SpacetimeDB multiplayer, and sandboxed Python scripting via Pyodide.

## Commands

```bash
bun install          # Install all workspace dependencies
bun run dev          # Start Vite dev server (apps/web, port 5173)
bun run build        # Build for production (via root build script)
bun test             # Run tests (bun:test framework, tests in packages/engine/tests/)
```

Run a single test file:
```bash
bun test packages/engine/tests/ecs.test.ts
```

Build the SpacetimeDB server module:
```bash
cd packages/engine/spacetime && bun run build
```

## Architecture

**Monorepo** with Bun workspaces. Vite resolves workspace packages via aliases in `apps/web/vite.config.ts`.

### Package Structure

- **`@b3js/engine`** (`packages/engine/src/`) — Core engine. The main file `index.ts` (~2200 lines) contains `B3Engine` (orchestrator), `B3Object` (scene entity), and the entire Logic Brick framework (Sensor/Controller/Actuator hierarchy). Sub-modules handle dedicated concerns:
  - `ecs/` — Entity-Component-System (World, Entity, Component, ComponentStore, System). Runs alongside B3Engine, not replacing it. Systems: HealthSystem, LogicSystem.
  - `serialization/` — Versioned save/load pipeline with ComponentSerializer registry and migration support. Save format uses versioned keys like `"Transform@2"`.
  - `shaders/` — Nodal material system (ShaderNode graph + ShaderLib chunk registry)
  - `spacetime.ts` — Client-side SpacetimeManager for real-time multiplayer sync with offline fallback to localStorage
  - `network.ts`, `xr.ts`, `vehicle.ts`, `combat.ts`, `audio.ts`, `inventory.ts`, `optimization.ts`, `project.ts` — Feature managers owned by B3Engine
- **`@b3js/ui`** (`packages/ui/src/`) — Editor UI built as Web Components (webjsx, not React). `B3Editor` is a custom element (`<b3-editor>`) with Shadow DOM. Panels: Properties, LogicEditor, NodalEditor, ShaderEditor, NetworkPanel, InventoryPanel, MiningPanel, AudioPanel, OptimizationPanel, Outliner. State via nanostores in `store/`.
- **`@b3js/web3`** (`packages/web3/src/`) — Web3 bridge. MinerClient (singleton) connects to QRL via WebSocket and Quai via HTTP polling.
- **`apps/web`** — Vite app entry point. Wires engine + UI + web3 together. Engine instance exposed as `window.B3_ENGINE_INSTANCE`.

### SpacetimeDB Server

`packages/engine/spacetime/` is a standalone SpacetimeDB server module (TypeScript). Defines tables: WorldEntity, Lobby, Player. Reducers: create_lobby, join_lobby (32-player cap), upsert_entity, update_transform, despawn_entity, onDisconnect.

### Logic Brick Framework

The core behavioral system follows a Sensor → Controller → Actuator pipeline:
- **Sensors** (KeyboardSensor, CollisionSensor, MiningSensor) set `positive` boolean per tick
- **Controllers** (AndController, PythonController) evaluate sensor states and fire actuators
- **Actuators** (MotionActuator, MiningActuator) perform actions on B3Object/Three.js objects
- PythonController runs Pyodide in a sandboxed namespace (no engine/b3obj exposure). Untrusted scripts are blocked by default.

### Key Patterns

- **Dual object model**: B3Engine uses `B3Object[]` (legacy) alongside `ECSWorld` (modern). ECS LogicSystem drives logic brick updates; B3Object handles rendering/physics sync.
- **Registry pattern**: Logic nodes, shader nodes, and serializers each use a global registry (`_sensorRegistry`, `_controllerRegistry`, etc.) with `registerXType()` + factory functions for deserialization.
- **Undo/Redo**: Command pattern via HistoryManager. MoveObjectCommand is the primary implementation.
- **Multi-scene**: B3Engine.sceneRegistry holds named scenes; activeSceneName tracks current scene. Pre-play state serialization enables play/stop.
- **Remote interpolation**: `B3Object.isRemote` triggers lerp/slerp toward `targetPosition`/`targetQuaternion` instead of physics sync.

## Development Notes

- **Package manager**: Bun only. No npm/npx.
- **Bun workspace filter syntax**: Use `bun --filter <workspace-name> run <script>` (e.g. `bun --filter web-app run dev`). Do NOT use `bun --cwd` — it does not resolve workspace dependencies correctly.
- **JSX**: webjsx, not React. JSX factory configured in tsconfig (`jsxFactory: "webjsx.createElement"`).
- **TSConfig**: Root tsconfig uses composite project references. Path aliases (`@b3js/*`) defined in both root tsconfig and Vite config.
- **Vite proxies**: `/api/hardware` → `localhost:8081`, `/ws` → `ws://localhost:8000` (for mining middleware).
- **Browser testing**: Puppeteer is a devDependency in apps/web. Manual `test-browser.ts` exists for browser-based testing.
- **SpacetimeDB SDK**: Import `DbConnection` from `spacetimedb`, NOT `DbConnectionImpl`. The implementation class is not exported.
- **Type packages**: Use `@types/bun` (not `bun-types`). All workspace packages need `@types/bun` in devDependencies.
