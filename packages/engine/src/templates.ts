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
        engine.addObject(baseObj);
        console.log(`B3JS: Bolt Base loaded (${physics.bodies.length} bodies, ${physics.colliderMeshes.length} colliders)`);
    } catch (e) { console.warn('B3JS: Bolt Base not found, skipping.', e); }

    const hyperfyModels: Array<{name: string, url: string, pos?: number[], scale?: number, snap?: string}> = [
        { name: 'Bolt Elevator', url: '/models/bolt-elevator-t.glb', pos: [-27.571096962155902, 0.03854718638173105, -1.4555988751008746], scale: 1 },
        { name: 'Bolt Engine', url: '/models/bolt-engine.glb', pos: [0,0,0], scale: 1 },
        { name: 'Bolt Speakers', url: '/models/bolt-speakers-t.glb', snap: 'speaker_mount', pos: [0,0,0], scale: 1 },
        { name: 'Bolt Tunnel', url: '/models/bolt-tunnel.glb', pos: [0,0,0], scale: 1 },
    ];

    for (const m of hyperfyModels) {
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
            
            if (physics.bodies.length > 0) {
                obj.body = physics.bodies[0].body;
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
            if (obj.body) {
                obj.body.position.copy(finalPos as any);
            }
            engine.addObject(obj);
            console.log(`B3JS: ${m.name} loaded (${physics.bodies.length} bodies, ${physics.colliderMeshes.length} colliders)`);
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

    // 5. Boundary pillars
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x16213e, roughness: 0.5 });
    const positions = [[-12,0,-12],[12,0,-12],[-12,0,12],[12,0,12]];
    positions.forEach((p, i) => {
        const pMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 6, 8), pillarMat);
        pMesh.position.set(p[0], 3, p[2]);
        pMesh.castShadow = true;
        const pObj = new B3Object(pMesh);
        pObj.name = `Pillar ${i + 1}`;
        pObj.type = 'Environment';
        pObj.isStatic = true;
        engine.addObject(pObj);
    });

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
        if (shop.body) shop.body.position.fromArray(pos);
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
