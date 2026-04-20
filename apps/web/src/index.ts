import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { B3Engine, B3Object, KeyboardSensor, AndController, MotionActuator, MiningSensor, MiningActuator } from '@b3js/engine';
import { B3Web3, MinerClient } from '@b3js/web3';
import { B3Editor } from '@b3js/ui';
import '@b3js/ui'; // Ensure side-effects (custom element registration) run

// Initialize Editor and Engine
const initEngine = async () => {
    await customElements.whenDefined('b3-editor');
    const editor = document.querySelector('b3-editor') as any;

    if (!editor) {
        console.error("B3JS: b3-editor element not found in DOM.");
        return;
    }

    // Wait for the editor to signal DOM readiness via custom event,
    // with a fallback poll in case connectedCallback already fired.
    const getViewport = (): HTMLElement | null =>
        editor.shadowRoot?.querySelector('#viewport-container') as HTMLElement | null;

    let viewportContainer = getViewport();

    if (!viewportContainer) {
        // Editor hasn't rendered yet — wait for its 'editor-ready' event
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

    console.log("B3JS: Viewport container found. Initializing engine...");
    const engine = new B3Engine(viewportContainer);
    (window as any).B3_ENGINE_INSTANCE = engine; // Global access for UI triggers
    const minerClient = MinerClient.getInstance();

    editor.setEngine(engine);



    // 1. Setup Mining Infrastructure
    const miningSensor = new MiningSensor(100);
    const miningActuator = new MiningActuator((active) => {
        console.log(`B3JS: Miner Execution -> ${active ? 'START' : 'STOP'}`);
    });

    // Sync Telemetry to Sensor and Editor
    minerClient.addListener((stats) => {
        miningSensor.onTelemetry(stats);
        editor.updateMining(stats);
    });

    // Connect to miners
    minerClient.connectQRL();
    minerClient.startQuaiPolling();

    // 2. Create a Floor
    const floorGeo = new THREE.PlaneGeometry(20, 20);
    const floorMat = new THREE.MeshStandardMaterial({
        color: 0x222222,
        roughness: 0.8,
        metalness: 0.2
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;

    const floorBody = new CANNON.Body({
        mass: 0,
        shape: new CANNON.Plane()
    });
    floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);

    const floor = new B3Object(floorMesh);
    floor.name = "Floor Grid";
    floor.type = "Environment";
    floor.body = floorBody;
    engine.addObject(floor);

    // 3. Create a Player Cube with Logic Bricks
    const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
    const cubeMat = new THREE.MeshStandardMaterial({
        color: 0x00d4ff,
        emissive: 0x00d4ff,
        emissiveIntensity: 0.5
    });
    const cubeMesh = new THREE.Mesh(cubeGeo, cubeMat);
    cubeMesh.castShadow = true;

    const cubeBody = new CANNON.Body({
        mass: 1,
        shape: new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5))
    });
    cubeBody.position.set(0, 5, 0);

    const player = new B3Object(cubeMesh);
    player.name = "Player Cube";
    player.type = "Entity";
    player.body = cubeBody;

    // Logic: KeyW -> Move Forward
    const keyW = new KeyboardSensor('KeyW');
    const forwardCtrl = new AndController();
    const moveForward = new MotionActuator(cubeMesh, new THREE.Vector3(0, 0, -0.1));

    player.addSensor(keyW);
    player.addController(forwardCtrl);
    player.addActuator(moveForward);
    forwardCtrl.addSensor(keyW);
    forwardCtrl.addActuator(moveForward);

    // Mining Logic: Reactivity
    const miningCtrl = new AndController();
    player.addSensor(miningSensor);
    player.addController(miningCtrl);
    miningCtrl.addSensor(miningSensor);

    const glowActuator = new MiningActuator((active) => {
        (cubeMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = active ? 2.0 : 0.5;
    });
    player.addActuator(glowActuator);
    miningCtrl.addActuator(glowActuator);

    engine.addObject(player);

    // 4. Add Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    engine.scene.add(ambient);

    const point = new THREE.PointLight(0x00d4ff, 2, 100);
    point.position.set(5, 5, 5);
    engine.scene.add(point);

    // Start Engine
    engine.camera.position.set(5, 5, 10);
    engine.camera.lookAt(0, 0, 0);
    engine.start();

    console.log("B3JS Engine: Industry-Standard UI Operational.");
};

initEngine();
