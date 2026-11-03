/**
 * QuaiAxe Furnace Template — the burn-mining tutorial world.
 *
 * Layout:
 *   - Mining Rig (west): a hash rig whose cooling fans spin while the miner
 *     is active (QuaiAxeMiningSensor → SpinnerActuator).
 *   - The Furnace (center): the QuaiAxeGame crucible — emissive core and
 *     point light flare with every burn batch.
 *   - Feed Pad (front of furnace): a pressure plate wired
 *     CollisionSensor → QuaiAxeFeedActuator — step on it to burn.
 *   - Ember Crystal (above furnace): pulses with every burn
 *     (QuaiAxeBurnSensor → SpinnerActuator).
 *   - Furnace Wall (north): the shared 32×32 pixel canvas, backed by the
 *     game's canvas texture and synced over SpacetimeDB when online.
 *   - Info totems: in-world educational panels about mining, shares, the
 *     burn split, and the wall economy.
 *
 * Loading the world auto-starts the QuaiAxe curriculum (see tutorial.ts).
 */

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { B3Object } from './core/B3Object';
import { AndController } from './logic/controllers';
import { CollisionSensor } from './logic/sensors';
import { SpinnerActuator } from './logic/bolt_nodes';
import { createProceduralSky } from './logic/nodes/skybox';
import {
    QuaiAxeMiningSensor,
    QuaiAxeBurnSensor,
    QuaiAxeFeedActuator,
} from './logic/qaxe_nodes';
import { TutorialManager, QUAIAXE_CURRICULUM } from './tutorial';

// ─── In-world text panels (same style as the Ceremony Arena) ─────

function makeTextPanel(title: string, lines: string[], width = 3.2, height = 2.0): B3Object {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 320;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = 'rgba(24, 10, 4, 0.92)';
    ctx.fillRect(0, 0, 512, 320);
    ctx.strokeStyle = '#ff7a1a';
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, 504, 312);

    ctx.fillStyle = '#ff7a1a';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(title, 24, 48);

    ctx.fillStyle = '#dddddd';
    ctx.font = '21px sans-serif';
    let y = 88;
    for (const paragraph of lines) {
        const words = paragraph.split(' ');
        let line = '';
        for (const word of words) {
            const test = line ? `${line} ${word}` : word;
            if (ctx.measureText(test).width > 460) {
                ctx.fillText(line, 24, y);
                y += 27;
                line = word;
            } else {
                line = test;
            }
        }
        if (line) { ctx.fillText(line, 24, y); y += 27; }
        y += 10;
        if (y > 300) break;
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(width, height),
        new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide }),
    );
    const obj = new B3Object(mesh);
    obj.name = `📖 ${title}`;
    obj.type = 'InfoPanel';
    obj.isStatic = true;
    return obj;
}

function place(obj: B3Object, x: number, y: number, z: number, faceX = 0, faceZ = 14): void {
    obj.object.position.set(x, y, z);
    obj.object.lookAt(faceX, y, faceZ);
    if (obj.body) obj.body.position.set(x, y, z);
}

// ─── Template ────────────────────────────────────────────────────

export async function createQuaiAxeFurnaceTemplate(engine: any, name = 'QuaiAxe Furnace') {
    console.log(`B3JS Engine: Generating ${name} Template...`);
    engine.resetScene();

    // 1. Sky + floor
    const { mesh: skyMesh } = createProceduralSky();
    const sky = new B3Object(skyMesh);
    sky.name = 'Skybox';
    sky.type = 'Skybox';
    sky.isStatic = true;
    engine.addObject(sky);

    const floorMesh = new THREE.Mesh(
        new THREE.CircleGeometry(34, 48),
        new THREE.MeshStandardMaterial({ color: 0x241408, roughness: 0.85, metalness: 0.15 }),
    );
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    const floor = new B3Object(floorMesh);
    floor.name = 'Furnace Floor';
    floor.type = 'Environment';
    floor.isStatic = true;
    floor.body = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    floor.body.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    engine.addObject(floor);

    // 2. Lighting — ember dusk
    engine.scene.add(new THREE.AmbientLight(0xaa6644, 0.5));
    const sun = new THREE.DirectionalLight(0xffcc99, 0.8);
    sun.position.set(12, 24, 8);
    sun.castShadow = true;
    engine.scene.add(sun);
    const rigLight = new THREE.PointLight(0x00d4ff, 30, 16);
    rigLight.position.set(-10, 4, 0);
    engine.scene.add(rigLight);

    // 3. Mining Rig (west) — fans spin while the miner hashes
    const rigBase = new THREE.Mesh(
        new THREE.BoxGeometry(3, 1.8, 1.6),
        new THREE.MeshStandardMaterial({ color: 0x22262e, metalness: 0.8, roughness: 0.35 }),
    );
    rigBase.position.set(-10, 1.1, 0);
    rigBase.castShadow = true;
    const rig = new B3Object(rigBase);
    rig.name = 'QUAI Mining Rig';
    rig.type = 'Interactive';
    rig.isStatic = true;
    rig.body = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(1.5, 0.9, 0.8)) });
    rig.body.position.set(-10, 1.1, 0);
    engine.addObject(rig);

    const fanMat = new THREE.MeshStandardMaterial({
        color: 0x00d4ff, emissive: 0x0088aa, emissiveIntensity: 0.8, metalness: 0.5, roughness: 0.3,
    });
    for (const dz of [-0.45, 0.45]) {
        const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 8), fanMat);
        fan.rotation.z = Math.PI / 2;
        fan.position.set(-8.45, 1.1, dz);
        const fanObj = new B3Object(fan);
        fanObj.name = 'Rig Fan';
        fanObj.type = 'Prop';
        fanObj.isStatic = true;
        const miningSensor = new QuaiAxeMiningSensor();
        const fanCtrl = new AndController();
        const spin = new SpinnerActuator();
        spin.inputs[1].value = 0;      // sx
        spin.inputs[2].value = 0;      // sy
        spin.inputs[3].value = 12;     // sz — fans spin fast around their axis
        spin.inputs[4].value = '';
        fanCtrl.sensors.push(miningSensor);
        fanCtrl.actuators.push(spin);
        fanObj.sensors.push(miningSensor);
        fanObj.controllers.push(fanCtrl);
        fanObj.actuators.push(spin);
        engine.addObject(fanObj);
    }

    // 4. The Furnace (center) — game-owned crucible with heat-driven glow
    engine.quaiAxe.spawnFurnace(new THREE.Vector3(0, 0, 0));

    // 5. Ember Crystal (above furnace) — pulses on every burn batch
    const emberMat = new THREE.MeshStandardMaterial({
        color: 0xff5500, emissive: 0xcc3300, emissiveIntensity: 1.4,
        metalness: 0.2, roughness: 0.15, transparent: true, opacity: 0.92,
    });
    const emberMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.6), emberMat);
    emberMesh.position.set(0, 4.4, 0);
    const ember = new B3Object(emberMesh);
    ember.name = 'Ember Crystal';
    ember.type = 'Interactive';
    ember.isStatic = true;
    const burnSensor = new QuaiAxeBurnSensor();
    const emberCtrl = new AndController();
    const emberSpin = new SpinnerActuator();
    emberSpin.inputs[1].value = 0;
    emberSpin.inputs[2].value = 4.0;   // spin around Y on each burn
    emberSpin.inputs[3].value = 0;
    emberSpin.inputs[4].value = '';
    emberCtrl.sensors.push(burnSensor);
    emberCtrl.actuators.push(emberSpin);
    ember.sensors.push(burnSensor);
    ember.controllers.push(emberCtrl);
    ember.actuators.push(emberSpin);
    engine.addObject(ember);

    // 6. Feed Pad (south of furnace) — step on it to execute a burn batch
    const padMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(1.1, 1.2, 0.15, 24),
        new THREE.MeshStandardMaterial({
            color: 0x3a1a08, emissive: 0xff5500, emissiveIntensity: 0.5,
            metalness: 0.6, roughness: 0.4,
        }),
    );
    padMesh.position.set(0, 0.08, 4);
    const pad = new B3Object(padMesh);
    pad.name = 'Furnace Feed Pad';
    pad.type = 'Interactive';
    pad.isStatic = true;
    pad.body = new CANNON.Body({ mass: 0, shape: new CANNON.Cylinder(1.1, 1.2, 0.15, 12) });
    pad.body.position.set(0, 0.08, 4);
    const stepSensor = new CollisionSensor();
    const padCtrl = new AndController();
    const feed = new QuaiAxeFeedActuator(0); // burn whatever is pending
    padCtrl.sensors.push(stepSensor);
    padCtrl.actuators.push(feed);
    pad.sensors.push(stepSensor);
    pad.controllers.push(padCtrl);
    pad.actuators.push(feed);
    engine.addObject(pad);

    // 7. Furnace Wall (north) — the shared 32×32 canvas
    engine.quaiAxe.spawnFurnaceWall(new THREE.Vector3(0, 5, -12), 0, 9);

    // 8. Info totems — the educational trail
    const totems: Array<{ title: string; lines: string[]; pos: [number, number, number] }> = [
        {
            title: '⛏️ The Rig',
            lines: [
                'Proof-of-work is a lottery: your hashrate is how many tickets you draw per second.',
                'Pools pay per SHARE — proof of real work at an easier target. Watch your acceptance rate.',
                'The fans spin while your miner is hashing (QuaiAxeMiningSensor).',
            ],
            pos: [-10, 2.4, -3.5],
        },
        {
            title: '🔥 The Split',
            lines: [
                'Each burn batch: 0.5% protocol fee, then your chosen burn share (min 10%) buys and burns $QAXE.',
                'A gas refund (max 3%) is charged to the burn side. The rest is your payout.',
                'Example: 100 QUAI at 70% burn = 66.65 burned, 29.85 paid out, 0.50 fee, 3.00 gas.',
            ],
            pos: [5.5, 2.4, 2],
        },
        {
            title: '🏭 The Furnace',
            lines: [
                'Feed the furnace to execute a burn batch over your pending pot.',
                'Step on the feed pad, or use the QuaiAxe panel. Every burn flares the furnace.',
                'In a live lobby, ALL miners heat the same furnace — burns are logged to a shared table.',
            ],
            pos: [-4.5, 2.4, 4.5],
        },
        {
            title: '🎨 The Wall',
            lines: [
                'A shared 32x32 canvas paid with burn payouts: 10 QUAI empty, 150 QUAI overwrite.',
                'Overwrites cost 15x because they destroy another player\'s work.',
                'Pixels sync across the lobby — claim your corner.',
            ],
            pos: [0, 2.2, -8],
        },
    ];
    for (const t of totems) {
        const panel = makeTextPanel(t.title, t.lines);
        place(panel, t.pos[0], t.pos[1], t.pos[2]);
        engine.addObject(panel);
    }

    // 9. Spawn point — facing the furnace
    const spawn = engine.createSpawnPoint('User Spawn');
    spawn.object.position.set(0, 0, 14);
    if (spawn.body) spawn.body.position.set(0, 0, 14);
    spawn.metadata.teamId = 0;

    // 10. Camera hint
    engine.camera.position.set(0, 10, 22);
    engine.camera.lookAt(0, 1, 0);

    // 11. Begin the QuaiAxe curriculum (unless already completed)
    if (engine.tutorial && !TutorialManager.hasCompleted('quaiaxe')) {
        engine.tutorial.startCurriculum('quaiaxe', QUAIAXE_CURRICULUM, true);
    }

    console.log(`B3JS Engine: ${name} Template Generated.`);
}
