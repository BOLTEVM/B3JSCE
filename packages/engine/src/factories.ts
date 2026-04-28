import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { B3Object } from './core/B3Object';
import { B3AudioSource } from './audio_sources';
import { AndController } from './logic/controllers';
import { MotionActuator, InventoryActuator } from './logic/actuators';
import { CollisionSensor } from './logic/sensors';
import { SightSensor, BoneLookAtActuator } from './ai_nodes';

/**
 * Object factory functions. Each accepts a B3Engine reference and returns a configured B3Object.
 * B3Engine delegates its createXxx methods to these.
 */

export function createCube(engine: any, name = "Cube") {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0x444444 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    
    const b3obj = new B3Object(mesh);
    b3obj.name = name;
    b3obj.type = "Primitive";
    
    const body = new CANNON.Body({
        mass: 1,
        shape: new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5))
    });
    body.position.set(0, 5, 0);
    b3obj.body = body;
    
    engine.addObject(b3obj);
    return b3obj;
}

export function createSphere(engine: any, name = "Sphere") {
    const geo = new THREE.SphereGeometry(0.5, 32, 32);
    const mat = new THREE.MeshStandardMaterial({ color: 0x444444 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    
    const b3obj = new B3Object(mesh);
    b3obj.name = name;
    b3obj.type = "Primitive";
    
    const body = new CANNON.Body({
        mass: 1,
        shape: new CANNON.Sphere(0.5)
    });
    body.position.set(0, 5, 0);
    b3obj.body = body;
    
    engine.addObject(b3obj);
    return b3obj;
}

export function createLight(engine: any, name = "PointLight") {
    const light = new THREE.PointLight(0xffffff, 10, 50);
    light.position.set(2, 5, 2);
    
    const b3obj = new B3Object(light);
    b3obj.name = name;
    b3obj.type = "Light";
    
    engine.addObject(b3obj);
    return b3obj;
}

export function createNPC(engine: any, name = "Basic NPC") {
    const npc = createCube(engine, name);
    npc.isActor = true;
    npc.teamId = 2;
    npc.type = "Actor";
    (npc.object as THREE.Mesh).material = new THREE.MeshStandardMaterial({ color: 0xff3333 });

    const and = new AndController();
    const motion = new MotionActuator(npc.object, new THREE.Vector3(0, 0, 0));
    npc.addController(and);
    npc.addActuator(motion);
    
    return npc;
}

export function createWeaponUnit(engine: any, name = "Combat Turret") {
    const weapon = createCube(engine, name);
    (weapon.object as THREE.Mesh).scale.set(0.5, 2, 0.5);
    weapon.isWeapon = true;
    weapon.weaponMode = 'physical';
    weapon.type = "Weapon";
    return weapon;
}

export function createVehicleBase(engine: any, name = "Vehicle Chassis") {
    const chassis = createCube(engine, name);
    (chassis.object as THREE.Mesh).scale.set(2, 0.5, 4);
    chassis.isVehicle = true;
    chassis.type = "Vehicle";
    chassis.seats.push({ name: "Driver", offset: new THREE.Vector3(0, 0.6, 0), occupantId: null });
    
    engine.vehicles.createVehicle(chassis);
    return chassis;
}

export function createSpatialAudio(engine: any, url: string, name = "AudioSource") {
    const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xe68523, wireframe: true })
    );
    const b3obj = new B3Object(mesh);
    b3obj.name = name;
    b3obj.type = "Audio";

    const source = new B3AudioSource(engine.audio.getListener(), url);
    b3obj.object.add(source.audio);
    (b3obj as any).audioSource = source;

    engine.addObject(b3obj);
    return b3obj;
}

export function createAmmoPickup(engine: any, name = "Ammo Case") {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.3), new THREE.MeshStandardMaterial({ color: 0xe68523 }));
    const obj = new B3Object(mesh);
    obj.name = name;
    obj.type = "Pickup";
    obj.metadata = { ammoType: 'Standard', quantity: 30 };
    
    const col = new CollisionSensor();
    const act = new InventoryActuator('Standard', 30);
    const ctrl = new AndController();
    
    col.id = "col1"; act.id = "act1"; ctrl.id = "ctrl1";
    
    ctrl.sensors.push(col);
    ctrl.actuators.push(act);
    
    obj.sensors.push(col);
    obj.actuators.push(act);
    obj.controllers.push(ctrl);
    
    engine.addObject(obj);
    return obj;
}

export function createHealthPickup(engine: any, name = "Medkit") {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.1), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    const obj = new B3Object(mesh);
    obj.name = name;
    obj.type = "Pickup";
    
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.12), new THREE.MeshStandardMaterial({ color: 0xff3333 }));
    obj.object.add(cross);
    
    engine.addObject(obj);
    return obj;
}

export function createAdvancedActor(engine: any, name = "Tactical Hero") {
    const actor = createNPC(engine, name);
    actor.isActor = true;
    actor.teamId = 1;
    actor.inventory.addItem({
        name: "Initial Gear",
        category: 'Material',
        weight: 1,
        stackable: true,
        quantity: 1
    });

    actor.setAvatar("https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/CesiumMan/glTF-Binary/CesiumMan.glb");
    
    // Add procedural bone logic
    const sight = new SightSensor();
    const lookAt = new BoneLookAtActuator("Skeleton_neck_02"); // Typical CesiumMan neck bone
    
    const ctrl = new AndController();
    ctrl.sensors.push(sight);
    ctrl.actuators.push(lookAt);

    // Dynamic execution binding
    sight.id = "sight1";
    lookAt.id = "lookAt1";
    ctrl.id = "ctrl_look";

    actor.sensors.push(sight);
    actor.controllers.push(ctrl);
    actor.actuators.push(lookAt);
    
    // During execution, the AndController updates the actuator
    // But BoneLookAtActuator expects `targetObject` to be set.
    // Let's hook a callback or simply override execute for the demo:
    const originalExecute = lookAt.execute;
    lookAt.execute = function(delta, b3obj, engine) {
        if (sight.positive && sight.detectedObject) {
            this.targetObject = sight.detectedObject;
        } else {
            this.targetObject = null;
        }
        originalExecute.call(this, delta, b3obj, engine);
    };

    return actor;
}

export function createUnitreeBot(engine: any, name = "Unitree B1") {
    const bot = createCube(engine, name);
    bot.type = "Robotic";
    (bot.object as THREE.Mesh).scale.set(0.6, 0.4, 0.8);
    (bot.object as THREE.Mesh).material = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.2 });
    
    engine.digitalTwin.attach(bot);
    
    engine.robotics.onTelemetry((data: any) => {
        engine.digitalTwin.update(data);
    });

    return bot;
}

export function createSpawnPoint(engine: any, name = "Spawn Point") {
    const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 0.1, 16),
        new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true, transparent: true, opacity: 0.5 })
    );
    const b3obj = new B3Object(mesh);
    b3obj.name = name;
    b3obj.type = "SpawnPoint";
    b3obj.metadata = { teamId: 0, spawnType: 'All' };
    
    engine.addObject(b3obj);
    return b3obj;
}
