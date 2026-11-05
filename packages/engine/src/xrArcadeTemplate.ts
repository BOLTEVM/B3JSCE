/**
 * XR Mini Game Arcade Template — Quai DeFi rhythm games in WebXR.
 *
 * A circular neon stage built around `engine.rhythm.xr`:
 *   - The XR picker: five floating game cards in an arc + difficulty chips.
 *     Point a controller at a card and pull the trigger (or click it on a
 *     flat screen) to start. The drum-pad stage recentres in front of you.
 *   - Drum pads: hit them with controllers or tracked hands; trigger while
 *     pointing also works. Grip pauses, both grips exit to the picker.
 *   - Beat-reactive floor ring + Quai hierarchy pillars (9 zones, 3
 *     regions, 1 prime) that light up with the run's DeFi intensity.
 *
 * Press "Enter VR" in the header after loading. Without a headset the
 * world still works as a 3D visualiser for keyboard/touch runs.
 */

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { B3Object } from './core/B3Object';
import { createProceduralSky } from './logic/nodes/skybox';
import { QUAI_ZONES } from './rhythm/defi';

export async function createXRArcadeTemplate(engine: any, name = 'XR Mini Game Arcade') {
    console.log(`B3JS Engine: Generating ${name} Template...`);
    engine.resetScene();

    const { mesh: skyMesh } = createProceduralSky();
    const sky = new B3Object(skyMesh);
    sky.name = 'Skybox'; sky.type = 'Skybox'; sky.isStatic = true;
    engine.addObject(sky);

    const floorMesh = new THREE.Mesh(new THREE.CircleGeometry(16, 64), new THREE.MeshStandardMaterial({ color: 0x0a0812, roughness: 0.25, metalness: 0.8 }));
    floorMesh.rotation.x = -Math.PI / 2; floorMesh.receiveShadow = true;
    const floor = new B3Object(floorMesh);
    floor.name = 'XR Arcade Floor'; floor.type = 'Environment'; floor.isStatic = true;
    floor.body = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    floor.body.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    engine.addObject(floor);

    engine.scene.add(new THREE.AmbientLight(0x553366, 0.6));
    const key = new THREE.DirectionalLight(0xffeeff, 0.4); key.position.set(6, 12, 4); engine.scene.add(key);

    // Beat ring on the floor around the player
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff3333, transparent: true, opacity: 0.35 });
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.6, 64), ringMat);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01;
    engine.scene.add(ring);
    const ring2 = new THREE.Mesh(new THREE.RingGeometry(3.0, 3.04, 64), new THREE.MeshBasicMaterial({ color: 0xff3333, transparent: true, opacity: 0.15 }));
    ring2.rotation.x = -Math.PI / 2; ring2.position.y = 0.01;
    engine.scene.add(ring2);

    // Quai pillars — 9 zones around the outer ring, lit by DeFi intensity
    const pillarMats: THREE.MeshStandardMaterial[] = [];
    const pillars = new THREE.Group();
    QUAI_ZONES.forEach((zone, i) => {
        const a = (i / 9) * Math.PI * 2;
        const mat = new THREE.MeshStandardMaterial({ color: 0x1a1020, emissive: 0xff3333, emissiveIntensity: 0.2, metalness: 0.6, roughness: 0.3 });
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 2.6 + (i % 3) * 0.4, 12), mat);
        m.position.set(Math.sin(a) * 6, m.geometry.parameters.height / 2, Math.cos(a) * 6);
        m.name = zone;
        pillars.add(m); pillarMats.push(mat);
    });
    const pillarsObj = new B3Object(pillars);
    pillarsObj.name = 'Quai Zone Pillars'; pillarsObj.type = 'Prop'; pillarsObj.isStatic = true;
    engine.addObject(pillarsObj);

    // The XR arcade itself (picker + stage + input)
    const xr = engine.rhythm?.xr;
    if (xr) {
        xr.mount(new THREE.Vector3(0, 0, 0), 0);

        // Flat-screen fallback: click a card with the mouse
        const dom: HTMLElement | undefined = engine.renderer?.domElement;
        const onPointer = (ev: PointerEvent) => {
            if (engine.renderer?.xr?.isPresenting) return;
            if (engine.rhythm.phase !== 'idle') return;
            const r = dom!.getBoundingClientRect();
            const x = ((ev.clientX - r.left) / r.width) * 2 - 1;
            const y = -((ev.clientY - r.top) / r.height) * 2 + 1;
            xr.pickAtNdc(x, y);
        };
        dom?.addEventListener('pointerdown', onPointer);

        // Beat reactions
        let pulse = 0; let intensity = 0;
        const unsub = engine.rhythm.on((e: any) => {
            if (e.type === 'beat') { pulse = 1; intensity = e.intensity; }
            if (e.type === 'fever') pulse = 2;
        });
        const driver = new B3Object(new THREE.Object3D());
        driver.name = 'XR Arcade Driver'; driver.type = 'Prop'; driver.isStatic = true;
        const orig = driver.update.bind(driver);
        driver.update = (delta: number, eng: any) => {
            orig(delta, eng);
            pulse = Math.max(0, pulse - delta * 3);
            ringMat.opacity = 0.25 + pulse * 0.5;
            ring.scale.setScalar(1 + pulse * 0.08);
            pillarMats.forEach((m, i) => { m.emissiveIntensity = 0.2 + intensity * 1.5 + pulse * (0.3 + 0.3 * Math.sin(i)); });
        };
        (driver as any)._xrArcadeCleanup = () => { unsub(); dom?.removeEventListener('pointerdown', onPointer); };
        engine.addObject(driver);
    }

    engine.camera.position.set(0, 1.6, 0.2);
    engine.camera.lookAt(0, 1.4, -2);
    console.log(`B3JS Engine: ${name} Template Generated. Press "Enter VR" to play in a headset.`);
}
