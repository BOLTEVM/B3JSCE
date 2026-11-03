/**
 * Ceremony Arena Template — the ZK ceremony tutorial world.
 *
 * Layout:
 *   - Forge Platform (west): a pre-built demo circuit (x² + 3 = 28) placed
 *     as physical gates with energy wires, ready to evaluate and publish.
 *   - Ceremony Altar (east): an auto-contributing shrine (turn sensor →
 *     contribute actuator) plus a celebration crystal that spins on each
 *     contribution.
 *   - The Vault (north-east): a sealed door wired to CeremonyPhaseSensor
 *     ('finalized') — it slides open when the ceremony completes and
 *     reveals the golden Parameters Artifact.
 *   - Info totems: in-world educational panels explaining circuits,
 *     ceremonies, entropy, and agents.
 *
 * Loading the arena auto-starts the guided tutorial (see tutorial.ts).
 */

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { B3Object } from './core/B3Object';
import { AndController } from './logic/controllers';
import { SpinnerActuator } from './logic/bolt_nodes';
import { createProceduralSky } from './logic/nodes/skybox';
import {
    CeremonyTurnSensor,
    CeremonyPhaseSensor,
    CeremonyContributionSensor,
    CeremonyContributeActuator,
    CeremonyUnlockActuator,
} from './logic/ceremony_nodes';
import { TutorialManager } from './tutorial';

// ─── In-world text panels ────────────────────────────────────────

function makeTextPanel(title: string, lines: string[], width = 3.2, height = 2.0): B3Object {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 320;
    const ctx = canvas.getContext('2d')!;

    // Background + border
    ctx.fillStyle = 'rgba(12, 8, 24, 0.92)';
    ctx.fillRect(0, 0, 512, 320);
    ctx.strokeStyle = '#b366ff';
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, 504, 312);

    // Title
    ctx.fillStyle = '#b366ff';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(title, 24, 48);

    // Body (word-wrapped)
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
        y += 10; // paragraph gap
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

export async function createCeremonyArenaTemplate(engine: any, name = 'Ceremony Arena') {
    console.log(`B3JS Engine: Generating ${name} Template...`);
    engine.resetScene();

    // 1. Sky + floor
    const { mesh: skyMesh } = createProceduralSky();
    const sky = new B3Object(skyMesh);
    sky.name = 'Skybox';
    sky.type = 'Skybox';
    sky.isStatic = true;
    engine.addObject(sky);

    const floorGeo = new THREE.CircleGeometry(34, 48);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x140d24, roughness: 0.85, metalness: 0.15 });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    const floor = new B3Object(floorMesh);
    floor.name = 'Arena Floor';
    floor.type = 'Environment';
    floor.isStatic = true;
    floor.body = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    floor.body.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    engine.addObject(floor);

    // 2. Lighting — twilight violet
    const ambient = new THREE.AmbientLight(0x6655aa, 0.55);
    engine.scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xccbbaa, 0.9);
    sun.position.set(12, 24, 8);
    sun.castShadow = true;
    engine.scene.add(sun);
    const altarLight = new THREE.PointLight(0xb366ff, 60, 22);
    altarLight.position.set(10, 5, 2);
    engine.scene.add(altarLight);
    const forgeLight = new THREE.PointLight(0x00d4ff, 40, 18);
    forgeLight.position.set(-10, 5, 0);
    engine.scene.add(forgeLight);

    // 3. Forge Platform (west)
    const platformGeo = new THREE.CylinderGeometry(6.5, 7, 0.4, 32);
    const platformMat = new THREE.MeshStandardMaterial({ color: 0x1c2a3a, metalness: 0.6, roughness: 0.35, emissive: 0x002233, emissiveIntensity: 0.5 });
    const platformMesh = new THREE.Mesh(platformGeo, platformMat);
    platformMesh.position.set(-10, 0.2, 0);
    platformMesh.receiveShadow = true;
    const platform = new B3Object(platformMesh);
    platform.name = 'Forge Platform';
    platform.type = 'Environment';
    platform.isStatic = true;
    platform.body = new CANNON.Body({ mass: 0, shape: new CANNON.Cylinder(6.5, 7, 0.4, 16) });
    platform.body.position.set(-10, 0.2, 0);
    engine.addObject(platform);

    // Pre-built demo circuit: prove knowledge of x such that x² + 3 = 28
    // (x = 5). Gates are physical objects on the platform.
    const forge = engine.circuitForge;
    forge.startForge('Initiation Circuit — x²+3=28');
    const gx = forge.placeGate('input', { x: -13, y: 1.6, z: -1.5 }, { label: 'x', isPrivate: true });
    const gx2 = forge.placeGate('mul', { x: -10.5, y: 1.6, z: -2.5 }, { label: 'x²' });
    const g3 = forge.placeGate('const', { x: -13, y: 1.6, z: 1.5 }, { label: 'three', constValue: '3' });
    const gadd = forge.placeGate('add', { x: -10.5, y: 1.6, z: 2 }, { label: 'x²+3' });
    const g28 = forge.placeGate('const', { x: -8, y: 1.6, z: 2.5 }, { label: 'target', constValue: '28' });
    const gassert = forge.placeGate('assert_eq', { x: -8, y: 1.6, z: 0 }, { label: 'proof' });
    const gout = forge.placeGate('output', { x: -6, y: 1.6, z: -1.5 }, { label: 'result' });
    forge.wireGates(gx, gx2);
    forge.wireGates(gx, gx2);
    forge.wireGates(gx2, gadd);
    forge.wireGates(g3, gadd);
    forge.wireGates(gadd, gassert);
    forge.wireGates(g28, gassert);
    forge.wireGates(gadd, gout);

    // 4. Ceremony Altar (east) — auto-contributing shrine
    const altarGeo = new THREE.CylinderGeometry(1.4, 1.8, 1.2, 24);
    const altarMat = new THREE.MeshStandardMaterial({ color: 0x2a1a3a, metalness: 0.7, roughness: 0.25 });
    const altarMesh = new THREE.Mesh(altarGeo, altarMat);
    altarMesh.position.set(10, 0.6, 2);
    altarMesh.castShadow = true;
    const altar = new B3Object(altarMesh);
    altar.name = 'Ceremony Altar';
    altar.type = 'Interactive';
    altar.isStatic = true;
    altar.body = new CANNON.Body({ mass: 0, shape: new CANNON.Cylinder(1.4, 1.8, 1.2, 12) });
    altar.body.position.set(10, 0.6, 2);

    // Shrine logic: when it's your turn, the altar channels entropy for you
    const turnSensor = new CeremonyTurnSensor('');
    const altarCtrl = new AndController();
    const contributeAct = new CeremonyContributeActuator('');
    contributeAct.attestation = 'channeled at the Ceremony Altar';
    altarCtrl.sensors.push(turnSensor);
    altarCtrl.actuators.push(contributeAct);
    altar.sensors.push(turnSensor);
    altar.controllers.push(altarCtrl);
    altar.actuators.push(contributeAct);
    engine.addObject(altar);

    // Celebration crystal — spins when any contribution lands
    const crystalGeo = new THREE.OctahedronGeometry(0.7);
    const crystalMat = new THREE.MeshStandardMaterial({
        color: 0xb366ff, emissive: 0x7a2bd8, emissiveIntensity: 1.4,
        metalness: 0.2, roughness: 0.15, transparent: true, opacity: 0.92,
    });
    const crystalMesh = new THREE.Mesh(crystalGeo, crystalMat);
    crystalMesh.position.set(10, 2.6, 2);
    const crystal = new B3Object(crystalMesh);
    crystal.name = 'Contribution Crystal';
    crystal.type = 'Interactive';
    crystal.isStatic = true;
    const pulseSensor = new CeremonyContributionSensor('');
    const crystalCtrl = new AndController();
    const spin = new SpinnerActuator();
    spin.inputs[1].value = 0;      // sx
    spin.inputs[2].value = 3.0;    // sy — spin around Y
    spin.inputs[3].value = 0;      // sz
    spin.inputs[4].value = '';     // target: whole object
    crystalCtrl.sensors.push(pulseSensor);
    crystalCtrl.actuators.push(spin);
    crystal.sensors.push(pulseSensor);
    crystal.controllers.push(crystalCtrl);
    crystal.actuators.push(spin);
    engine.addObject(crystal);

    // 5. The Vault (north-east) — opens when a ceremony finalizes
    const pillarGeo = new THREE.CylinderGeometry(0.4, 0.5, 4, 16);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x3a2a4a, metalness: 0.6, roughness: 0.3 });
    for (const px of [8.2, 11.8]) {
        const pillarMesh = new THREE.Mesh(pillarGeo, pillarMat);
        pillarMesh.position.set(px, 2, 10);
        pillarMesh.castShadow = true;
        const pillar = new B3Object(pillarMesh);
        pillar.name = 'Vault Pillar';
        pillar.type = 'Environment';
        pillar.isStatic = true;
        pillar.body = new CANNON.Body({ mass: 0, shape: new CANNON.Cylinder(0.4, 0.5, 4, 10) });
        pillar.body.position.set(px, 2, 10);
        engine.addObject(pillar);
    }

    const doorGeo = new THREE.BoxGeometry(3.2, 3.6, 0.35);
    const doorMat = new THREE.MeshStandardMaterial({
        color: 0x4a3a6a, metalness: 0.85, roughness: 0.2,
        emissive: 0xb366ff, emissiveIntensity: 0.25,
    });
    const doorMesh = new THREE.Mesh(doorGeo, doorMat);
    doorMesh.position.set(10, 1.8, 10);
    doorMesh.castShadow = true;
    const door = new B3Object(doorMesh);
    door.name = 'Vault Door';
    door.type = 'Interactive';
    door.isStatic = true;
    door.body = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(1.5, 1.8, 0.175)) });
    door.body.position.set(10, 1.8, 10);

    // Vault logic: ceremony finalized → door slides down into the floor
    const phaseSensor = new CeremonyPhaseSensor('', 'finalized');
    const doorCtrl = new AndController();
    const unlock = new CeremonyUnlockActuator();
    unlock.offsetY = -3.4;
    unlock.speed = 0.8;
    doorCtrl.sensors.push(phaseSensor);
    doorCtrl.actuators.push(unlock);
    door.sensors.push(phaseSensor);
    door.controllers.push(doorCtrl);
    door.actuators.push(unlock);
    engine.addObject(door);

    // The Parameters Artifact — the prize inside the vault
    const artifactGeo = new THREE.TorusKnotGeometry(0.45, 0.15, 96, 16);
    const artifactMat = new THREE.MeshStandardMaterial({
        color: 0xffd700, emissive: 0xaa8800, emissiveIntensity: 1.2,
        metalness: 0.9, roughness: 0.1,
    });
    const artifactMesh = new THREE.Mesh(artifactGeo, artifactMat);
    artifactMesh.position.set(10, 1.6, 11.4);
    const artifact = new B3Object(artifactMesh);
    artifact.name = 'Parameters Artifact';
    artifact.type = 'Prop';
    artifact.isStatic = true;
    // Spins forever once the ceremony finalizes (phase sensor stays positive)
    const artifactSensor = new CeremonyPhaseSensor('', 'finalized');
    const artifactCtrl = new AndController();
    const artifactSpin = new SpinnerActuator();
    artifactSpin.inputs[1].value = 0.3;
    artifactSpin.inputs[2].value = 0.8;
    artifactSpin.inputs[3].value = 0;
    artifactSpin.inputs[4].value = '';
    artifactCtrl.sensors.push(artifactSensor);
    artifactCtrl.actuators.push(artifactSpin);
    artifact.sensors.push(artifactSensor);
    artifact.controllers.push(artifactCtrl);
    artifact.actuators.push(artifactSpin);
    engine.addObject(artifact);

    // 6. Info totems — the educational trail
    const totems: Array<{ title: string; lines: string[]; pos: [number, number, number] }> = [
        {
            title: '⚡ The Forge',
            lines: [
                'Build circuits from physical gates. Every gate is a field operation (add / mul / hash); every wire carries a signal.',
                'The demo circuit proves: "I know x with x²+3 = 28" — without revealing x.',
                'Multiplication costs constraints. Addition is free.',
            ],
            pos: [-10, 2.2, -6.5],
        },
        {
            title: '🕯️ The Ceremony',
            lines: [
                'Groth16 keys need secret randomness ("toxic waste"). A ceremony splits it across participants.',
                'Each contributor mixes secret entropy into a public hash chain. Only commitments are published.',
                'If even ONE participant is honest, the parameters are safe.',
            ],
            pos: [10, 2.6, -2.5],
        },
        {
            title: '🤖 Agents Welcome',
            lines: [
                'Agents are first-class participants: they join the queue, contribute seed-bound entropy, and attest honestly.',
                'Console: B3_ZK.spawnAgent("Aria", "seed"). Or use the Ceremonies panel below.',
                'In a live lobby, agents connect over SpacetimeDB like any player.',
            ],
            pos: [4, 2.2, -8],
        },
        {
            title: '🚪 The Vault',
            lines: [
                'This door is wired to CeremonyPhaseSensor("finalized").',
                'When your ceremony completes, the door slides open and reveals the Parameters Artifact.',
                'Logic bricks make cryptography playable: sensors watch the chain, actuators reshape the world.',
            ],
            pos: [10, 4.2, 9.2],
        },
    ];
    for (const t of totems) {
        const panel = makeTextPanel(t.title, t.lines);
        place(panel, t.pos[0], t.pos[1], t.pos[2]);
        engine.addObject(panel);
    }

    // 7. Spawn point — facing the altar/forge axis
    const spawn = engine.createSpawnPoint('User Spawn');
    spawn.object.position.set(0, 0, 14);
    if (spawn.body) spawn.body.position.set(0, 0, 14);
    spawn.metadata.teamId = 0;

    // 8. Camera hint for the editor view
    engine.camera.position.set(0, 10, 22);
    engine.camera.lookAt(0, 1, 0);

    // 9. Begin the guided tutorial (unless already completed)
    if (engine.tutorial && !TutorialManager.hasCompleted()) {
        engine.tutorial.start(true);
    }

    console.log(`B3JS Engine: ${name} Template Generated.`);
}
