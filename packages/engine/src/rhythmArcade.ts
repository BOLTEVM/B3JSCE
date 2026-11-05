/**
 * Rhythm Arcade Template — a neon arcade hall for the DeFi rhythm games.
 *
 * Layout:
 *   - Five arcade cabinets in a horseshoe, one per mini-game. Each has a
 *     glowing launch pad in front: CollisionSensor → RhythmStartActuator.
 *   - A central "beat core" that pulses on every beat (RhythmBeatSensor →
 *     SpinnerActuator) and flares with the game's DeFi intensity.
 *   - A 16-bar visualizer wall behind the cabinets driven by the arcade's
 *     beat/judgement events (direct listener; no polling).
 *   - Quai hierarchy totem: nine Zone pillars under three Region rings
 *     under one Prime crown — the Merge Pulse topology, in the world.
 *   - Info totems explaining each game's DeFi lesson.
 *
 * Everything is a plain B3Object so it serializes with the scene.
 */

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { B3Object } from './core/B3Object';
import { AndController } from './logic/controllers';
import { CollisionSensor } from './logic/sensors';
import { SpinnerActuator } from './logic/bolt_nodes';
import { createProceduralSky } from './logic/nodes/skybox';
import { RhythmBeatSensor, RhythmStartActuator, RhythmFeverSensor } from './logic/rhythm_nodes';
import { QUAI_REGIONS, QUAI_ZONES } from './rhythm/defi';
import type { MiniGameMeta } from './rhythm/game';

function makeTextPanel(title: string, lines: string[], color = '#ff3333', width = 3.2, height = 2.0): B3Object {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 320;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(8, 6, 20, 0.94)'; ctx.fillRect(0, 0, 512, 320);
    ctx.strokeStyle = color; ctx.lineWidth = 6; ctx.strokeRect(4, 4, 504, 312);
    ctx.fillStyle = color; ctx.font = 'bold 30px sans-serif'; ctx.fillText(title, 24, 48);
    ctx.fillStyle = '#e5e5e5'; ctx.font = '21px sans-serif';
    let y = 88;
    for (const paragraph of lines) {
        let line = '';
        for (const word of paragraph.split(' ')) {
            const test = line ? `${line} ${word}` : word;
            if (ctx.measureText(test).width > 460) { ctx.fillText(line, 24, y); y += 27; line = word; } else line = test;
        }
        if (line) { ctx.fillText(line, 24, y); y += 27; }
        y += 10;
        if (y > 300) break;
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide }));
    const obj = new B3Object(mesh);
    obj.type = 'Prop';
    obj.isStatic = true;
    return obj;
}

function makeCabinet(engine: any, meta: MiniGameMeta, position: THREE.Vector3, facing: number) {
    const color = new THREE.Color(meta.color);
    const group = new THREE.Group();

    const body = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 2.4, 1.0),
        new THREE.MeshStandardMaterial({ color: 0x14121f, metalness: 0.6, roughness: 0.35 }),
    );
    body.position.y = 1.2;
    body.castShadow = true;
    group.add(body);

    const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(1.3, 0.9),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2 }),
    );
    screen.position.set(0, 1.75, 0.51);
    screen.rotation.x = -0.15;
    group.add(screen);

    const marquee = new THREE.Mesh(
        new THREE.BoxGeometry(1.7, 0.3, 1.1),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8 }),
    );
    marquee.position.y = 2.55;
    group.add(marquee);

    const trim = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 1.1), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.5 }));
    trim.position.y = 0.04;
    group.add(trim);

    const light = new THREE.PointLight(color, 6, 6);
    light.position.set(0, 2.2, 1.2);
    group.add(light);

    group.position.copy(position);
    group.rotation.y = facing;

    const cab = new B3Object(group);
    cab.name = `Cabinet: ${meta.title}`;
    cab.type = 'Prop';
    cab.isStatic = true;
    cab.body = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(0.8, 1.2, 0.5)) });
    cab.body.position.set(position.x, position.y + 1.2, position.z);
    cab.body.quaternion.setFromEuler(0, facing, 0);
    engine.addObject(cab);

    // Launch pad in front of the cabinet
    const padPos = position.clone().add(new THREE.Vector3(Math.sin(facing) * 1.6, 0.06, Math.cos(facing) * 1.6));
    const padMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.75, 0.85, 0.12, 24),
        new THREE.MeshStandardMaterial({ color: 0x0b0a14, emissive: color, emissiveIntensity: 0.6, metalness: 0.5, roughness: 0.4 }),
    );
    padMesh.position.copy(padPos);
    const pad = new B3Object(padMesh);
    pad.name = `Play ${meta.title}`;
    pad.type = 'Interactive';
    pad.isStatic = true;
    pad.body = new CANNON.Body({ mass: 0, shape: new CANNON.Cylinder(0.75, 0.85, 0.12, 12) });
    pad.body.position.set(padPos.x, padPos.y, padPos.z);
    const step = new CollisionSensor();
    const ctrl = new AndController();
    const start = new RhythmStartActuator(meta.id, 'normal');
    ctrl.sensors.push(step); ctrl.actuators.push(start);
    pad.sensors.push(step); pad.controllers.push(ctrl); pad.actuators.push(start);
    engine.addObject(pad);

    // Lesson totem beside the cabinet
    const totem = makeTextPanel(`${meta.icon} ${meta.title}`, [meta.tagline, meta.lesson, `Lanes: ${meta.laneLabels.join(' · ')}`], meta.color, 2.6, 1.6);
    const tPos = position.clone().add(new THREE.Vector3(Math.cos(facing) * 1.9, 1.6, -Math.sin(facing) * 1.9));
    totem.object.position.copy(tPos);
    totem.object.rotation.y = facing;
    totem.name = `Lesson: ${meta.title}`;
    engine.addObject(totem);

    return { screen, marquee, light };
}

export async function createRhythmArcadeTemplate(engine: any, name = 'Rhythm Arcade') {
    console.log(`B3JS Engine: Generating ${name} Template...`);
    engine.resetScene();

    // 1. Sky + floor
    const { mesh: skyMesh } = createProceduralSky();
    const sky = new B3Object(skyMesh);
    sky.name = 'Skybox'; sky.type = 'Skybox'; sky.isStatic = true;
    engine.addObject(sky);

    const floorMesh = new THREE.Mesh(
        new THREE.CircleGeometry(30, 64),
        new THREE.MeshStandardMaterial({ color: 0x0c0a16, roughness: 0.3, metalness: 0.7 }),
    );
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    const floor = new B3Object(floorMesh);
    floor.name = 'Arcade Floor'; floor.type = 'Environment'; floor.isStatic = true;
    floor.body = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    floor.body.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    engine.addObject(floor);

    const grid = new THREE.GridHelper(60, 60, 0xff3333, 0x221133);
    grid.position.y = 0.01;
    engine.scene.add(grid);

    // 2. Lighting — neon night
    engine.scene.add(new THREE.AmbientLight(0x443366, 0.5));
    const key = new THREE.DirectionalLight(0xffeeff, 0.5);
    key.position.set(10, 20, 8); key.castShadow = true;
    engine.scene.add(key);

    // 3. Cabinets in a horseshoe facing the center
    const games: MiniGameMeta[] = engine.rhythm?.listGames?.() ?? [];
    const radius = 9;
    const screens: Array<{ screen: THREE.Mesh; marquee: THREE.Mesh; light: THREE.PointLight; color: THREE.Color }> = [];
    games.forEach((meta, i) => {
        const a = -Math.PI * 0.75 + (i / Math.max(1, games.length - 1)) * Math.PI * 1.5;
        const pos = new THREE.Vector3(Math.sin(a) * radius, 0, Math.cos(a) * radius);
        const facing = Math.atan2(-pos.x, -pos.z); // face the centre
        const parts = makeCabinet(engine, meta, pos, facing);
        screens.push({ ...parts, color: new THREE.Color(meta.color) });
    });

    // 4. Beat core — pulses on every beat, spins faster during FEVER
    const coreMat = new THREE.MeshStandardMaterial({ color: 0xff3333, emissive: 0xff2222, emissiveIntensity: 1.0, metalness: 0.3, roughness: 0.2 });
    const coreMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 1), coreMat);
    coreMesh.position.set(0, 2.6, 0);
    const core = new B3Object(coreMesh);
    core.name = 'Beat Core'; core.type = 'Interactive'; core.isStatic = true;
    const beatSensor = new RhythmBeatSensor(1);
    const coreCtrl = new AndController();
    const coreSpin = new SpinnerActuator();
    coreSpin.inputs[1].value = 0; coreSpin.inputs[2].value = 6; coreSpin.inputs[3].value = 2; coreSpin.inputs[4].value = '';
    coreCtrl.sensors.push(beatSensor); coreCtrl.actuators.push(coreSpin);
    core.sensors.push(beatSensor); core.controllers.push(coreCtrl); core.actuators.push(coreSpin);
    const feverSensor = new RhythmFeverSensor();
    const feverCtrl = new AndController();
    const feverSpin = new SpinnerActuator();
    feverSpin.inputs[1].value = 4; feverSpin.inputs[2].value = 12; feverSpin.inputs[3].value = 4; feverSpin.inputs[4].value = '';
    feverCtrl.sensors.push(feverSensor); feverCtrl.actuators.push(feverSpin);
    core.sensors.push(feverSensor); core.controllers.push(feverCtrl); core.actuators.push(feverSpin);
    engine.addObject(core);
    const coreLight = new THREE.PointLight(0xff3333, 20, 18);
    coreLight.position.set(0, 3.2, 0);
    engine.scene.add(coreLight);

    // 5. Visualizer wall (north) — 16 bars driven by arcade events
    const bars: THREE.Mesh[] = [];
    const barMat = (c: number) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.9 });
    for (let i = 0; i < 16; i++) {
        const hue = i / 16;
        const col = new THREE.Color().setHSL(hue, 0.9, 0.55).getHex();
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1, 0.4), barMat(col));
        bar.position.set(-7.5 + i, 0.5, -14);
        bar.scale.y = 0.2;
        bars.push(bar);
    }
    const wallGroup = new THREE.Group();
    bars.forEach(b => wallGroup.add(b));
    const wall = new B3Object(wallGroup);
    wall.name = 'Visualizer Wall'; wall.type = 'Prop'; wall.isStatic = true;
    engine.addObject(wall);

    // 6. Quai hierarchy totem (south): 9 zones → 3 regions → 1 prime
    const totemGroup = new THREE.Group();
    QUAI_ZONES.forEach((zone, i) => {
        const region = Math.floor(i / 3);
        const x = (region - 1) * 2.4 + ((i % 3) - 1) * 0.7;
        const z = ((i % 3) - 1) * 0.4;
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.2, 12), new THREE.MeshStandardMaterial({ color: 0xff3333, emissive: 0x661111, emissiveIntensity: 0.8 }));
        m.position.set(x, 0.6, z); m.name = zone;
        totemGroup.add(m);
    });
    QUAI_REGIONS.forEach((region, r) => {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.08, 10, 32), new THREE.MeshStandardMaterial({ color: 0xff7777, emissive: 0xaa2222, emissiveIntensity: 1 }));
        ring.position.set((r - 1) * 2.4, 1.6, 0); ring.rotation.x = Math.PI / 2; ring.name = region;
        totemGroup.add(ring);
    });
    const prime = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff3333, emissiveIntensity: 1.6 }));
    prime.position.set(0, 2.9, 0); prime.name = 'Prime';
    totemGroup.add(prime);
    totemGroup.position.set(0, 0, 12);
    const totem = new B3Object(totemGroup);
    totem.name = 'Quai Hierarchy Totem'; totem.type = 'Prop'; totem.isStatic = true;
    engine.addObject(totem);

    const info = makeTextPanel('Quai Network', [
        'Quai is a hierarchy of blockchains: 1 Prime, 3 Regions (Cyprus, Paxos, Hydra) and 9 Zones.',
        'Merged mining lets one proof of work satisfy several tiers at once — Merge Pulse is that polyrhythm.',
        'Step on a pad to play. Keys D F J K, touch the lanes, or use a gamepad.',
    ]);
    info.object.position.set(0, 2.2, 15.5);
    info.object.rotation.y = Math.PI;
    info.name = 'Arcade Info';
    engine.addObject(info);

    // 7. Live reactions — direct subscription to arcade events
    const arcade = engine.rhythm;
    if (arcade?.on) {
        let activeIdx = -1;
        const decay: number[] = new Array(bars.length).fill(0);
        const unsub = arcade.on((e: any) => {
            if (e.type === 'start') activeIdx = games.findIndex(g => g.id === e.gameId);
            if (e.type === 'beat') {
                const k = e.beat % bars.length;
                decay[k] = 1;
                decay[(k + 8) % bars.length] = Math.max(decay[(k + 8) % bars.length], 0.6 + e.intensity * 0.4);
                coreMat.emissiveIntensity = 1.5 + e.intensity * 3;
                coreLight.intensity = 20 + e.intensity * 60;
                if (activeIdx >= 0 && screens[activeIdx]) screens[activeIdx].light.intensity = 10 + e.intensity * 30;
            }
            if (e.type === 'judgement') {
                const k = (e.lane * 4 + e.combo) % bars.length;
                decay[k] = e.judgement === 'PERFECT' ? 1 : e.judgement === 'MISS' ? 0.1 : 0.7;
            }
            if (e.type === 'fever') { for (let i = 0; i < decay.length; i++) decay[i] = 1; }
            if (e.type === 'end' || e.type === 'phase' && e.phase === 'idle') {
                if (activeIdx >= 0 && screens[activeIdx]) screens[activeIdx].light.intensity = 6;
                if (e.type === 'phase') activeIdx = -1;
            }
        });
        // Per-frame decay (hooked to the engine's render loop via a tiny B3Object)
        const ticker = new B3Object(new THREE.Object3D());
        ticker.name = 'Arcade Visualizer Driver'; ticker.type = 'Prop'; ticker.isStatic = true;
        const origUpdate = ticker.update.bind(ticker);
        ticker.update = (delta: number, eng: any) => {
            origUpdate(delta, eng);
            for (let i = 0; i < bars.length; i++) {
                decay[i] = Math.max(0, decay[i] - delta * 2.2);
                const target = 0.2 + decay[i] * 4.5;
                bars[i].scale.y += (target - bars[i].scale.y) * Math.min(1, delta * 14);
                bars[i].position.y = bars[i].scale.y / 2;
            }
            coreMat.emissiveIntensity += (1.0 - coreMat.emissiveIntensity) * Math.min(1, delta * 3);
            coreLight.intensity += (20 - coreLight.intensity) * Math.min(1, delta * 3);
        };
        (ticker as any)._rhythmUnsub = unsub;
        engine.addObject(ticker);
    }

    // 8. Camera
    engine.camera.position.set(0, 7, 20);
    engine.camera.lookAt(0, 1.5, 0);

    console.log(`B3JS Engine: ${name} Template Generated.`);
}
