<p align="center">
  <img src="./0logov3.png" width="300" alt="B3JS Logo">
</p>

# B3JS Game Engine

> **The Next-Generation Web3-Native 3D Engine.**
> High-performance, modular, and built for the decentralized world.

---

## 🚀 Overview

B3JS is a browser-based 3D game engine built on top of **Three.js** and **Cannon-es**, designed with a focus on **Web3 integration**, **High-Performance ECS**, and **Low-Code Logic Bricks**. It provides a robust suite of tools for creators to build immersive virtual worlds, tactical games, and decentralized applications with minimal overhead.

## ✨ Key Features

- **⚡ High-Performance ECS**: A custom Entity-Component-System (ECS) architecture that decouples logic from rendering for maximum efficiency.
- **🎨 Nodal Material System**: A visual-ready shader system for creating complex materials with ease.
- **🧩 Logic Brick System**: Inspired by professional game engines, allowing for complex behavior through Sensors, Controllers, and Actuators without writing code.
- **🌐 Web3-Native**: Built-in support for EVM wallet connectivity, ENS resolution, and decentralized messaging.
- **⚡ Background Pathfinding**: Offloaded AI computations to WebWorkers to ensure buttery smooth 60fps gameplay.
- **🛡️ Editor Stability**: Industrial-grade state restoration and undo/redo history for a professional developer experience.
- **🗺️ Procedural Templates**: Rapid world generation protocols (e.g., Boltevm integration).

## 🛠️ Tech Stack

- **Core**: TypeScript, Three.js
- **Physics**: Cannon-es
- **Build Tooling**: Bun, Vite, Turborepo
- **Logic**: Logic Brick Framework (Sensors/Controllers/Actuators)
- **AI**: WebWorker-based Three-Pathfinding

## 📦 Project Structure

```text
├── apps/
│   └── web/            # The main Editor / Application entry point
├── packages/
│   ├── engine/         # Core engine source (ECS, Systems, Logic Bricks)
│   ├── ui/             # Industrial-grade editor UI components
│   └── web3/           # Web3 protocols and WalletConnect integration
└── assets/             # Shared geometry and textures
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

## 📄 License

Internal Development Version. All rights reserved.

---

<p align="center">
  Built with ❤️ by the B3JS Team
</p>
