<p align="center">
  <img src="./0logov3.png" width="300" alt="B3JS Logo">
</p>

# B3JS Game Engine

> **The Next-Generation Web3-Native 3D Engine.**
> High-performance, modular, and built for the decentralized world.

---

## 🚀 Overview

B3JS is an industrial-grade, browser-based 3D game engine and editor built on **Three.js** and **Cannon-es**. It is designed for maximum developer leverage, focusing on **Web3 integration**, **Real-time Multiplayer (SpacetimeDB)**, and **Sandboxed Python logic**. 

From high-fidelity tactical simulations to decentralized virtual worlds, B3JS provides a professional suite of tools including a Nodal Material System, Logic Brick Framework, and comprehensive state restoration.

## ✨ Key Features

- **🛡️ Phase 4 Engine Stabilized**: Pure ECS separation. WebWorkers handle intensive pathfinding and AI updates independently, ensuring stable 60+ FPS under heavy logic load. Safe serialization stops Editor Play/Pause data bleeding.
- **🌐 Multiplayer Sync (SpacetimeDB)**: Granular, real-time synchronization of world state. The networking subsystem employs strict Ownership schemas to completely prevent unauthorized remote state manipulation.
- **🐍 Python & C# Scripting**: Sandboxed behavior logic powered by **Pyodide** and dynamic C# execution contexts.
- **🦴 Dynamic Skeleton & Procedural IK**: Native extraction of `THREE.Bone` hierarchies from GLTF imports. Logic Bricks like `BoneLookAtActuator` provide dynamic procedural aiming, head tracking, and IK recoil out-of-the-box.
- **🥽 XR Locomotion Ready**: Hardcoded index limitations resolved with dynamic dominant-handedness detection and patched memory leaks for seamless headset experiences.
- **🎨 Nodal Material Editor**: A visual-ready shader graph system for creating complex, dynamic materials and effects.
- **🧩 Advanced Logic Bricks**: Professional-grade behavioral system (Sensors, Controllers, Actuators) with expanded support for Web3 wallets, Mining telemetry, and the new **Swap Scale** exchange system.
- **🛠️ Professional Editor Tools**: 
    - **XR Spatial Outliner**: Interactive 3D "Bolt Tablet" for in-scene management, projecting the hierarchical Outliner into 3D space.
    - **⚡ Spatial Duplication**: Deep-cloning system for 3D assets and logic nodes, complemented by a floating XR toolbar for rapid manipulation.
    - **Undo/Redo** history and state restoration.
    - Transform Gizmos for precise object manipulation.
    - Specialized panels for Networking, Optimization, Audio, and Inventories.

## 🛠️ Tech Stack

- **Core**: TypeScript, Three.js, Cannon-es
- **Multiplayer**: SpacetimeDB
- **Scripting**: Pyodide (Python 3.11+)
- **Build Tooling**: Bun, Vite, Turborepo
- **UI**: React-based professional editor suite
- **Web3**: EVM-compatible protocols and WalletConnect integration

## 📦 Project Structure

```text
├── apps/
│   └── web/            # The main Editor / Application entry point
├── packages/
│   ├── engine/         # Core engine (ECS, SpacetimeDB bridge, Python runtime)
│   ├── ui/             # Professional suite of Editor UI panels and components
│   └── web3/           # Web3 protocols and decentralized wallet integrations
└── assets/             # Shared geometry, textures, and avatar assets
```

## 🚀 Quick Start

### Prerequisites
- [Bun](https://bun.sh/) installed on your machine.

### Installation
```bash
# Install dependencies
bun install
```

### Running the Editor
```bash
# Start the development server
bun run dev
```

### Building for Production
```bash
# Build the application
bun run build
```

## 📄 License

Internal Development Version. All rights reserved.

---

<p align="center">
  Built with ❤️ by the B3JS Team
</p>
