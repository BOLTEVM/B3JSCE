import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { B3Object } from './core/B3Object';
import { CollisionSensor } from './logic/sensors';
import { AndController } from './logic/controllers';
import { Web3ConnectActuator } from './logic/actuators';
import { createProceduralSky } from './logic/nodes/skybox';
import { processGlbPhysics } from './glbParser';

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

    console.log(`B3JS Engine: ${name} Template Generated Successfully.`);
}
