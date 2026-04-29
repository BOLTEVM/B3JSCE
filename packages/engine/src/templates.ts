import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { B3Object } from './core/B3Object';
import { CollisionSensor } from './logic/sensors';
import { AndController } from './logic/controllers';
import { Web3ConnectActuator } from './logic/actuators';
import { createProceduralSky } from './logic/nodes/skybox';
import { processGlbPhysics } from './glbParser';
import { createMarketTerminal, createShopKiosk, createWeb3Gateway, createCube, createTokenCoin, createPinPad } from './factories';
import { HandGestureSensor } from './logic/spatial_nodes';
import { ElevatorActuator, GateActuator, PulseActuator } from './logic/elevator_nodes';
import { SpinnerActuator, AudioReactiveActuator, VideoPlayerActuator } from './logic/bolt_nodes';

/**
 * Scene template generators. Each accepts a B3Engine reference.
 */

export function createDefaultEnvironment(engine: any) {
    engine.resetScene();

    // 1. Procedural Skybox (Dynamic — driven by skybox logic nodes)
    const { mesh: skyMesh } = createProceduralSky();
    const b3sky = new B3Object(skyMesh);
    b3sky.name = "Skybox";
    b3sky.type = "Skybox";
    b3sky.isStatic = true;
    engine.addObject(b3sky);

    // 2. Floor
    const floorGeo = new THREE.PlaneGeometry(100, 100);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    const b3floor = new B3Object(floorMesh);
    b3floor.name = "Floor Grid";
    b3floor.type = "Environment";
    b3floor.isStatic = true;
    b3floor.body = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    b3floor.body.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    engine.addObject(b3floor);

    // 3. Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    engine.scene.add(ambient);
    
    const sun = new THREE.DirectionalLight(0xffffff, 1);
    sun.position.set(10, 20, 10);
    sun.castShadow = true;
    engine.scene.add(sun);
}

export async function createBoltevmTemplate(engine: any, name = 'Boltevm World') {
    const isObjectInScene = (name: string) => engine.objects.some((o: any) => o.name === name);
    
    if (isObjectInScene('Bolt Base')) {
        console.log(`B3JS Engine: ${name} Template already present, skipping core import.`);
        return;
    }

    console.log(`B3JS Engine: Generating ${name} Template...`);

    // 1. Ground Plane
    const groundGeo = new THREE.PlaneGeometry(80, 80);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.85 });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    const ground = new B3Object(groundMesh);
    ground.name = 'Arena Floor';
    ground.type = 'Environment';
    ground.isStatic = true;
    ground.body = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    ground.body.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    engine.addObject(ground);

    // 2. Lighting
    const ambient = new THREE.AmbientLight(0x404060, 0.6);
    const ambObj = new B3Object(ambient);
    ambObj.name = 'Ambient Light';
    ambObj.type = 'Light';
    engine.addObject(ambObj);

    const sun = new THREE.DirectionalLight(0xffeedd, 1.2);
    sun.position.set(10, 20, 10);
    sun.castShadow = true;
    const sunObj = new B3Object(sun);
    sunObj.name = 'Sun';
    sunObj.type = 'Light';
    engine.addObject(sunObj);

    // 3. Load GLB props
    const loader = new GLTFLoader();

    // BOLTEVM Hyperfy World Core Models
    let baseObj: B3Object | null = null;
    try {
        const gltf = await loader.loadAsync('/models/bolt-base-t3.glb');
        const physics = processGlbPhysics(gltf, engine.world);
        gltf.scene.position.set(0, 0, 0);
        gltf.scene.scale.setScalar(1);

        baseObj = new B3Object(gltf.scene);
        baseObj.name = 'Bolt Base';
        baseObj.type = 'Prop';
        baseObj.isStatic = true;
        baseObj.modelUrl = '/models/bolt-base-t3.glb';
        if (physics.bodies.length > 0) {
            baseObj.body = physics.bodies[0].body;
        }

        // ─── Bolt Base Logic Integration (Hyperfy Migration) ───
        
        // 1. Audio Setup
        const audioUrl = 'https://arweave.net/uS5A6W8j-H6oZ0_uG-f_R66X0_N6_p0_W6_O6_L6_M6'; // Sample or prop-driven
        const b3audio = new THREE.PositionalAudio(engine.audio.getListener());
        const audioLoader = new THREE.AudioLoader();
        audioLoader.load(audioUrl, (buffer) => {
            b3audio.setBuffer(buffer);
            b3audio.setRefDistance(20);
            b3audio.setLoop(true);
            b3audio.play();
            engine.audio.setupAnalyser(b3audio, 'bolt_base');
        });
        gltf.scene.add(b3audio);

        // 2. Continuous Rotations (Spinners)
        const addSpinner = (name: string, sx: number, sy: number, sz: number) => {
            const spin = new SpinnerActuator();
            spin.inputs[1].value = sx;
            spin.inputs[2].value = sy;
            spin.inputs[3].value = sz;
            spin.inputs[4].value = name;
            baseObj?.addActuator(spin);
        };

        addSpinner('LowerTruss', 0, 0.5, 0);
        addSpinner('UpperTruss', 0, -0.3, 0);
        addSpinner('tunnel', 0, 0.2, 0);
        addSpinner('CoolingFan', -2.0, 0, 0); // Targets all CoolingFan* meshes
        addSpinner('w', 0, 1.0, 0); // Wheel
        addSpinner('r1', 0.5, 0, 0);
        addSpinner('r2', 0, 0.5, 0);
        addSpinner('r3', 0, 0, 0.5);
        addSpinner('rootLights', 0, 0.5, 0);

        // 3. Audio Reactivity
        const addReactivity = (name: string, band: string, scale: number, intensity: number, color: string) => {
            const react = new AudioReactiveActuator();
            react.inputs[1].value = 'bolt_base';
            react.inputs[2].value = band;
            react.inputs[3].value = scale;
            react.inputs[4].value = intensity;
            react.inputs[5].value = color;
            react.inputs[6].value = name;
            baseObj?.addActuator(react);
        };

        addReactivity('Thrusters', 'bass', 8, 3, '#ff4400');
        addReactivity('engineInner', 'mid', 5, 2, '#00aaff');
        addReactivity('engineOuter', 'volume', 3, 1.5, '#ffffff');
        addReactivity('Tunnels', 'bass', 6, 4, '#aa00ff'); // Increased intensity for purple pipes
        addReactivity('FloorLines', 'mid', 2, 5, '#eeff00'); // Targeted yellow floor lines
        addReactivity('TableMesh', 'mid', 4, 2, '#ff00ff');
        addReactivity('FanMesh', 'treble', 5, 2, '#00ff00');
        addReactivity('r1_2', 'volume', 3, 2, '#ff00ff');
        addReactivity('r2_2', 'bass', 3, 2, '#00ffff');
        addReactivity('r3_3', 'treble', 3, 2, '#ff6600');

        // 4. Video Player
        const video = new VideoPlayerActuator();
        video.inputs[1].value = 'https://arweave.net/finalbossfinal.mp4';
        video.inputs[3].value = 'Screens';
        baseObj.addActuator(video);

        engine.addObject(baseObj);
        console.log(`B3JS: Bolt Base loaded with migrated Hyperfy logic.`);
    } catch (e) { console.warn('B3JS: Bolt Base not found, skipping.', e); }

    const hyperfyModels: Array<{name: string, url: string, pos?: number[], rot?: number[], scale?: number, snap?: string, physics?: boolean}> = [
        { name: 'Bolt Elevator', url: '/models/bolt-elevator-t.glb', pos: [-27.9294, -0.14015, -1.5394], scale: 1 },
        { name: 'Bolt Engine', url: '/models/bolt-engine.glb', pos: [0,0,0], scale: 1 },
        { name: 'Bolt Speakers', url: '/models/bolt-speakers-t.glb', snap: 'speaker_mount', pos: [0,0,0], scale: 1 },
        { name: 'Bolt Tunnel', url: '/models/bolt-tunnel.glb', pos: [0,0,0], scale: 1 },
        { name: 'Bolt Lights', url: '/models/bolt-lights-t2.glb', pos: [0, 0, 0], scale: 1 },
        { name: 'Bolt Gate', url: '/models/bolt-gate.glb', pos: [-10.1553, 0.42426, 14.9469], rot: [0, Math.PI / 2, 0], scale: 1 },
        { name: 'Bolt Panel', url: '/models/bolt-panel.glb', pos: [16.1925, 0.36133, 13.4938], scale: 1 },
        { name: 'Bolt Tablet', url: '/models/bolt-tablet.glb', pos: [0, 0, 0], scale: 1, physics: false },
        { name: 'gORB', url: '/models/gORB.glb', pos: [0, 150, 0], scale: 1 },
        { name: 'Metakey', url: '/models/metakey.glb', pos: [-17.7667, 1.91591, 9.52224], scale: 1 },
    ];

    for (const m of hyperfyModels) {
        if (isObjectInScene(m.name)) continue;
        try {
            const gltf = await loader.loadAsync(m.url);
            const physics = processGlbPhysics(gltf, engine.world);
            
            if (m.scale !== undefined) {
                gltf.scene.scale.setScalar(m.scale);
            }

            const obj = new B3Object(gltf.scene);
            obj.name = m.name;
            obj.type = 'Prop';
            obj.isStatic = true;
            obj.modelUrl = m.url;
            
            if (physics.bodies.length > 0 && m.physics !== false) {
                obj.body = physics.bodies[0].body;
            } else if (physics.bodies.length > 0 && m.physics === false) {
                // If physics is explicitly disabled, remove the generated bodies from the physics world
                physics.bodies.forEach(b => engine.world.removeBody(b.body));
            }
            
            // Positioning: Try snappoint first, then fallback to pos
            let finalPos = new THREE.Vector3();
            if (m.pos) finalPos.fromArray(m.pos);
            
            if (m.snap && baseObj) {
                const snapPos = (baseObj as any).getSnappointPosition?.(m.snap);
                if (snapPos) {
                    finalPos.copy(snapPos);
                    console.log(`B3JS Template: Snapped ${m.name} to '${m.snap}' at`, finalPos);
                } else if ((baseObj as any).snappoints) {
                    // Search for partial match in snappoint names
                    for (const [snapName, snapObj] of (baseObj as any).snappoints) {
                        if (snapName.toLowerCase().includes(m.name.split(' ')[1].toLowerCase())) {
                            snapObj.getWorldPosition(finalPos);
                            console.log(`B3JS Template: Fuzzy-snapped ${m.name} to '${snapName}' at`, finalPos);
                            break;
                        }
                    }
                }
            }
            obj.object.position.copy(finalPos);
            if (m.rot) {
                const r = m.rot as [number, number, number];
                obj.object.rotation.fromArray(r);
            }
            if (obj.body) {
                obj.body.position.copy(finalPos as any);
                if (m.rot) {
                    const r = m.rot as [number, number, number];
                    obj.body.quaternion.setFromEuler(r[0], r[1], r[2]);
                }
            }
            engine.addObject(obj);
            console.log(`B3JS: ${m.name} loaded (${physics.bodies.length} bodies, ${physics.colliderMeshes.length} colliders)`);

            // Wire up Elevator Logic if this is the elevator model
            if (m.name === 'Bolt Elevator') {
                const elevator = obj;
                const elevatorAct = new ElevatorActuator();
                elevatorAct.inputs[1].value = -0.14015; // Floor 1 Y
                elevatorAct.inputs[2].value = 10.0;     // Floor 2 Y (Estimated)
                elevator.addActuator(elevatorAct);

                // Add Pulse effect to the carriage light strip
                const pulse = new PulseActuator();
                pulse.inputs[0].value = '#00aaff';
                pulse.inputs[3].value = 'BoltElevator_7'; // Target the specific light mesh
                pulse.inputs[4].value = 0.9; // Metalness
                pulse.inputs[5].value = 0.1; // Roughness
                elevator.addActuator(pulse);

                // Add a local light near the elevator to make it pop
                const light = engine.createLight('Elevator Light');
                light.object.position.set(-25, 5, -1.5);
                if (light.object instanceof THREE.PointLight) {
                    light.object.intensity = 50;
                    light.object.distance = 15;
                }

                // Find sub-meshes for gates (This is a simplified wire-up)
                // In a real scenario, we'd traverse the scene and find 'LowerGateRig', etc.
            }
        } catch (e) { console.warn(`B3JS: ${m.name} (${m.url}) failed to load.`, e); }
    }


    // Peripheral Props
    try {
        const aiGltf = await loader.loadAsync('/ai.glb');
        const aiMesh = aiGltf.scene;
        aiMesh.position.set(-4, 0, -6);
        aiMesh.scale.setScalar(2);
        const aiObj = new B3Object(aiMesh);
        aiObj.name = 'AI Beacon';
        aiObj.type = 'Prop';
        aiObj.isStatic = true;
        aiObj.modelUrl = '/ai.glb';
        engine.addObject(aiObj);
    } catch (e) { console.warn('B3JS: ai.glb not found, skipping.'); }

    try {
        const blockGltf = await loader.loadAsync('/crash-block.glb');
        const blockMesh = blockGltf.scene;
        blockMesh.position.set(5, 0, -3);
        const blockObj = new B3Object(blockMesh);
        blockObj.name = 'Crash Block';
        blockObj.type = 'Prop';
        blockObj.isStatic = true;
        blockObj.modelUrl = '/crash-block.glb';
        engine.addObject(blockObj);
    } catch (e) { console.warn('B3JS: crash-block.glb not found, skipping.'); }


    // 4. Wallet Connect Kiosk
    const kioskGeo = new THREE.CylinderGeometry(0.6, 0.6, 1.8, 16);
    const kioskMat = new THREE.MeshStandardMaterial({ color: 0x6366f1, metalness: 0.6, roughness: 0.3 });
    const kioskMesh = new THREE.Mesh(kioskGeo, kioskMat);
    kioskMesh.position.set(0, 0.9, -4);
    kioskMesh.castShadow = true;
    const kiosk = new B3Object(kioskMesh);
    kiosk.name = 'WalletConnect Kiosk';
    kiosk.type = 'Interactive';
    kiosk.isStatic = true;
    kiosk.body = new CANNON.Body({ mass: 0, shape: new CANNON.Cylinder(0.6, 0.6, 1.8, 16) });
    kiosk.body.position.set(0, 0.9, -4);

    // Attach Web3 Logic Bricks
    const col = new CollisionSensor('Actor');
    const ctrl = new AndController();
    const web3Act = new Web3ConnectActuator('Connect Wallet', '#6366f1', 5);
    col.id = 'boltevm_col'; ctrl.id = 'boltevm_ctrl'; web3Act.id = 'boltevm_w3';
    ctrl.sensors.push(col);
    ctrl.actuators.push(web3Act);
    kiosk.sensors.push(col);
    kiosk.controllers.push(ctrl);
    kiosk.actuators.push(web3Act);

    engine.addObject(kiosk);


    // 6. User Spawn Point
    const spawn = engine.createSpawnPoint("User Spawn");
    spawn.object.position.set(-17.4628, 0, 15.1885);
    if (spawn.body) {
        spawn.body.position.set(-17.4628, 0, 15.1885);
    }
    spawn.metadata.teamId = 0; // All teams/wildcard

    console.log(`B3JS Engine: ${name} Template Generated Successfully.`);
}

export async function createExchangeTemplate(engine: any, name = 'Deep Trading Pit') {
    console.log(`B3JS Engine: Generating ${name} Template...`);
    
    // 1. Futuristic Environment
    engine.resetScene();
    const floorGeo = new THREE.PlaneGeometry(60, 60);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.1, metalness: 0.9 });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    const floor = new B3Object(floorMesh);
    floor.name = 'Trading Floor';
    floor.isStatic = true;
    floor.body = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    floor.body.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    engine.addObject(floor);

    // 2. Cyber-lighting
    const amb = new THREE.AmbientLight(0x4444ff, 0.2);
    engine.scene.add(amb);
    const topLight = new THREE.RectAreaLight(0x00cc66, 20, 10, 10);
    topLight.position.set(0, 10, 0);
    topLight.lookAt(0, 0, 0);
    engine.scene.add(topLight);

    // 3. Central Web3 Gateway
    const gateway = createWeb3Gateway(engine, "Ethereum Gateway");
    gateway.object.position.set(0, 0.05, 0);
    if (gateway.body) gateway.body.position.set(0, 0.05, 0);

    // 4. Circular Trading Terminals
    for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const x = Math.cos(angle) * 8;
        const z = Math.sin(angle) * 8;
        
        const terminal = createMarketTerminal(engine, `Market Terminal ${i + 1}`);
        terminal.object.position.set(x, 0.9, z);
        terminal.object.lookAt(0, 0.9, 0);
        if (terminal.body) {
            terminal.body.position.set(x, 0.9, z);
            terminal.body.quaternion.copy(terminal.object.quaternion as any);
        }
    }

    // 5. Merchant Kiosks in the corners
    const corners = [[15, 0, 15], [-15, 0, 15], [15, 0, -15], [-15, 0, -15]];
    corners.forEach((pos, i) => {
        const shop = createShopKiosk(engine, `Merchant ${i + 1}`);
        shop.object.position.fromArray(pos);
        if (shop.body) shop.body.position.set(pos[0], pos[1], pos[2]);
    });

    console.log(`B3JS Engine: ${name} Template Generated.`);
}

export function createSpatialWalletTemplate(engine: any, name = 'Spatial Wallet') {
    console.log(`B3JS Engine: Generating ${name} Template...`);
    
    // 1. Futuristic Environment
    createDefaultEnvironment(engine);
    
    // 2. Web3 Gateway (The "Server")
    const gateway = createWeb3Gateway(engine, "Vault Gateway");
    gateway.object.position.set(0, 0, -5);
    if (gateway.body) gateway.body.position.set(0, 0, -5);
    
    // 3. Interactive Tokens (Semi-circle around player)
    const tokens = [
        { symbol: 'ETH', color: 0x6366f1, angle: -0.5 },
        { symbol: 'BTC', color: 0xf59e0b, angle: 0 },
        { symbol: 'SOL', color: 0x14f195, angle: 0.5 }
    ];
    
    const radius = 3.5;
    tokens.forEach(t => {
        const coin = createTokenCoin(engine, t.symbol, t.color);
        const x = Math.sin(t.angle) * radius;
        const z = -Math.cos(t.angle) * radius;
        coin.object.position.set(x, 1.4, z);
        if (coin.body) coin.body.position.set(x, 1.4, z);
        
        // Add Hand Gesture Sensor to each coin
        const gesture = new HandGestureSensor();
        coin.addSensor(gesture);
    });

    // 4. Secure PIN Entry (Center, eye level)
    const pinPad = createPinPad(engine);
    pinPad.object.position.set(0, 1.2, -2.5);

    console.log(`B3JS Engine: ${name} Template Generated.`);
}
