import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { B3Engine, MiningSensor, MiningActuator } from '@b3js/engine';
import { MinerClient } from '@b3js/web3';
import { B3Editor } from '@b3js/ui';
import '@b3js/ui'; // Ensure side-effects (custom element registration) run

// Expose globally for debugging and external scripts
(window as any).THREE = THREE;
(window as any).CANNON = CANNON;


/**
 * BOLTEVM World — Optimized Load Sequence
 * 
 * Priority order:
 *   1. Mount editor DOM + resolve viewport container
 *   2. Instantiate B3Engine
 *   3. Restore saved project OR generate BOLTEVM World template (default)
 *   4. Wire mining telemetry (non-blocking)
 *   5. Start render loop
 */
const initEngine = async () => {
    await customElements.whenDefined('b3-editor');
    const editor = document.querySelector('b3-editor') as any;

    if (!editor) {
        console.error("B3JS: b3-editor element not found in DOM.");
        return;
    }

    // ── Phase 1: Resolve Viewport Container ────────────────────
    const getViewport = (): HTMLElement | null =>
        editor.shadowRoot?.querySelector('#viewport-container') as HTMLElement | null;

    let viewportContainer = getViewport();

    if (!viewportContainer) {
        viewportContainer = await new Promise<HTMLElement | null>((resolve) => {
            const onReady = () => {
                editor.removeEventListener('editor-ready', onReady);
                resolve(getViewport());
            };
            editor.addEventListener('editor-ready', onReady);

            // Safety fallback: if the event was already dispatched before we listened
            setTimeout(() => {
                editor.removeEventListener('editor-ready', onReady);
                resolve(getViewport());
            }, 3000);
        });
    }

    if (!viewportContainer) {
        console.error("B3JS: Viewport container failed to manifest in Shadow DOM.");
        return;
    }

    // ── Phase 2: Engine Instantiation ──────────────────────────
    console.log("B3JS: Viewport container found. Initializing engine...");
    const engine = new B3Engine(viewportContainer);
    (window as any).B3_ENGINE_INSTANCE = engine;

    // ── Agentic ZK Ceremony API ────────────────────────────────
    // Scriptable surface for agentic users (bots, LLM agents, tests).
    // Agents are first-class ceremony participants: they join queues,
    // contribute seed-bound entropy, and attest their contributions —
    // via the same code path as human players.
    //
    //   const agent = B3_ZK.spawnAgent('Aria', 'my-secret-seed');
    //   B3_ZK.listCeremonies();
    //   B3_ZK.agentPlan(agent, '<ceremonyId>');   // what should it do?
    import('@b3js/zk').then((zk) => {
        (window as any).B3_ZK = {
            spawnAgent(name: string, seed: string) {
                const agent = new zk.ZKCeremonyAgent(`agent_${seed}_${Date.now().toString(36)}`, name, seed);
                engine.ceremony.registerAgent(agent);
                console.log(`B3JS ZK: Agent "${name}" registered and watching for turns.`);
                return agent;
            },
            listCeremonies: () => engine.ceremony.manager.listCeremonies(),
            listBlueprints: () => Array.from(engine.ceremony.blueprints.values()),
            createCeremony: (name: string, blueprintId?: string) =>
                engine.ceremony.createCeremony(name, blueprintId),
            join: (ceremonyId: string, kind: 'human' | 'agent' = 'agent') =>
                engine.ceremony.joinCeremony(ceremonyId, kind),
            agentPlan: (agent: any, ceremonyId: string) =>
                agent.planAction(engine.ceremony.manager.getCeremony(ceremonyId), engine.ceremony.manager),
            exportTranscript: (ceremonyId: string) =>
                engine.ceremony.manager.exportTranscript(ceremonyId),
            verifyTranscript: (json: string) =>
                engine.ceremony.manager.verifyTranscript(json),
            forge: () => engine.circuitForge,
            zk,
        };
        console.log('B3JS ZK: Agentic ceremony API ready → window.B3_ZK');
    });

    editor.setEngine(engine);

    // ── Phase 3: Load BOLTEVM World (or restore saved project) ─
    // loadFromLocalStorage() checks for saved project data first.
    // If none exists, it generates the full BOLTEVM World template:
    //   Arena Floor, Ambient + Directional Lighting, GLB Props
    //   (ai.glb, crash-block.glb), WalletConnect Kiosk with Web3
    //   Logic Bricks, and Boundary Pillars.
    engine.loadFromLocalStorage();

    // ── Phase 4: Camera Defaults ───────────────────────────────
    engine.camera.position.set(8, 6, 14);
    engine.camera.lookAt(0, 0, 0);

    // ── Phase 5: Mining Telemetry (non-blocking) ───────────────
    const minerClient = MinerClient.getInstance();

    const miningSensor = new MiningSensor(100);
    const miningActuator = new MiningActuator((active) => {
        console.log(`B3JS: Miner Execution -> ${active ? 'START' : 'STOP'}`);
    });

    // Sync Telemetry to Sensor and Editor
    minerClient.addListener((stats) => {
        miningSensor.onTelemetry(stats);
        editor.updateMining(stats);
    });

    // Connect to miner endpoints (fire-and-forget — does not block rendering)
    minerClient.connectQRL();
    minerClient.startQuaiPolling();

    // ── Phase 6: Start Render Loop ─────────────────────────────
    engine.start();

    console.log("B3JS Engine: BOLTEVM World Operational.");
};

initEngine();

