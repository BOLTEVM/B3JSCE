import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { nanoid } from 'nanoid';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { 
    ShaderNode, ShaderMaterialGenerator, OutputNode, UniformManager 
} from '../shaders';
import { InventoryManager, B3Item } from '../inventory';
import { createEntity, EntityId } from '../ecs';
import { Sensor, Controller, Actuator } from '../logic/base';
import { getSensorFactory, getControllerFactory, getActuatorFactory, getShaderNodeFactory } from './registry';

/**
 * B3Object: A Three.js object wrapper with logic, physics, ECS, and shader support.
 */
export class B3Object {
    id: string = nanoid();
    networkId: string = nanoid();
    name: string = "Unnamed Object";
    type: string = "Object";
    private _fallbackLogic: any = { sensors: [], controllers: [], actuators: [] };
    
    get sensors(): Sensor[] {
        if (!this._engineRef) return this._fallbackLogic.sensors;
        return this._engineRef.ecs.getComponent(this.ecsEntityId, 'Logic')?.sensors || this._fallbackLogic.sensors;
    }
    set sensors(s: Sensor[]) {
        if (!this._engineRef) { this._fallbackLogic.sensors = s; return; }
        const l = this._engineRef.ecs.getComponent(this.ecsEntityId, 'Logic');
        if (l) l.sensors = s;
    }
    
    get controllers(): Controller[] {
        if (!this._engineRef) return this._fallbackLogic.controllers;
        return this._engineRef.ecs.getComponent(this.ecsEntityId, 'Logic')?.controllers || this._fallbackLogic.controllers;
    }
    set controllers(c: Controller[]) {
        if (!this._engineRef) { this._fallbackLogic.controllers = c; return; }
        const l = this._engineRef.ecs.getComponent(this.ecsEntityId, 'Logic');
        if (l) l.controllers = c;
    }

    get actuators(): Actuator[] {
        if (!this._engineRef) return this._fallbackLogic.actuators;
        return this._engineRef.ecs.getComponent(this.ecsEntityId, 'Logic')?.actuators || this._fallbackLogic.actuators;
    }
    set actuators(a: Actuator[]) {
        if (!this._engineRef) { this._fallbackLogic.actuators = a; return; }
        const l = this._engineRef.ecs.getComponent(this.ecsEntityId, 'Logic');
        if (l) l.actuators = a;
    }
    body?: CANNON.Body;
    parent: B3Object | null = null;
    children: B3Object[] = [];
    metadata: any = {};

    // Asset URL for GLB/GLTF models (persisted for deserialization reload)
    modelUrl: string = "";

    // Shader Graph Support
    isNodalMaterial: boolean = false;
    materialNodes: ShaderNode[] = [];
    shaderUniforms: UniformManager = new UniformManager();
    private standardMaterial: THREE.Material;

    // Networking State
    isRemote: boolean = false;
    syncTransform: boolean = true;
    targetPosition: THREE.Vector3 = new THREE.Vector3();
    targetQuaternion: THREE.Quaternion = new THREE.Quaternion();

    // Optimization State
    isStatic: boolean = false;
    isInstanced: boolean = false;
    instanceIndex: number = -1;
    zoneId: string = "";

    // Actor State
    isActor: boolean = false;
    teamId: number = 0; // 0: Neutral, 1: Player, 2: Enemy
    
    // ECS Interop
    ecsEntityId: EntityId;
    private _engineRef: any = null; // B3Engine — typed as any to avoid circular import
    
    get health(): number { 
        if (this._engineRef) {
            const h = this._engineRef.ecs.getComponent(this.ecsEntityId, 'Health');
            if (h) return h.hp;
        }
        return 100;
    }
    set health(v: number) {
        if (this._engineRef) {
            const h = this._engineRef.ecs.getComponent(this.ecsEntityId, 'Health');
            if (h) h.hp = v;
        }
    }
    get maxHealth(): number {
        if (this._engineRef) {
            const h = this._engineRef.ecs.getComponent(this.ecsEntityId, 'Health');
            if (h) return h.maxHp;
        }
        return 100;
    }
    set maxHealth(v: number) {
        if (this._engineRef) {
            const h = this._engineRef.ecs.getComponent(this.ecsEntityId, 'Health');
            if (h) h.maxHp = v;
        }
    }
    speed: number = 0.1;
    perceptionRadius: number = 10;

    /** Computed speed accounting for encumbrance. Never mutates `speed`. */
    get effectiveSpeed(): number {
        if (this.inventory.useWeightLimit && this.inventory.getTotalWeight() > this.inventory.maxWeight) {
            const overage = this.inventory.getTotalWeight() / this.inventory.maxWeight;
            return this.speed * Math.max(0.1, 1.0 / overage);
        }
        return this.speed;
    }

    // Vehicle & Socket State
    isVehicle: boolean = false;
    vehicleId: string = "";
    seats: { name: string, offset: THREE.Vector3, occupantId: string | null }[] = [];
    
    // Physics / Transform State
    _physicsDirty: boolean = false;

    // Combat State
    isWeapon: boolean = false;
    weaponMode: 'physical' | 'hitscan' = 'physical';
    damage: number = 10;
    fireRate: number = 0.5;
    projectileForce: number = 50;
    lastFireTime: number = 0;

    // Inventory & Gear
    inventory: InventoryManager = new InventoryManager();
    sockets: Map<string, THREE.Object3D> = new Map();
    private equippedModels: Map<string, THREE.Object3D> = new Map();

    // Avatar & Visuals
    public avatarUrl: string = "";
    private visualGroup: THREE.Group = new THREE.Group();

    // Skeleton & Animation
    mixer: THREE.AnimationMixer | null = null;
    bones: Map<string, THREE.Bone> = new Map();
    activeAnimations: Map<string, THREE.AnimationAction> = new Map();

    // GLTF Metadata & Snappoints
    public snappoints: Map<string, THREE.Object3D> = new Map();

    constructor(public object: THREE.Object3D) {
        this.ecsEntityId = createEntity();
        this.object.userData.b3obj = this;
        this.targetPosition.copy(object.position);
        this.targetQuaternion.copy(object.quaternion);
        
        this.object.add(this.visualGroup);
        if (this.object instanceof THREE.Mesh) {
            const placeholder = new THREE.Mesh(this.object.geometry, this.object.material);
            this.visualGroup.add(placeholder);
            (this.object as any).visible = false; 
        }

        if ((this.object as any).material) {
            this.standardMaterial = (this.object as any).material;
        } else {
            this.standardMaterial = new THREE.MeshStandardMaterial({ color: 0x444444 });
        }
        
        this.initSockets();
        this.extractMetadata();
    }

    setEngineRef(engine: any) {
        this._engineRef = engine;
        engine.ecs.spawnWithId(this.ecsEntityId);
        
        engine.ecs.addComponent(this.ecsEntityId, { _type: 'Health', hp: 100, maxHp: 100 });
        engine.ecs.addComponent(this.ecsEntityId, { 
            _type: 'Logic', 
            sensors: this._fallbackLogic.sensors, 
            controllers: this._fallbackLogic.controllers, 
            actuators: this._fallbackLogic.actuators 
        });
    }

    public async setAvatar(url: string) {
        this.avatarUrl = url;
        if (!url) return;

        console.log(`B3JS Engine: Loading Avatar -> ${url}`);
        const loader = new GLTFLoader();
        
        try {
            const gltf = await loader.loadAsync(url);
            [...this.visualGroup.children].forEach(child => this.visualGroup.remove(child));
            this.visualGroup.add(gltf.scene);
            this.visualGroup.visible = true;
            this.rebindSocketsToModel(gltf.scene);

            // Extract Skeleton & Animations
            this.mixer = new THREE.AnimationMixer(gltf.scene);
            this.bones.clear();
            gltf.scene.traverse((child) => {
                if (child instanceof THREE.Bone) {
                    this.bones.set(child.name, child);
                }
            });
            
            if (gltf.animations && gltf.animations.length > 0) {
                gltf.animations.forEach(clip => {
                    this.activeAnimations.set(clip.name, this.mixer!.clipAction(clip));
                });
            }

            this.extractMetadata();

            console.log(`B3JS Engine: Avatar Loaded Successfully. Found ${this.bones.size} bones, ${this.snappoints.size} snappoints, and ${this.activeAnimations.size} animations.`);
        } catch (e) {
            console.error(`B3JS Engine: Failed to load avatar ${url}`, e);
        }
    }

    /**
     * Traverses the 3D object to extract snappoints and generate colliders from metadata.
     */
    public extractMetadata() {
        this.snappoints.clear();
        const foundSnaps: string[] = [];
        const foundColliders: string[] = [];

        this.object.traverse((child) => {
            const data = child.userData;
            if (!data) return;

            // 1. Snappoints (Explicit 'snappoint' property or 'SNAP_' prefix)
            if (data.snappoint || data.node === 'snap' || child.name.toLowerCase().startsWith('snap')) {
                const name = data.snappoint || data.name || child.name;
                this.snappoints.set(name, child);
                foundSnaps.push(name);
            }

            // 2. Physics Colliders from Metadata
            if (data.collider) {
                this.generatePhysicsFromMetadata(child, data.collider);
                foundColliders.push(`${child.name}(${data.collider})`);
            }

            // 3. Sync other custom properties to B3Object metadata
            Object.assign(this.metadata, data);
        });

        if (foundSnaps.length > 0 || foundColliders.length > 0) {
            console.log(`B3JS Engine: Metadata Extraction for ${this.name}:`, {
                snappoints: foundSnaps,
                colliders: foundColliders
            });
        }
    }

    private generatePhysicsFromMetadata(child: THREE.Object3D, type: string) {
        if (!this.body) {
            this.body = new CANNON.Body({ mass: this.isStatic ? 0 : 1 });
            this._physicsDirty = true;
        }

        const worldPos = new THREE.Vector3();
        const worldQuat = new THREE.Quaternion();
        const worldScale = new THREE.Vector3();
        child.updateMatrixWorld(true);
        child.getWorldPosition(worldPos);
        child.getWorldQuaternion(worldQuat);
        child.getWorldScale(worldScale);

        // Relative offset from B3Object origin
        const offset = worldPos.clone().sub(this.object.position);
        
        let shape: CANNON.Shape;
        if (type === 'box') {
            const bbox = new THREE.Box3().setFromObject(child);
            const size = new THREE.Vector3();
            bbox.getSize(size);
            shape = new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2));
        } else if (type === 'sphere') {
            const bsphere = new THREE.Sphere();
            new THREE.Box3().setFromObject(child).getBoundingSphere(bsphere);
            shape = new CANNON.Sphere(bsphere.radius);
        } else if (type === 'plane') {
            shape = new CANNON.Plane();
        } else {
            // Default to box if unknown
            const bbox = new THREE.Box3().setFromObject(child);
            const size = new THREE.Vector3();
            bbox.getSize(size);
            shape = new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2));
        }

        this.body.addShape(shape, offset as any, worldQuat as any);
        this.body.updateBoundingRadius();
    }

    /** Returns the world position of a snappoint by name. */
    public getSnappointPosition(name: string): THREE.Vector3 | null {
        const snap = this.snappoints.get(name);
        if (!snap) return null;
        const pos = new THREE.Vector3();
        snap.getWorldPosition(pos);
        return pos;
    }

    private rebindSocketsToModel(model: THREE.Group) {
        this.sockets.forEach((socket, name) => {
            const bone = model.getObjectByName(name) || model.getObjectByName(`SOCKET_${name}`);
            if (bone) {
                console.log(`B3JS Engine: Re-binding socket '${name}' to model bone.`);
                bone.add(socket);
                socket.position.set(0, 0, 0);
            } else {
                this.object.add(socket);
            }
        });
    }

    public getBone(name: string): THREE.Bone | undefined {
        return this.bones.get(name);
    }

    public playAnimation(name: string, crossFadeTime: number = 0.2) {
        if (!this.mixer) return;
        const action = this.activeAnimations.get(name);
        if (action) {
            this.mixer.stopAllAction();
            action.reset().fadeIn(crossFadeTime).play();
        }
    }

    public recalculatePhysicsBody() {
        if (!this.body) return;

        const bbox = new THREE.Box3().setFromObject(this.visualGroup);
        const size = new THREE.Vector3();
        bbox.getSize(size);

        console.log(`B3JS Engine: Recalculating Physics for ${this.name}. Size:`, size);

        while (this.body.shapes.length > 0) this.body.removeShape(this.body.shapes[0]);

        const shape = new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2));
        this.body.addShape(shape);
        
        const center = new THREE.Vector3();
        bbox.getCenter(center);
        const localCenter = center.sub(this.object.position);
        this.body.shapeOffsets[0].copy(localCenter as any);
        
        this.body.updateBoundingRadius();
    }

    public normalizeScale() {
        if (!this.object) return;
        
        this.object.updateMatrixWorld(true);

        const scale = this.object.scale.clone();
        
        if (this.object instanceof THREE.Mesh && this.object.geometry) {
            this.object.geometry.scale(scale.x, scale.y, scale.z);
            this.object.geometry.computeBoundingBox();
            this.object.geometry.computeBoundingSphere();
        } else {
            this.object.traverse((child) => {
                if (child instanceof THREE.Mesh && child.geometry) {
                    child.geometry.scale(scale.x, scale.y, scale.z);
                    child.geometry.computeBoundingBox();
                    child.geometry.computeBoundingSphere();
                }
            });
        }
        
        this.object.scale.set(1, 1, 1);
        this._physicsDirty = true;
    }

    private initSockets() {
        const socketNames = ['hand_R', 'hand_L', 'back', 'head', 'chest'];
        socketNames.forEach(name => {
            const socket = new THREE.Object3D();
            socket.name = `SOCKET_${name}`;
            this.object.add(socket);
            this.sockets.set(name, socket);
        });
    }

    public equipItem(item: B3Item) {
        if (!item.slot) return;
        
        this.unequipItem(item.slot);
        this.inventory.equipped.set(item.slot, item);

        if (item.modelUrl) {
            const socket = this.sockets.get(item.slot);
            if (socket) {
                const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.4), new THREE.MeshStandardMaterial({ color: 0xffaa00 }));
                socket.add(mesh);
                this.equippedModels.set(item.slot, mesh);
            }
        }

        if (item.stats?.damage && this.isWeapon) {
            this.damage += item.stats.damage;
        }
        console.log(`B3JS Gear: Equipped ${item.name} to ${item.slot}`);
    }

    public unequipItem(slot: string) {
        const item = this.inventory.equipped.get(slot);
        if (!item) return;

        const model = this.equippedModels.get(slot);
        if (model) {
            const socket = this.sockets.get(slot);
            if (socket) socket.remove(model);
            this.equippedModels.delete(slot);
        }

        if (item.stats?.damage && this.isWeapon) {
            this.damage -= item.stats.damage;
        }

        this.inventory.equipped.delete(slot);
    }

    recompileMaterial() {
        if (!this.isNodalMaterial) {
            if ((this.object as any).material) (this.object as any).material = this.standardMaterial;
            return;
        }

        if (!this.materialNodes.find(n => n.getTypeName() === 'OutputNode')) {
            this.materialNodes.push(new OutputNode());
        }

        const generator = new ShaderMaterialGenerator(this.materialNodes);
        const vertexShader = generator.generate('vertex');
        const fragmentShader = generator.generate('fragment');

        const material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
                uTime: { value: 0 },
                uAudioData: { value: new Float32Array(128) },
                ...this.shaderUniforms.getThreeUniforms()
            }
        });

        if ((this.object as any).material) (this.object as any).material = material;
    }

    addChild(child: B3Object) {
        child.parent = this;
        this.children.push(child);
        this.object.add(child.object);
    }

    removeChild(child: B3Object) {
        const index = this.children.indexOf(child);
        if (index > -1) {
            this.children.splice(index, 1);
            child.parent = null;
            this.object.remove(child.object);
        }
    }

    removeSensor(s: Sensor) {
        const i = this.sensors.indexOf(s);
        if (i > -1) {
            this.sensors.splice(i, 1);
            if (s.dispose) s.dispose();
        }
    }

    removeController(c: Controller) {
        const i = this.controllers.indexOf(c);
        if (i > -1) {
            this.controllers.splice(i, 1);
            if (c.dispose) c.dispose();
        }
    }

    removeActuator(a: Actuator) {
        const i = this.actuators.indexOf(a);
        if (i > -1) {
            this.actuators.splice(i, 1);
            if (a.dispose) a.dispose();
        }
    }

    addSensor(s: Sensor) { this.sensors.push(s); }
    addController(c: Controller) { this.controllers.push(c); }
    addActuator(a: Actuator) { this.actuators.push(a); }

    update(delta: number, engine: any) {
        if (!this.object) return;
        
        if (this.mixer) {
            this.mixer.update(delta);
        }

        if (!this.isRemote) {
            if (this.body && this.body.type === CANNON.Body.DYNAMIC) {
                this.object.position.copy(this.body.position as any);
                this.object.quaternion.copy(this.body.quaternion as any);
            }
        } else {
            this.object.position.lerp(this.targetPosition, 0.1);
            this.object.quaternion.slerp(this.targetQuaternion, 0.1);
        }

        if (this.isNodalMaterial && (this.object as any).material?.uniforms?.uTime) {
            (this.object as any).material.uniforms.uTime.value += delta;
        }
    }

    toJSON(): any {
        return {
            id: this.id,
            name: this.name,
            type: this.type,
            networkId: this.networkId,
            syncTransform: this.syncTransform,
            isStatic: this.isStatic,
            isActor: this.isActor,
            teamId: this.teamId,
            health: this.health,
            maxHealth: this.maxHealth,
            speed: this.speed,
            perceptionRadius: this.perceptionRadius,
            isVehicle: this.isVehicle,
            seats: this.seats.map(s => ({ ...s, offset: s.offset.toArray() })),
            isWeapon: this.isWeapon,
            weaponMode: this.weaponMode,
            metadata: this.metadata,
            modelUrl: this.modelUrl,
            damage: this.damage,
            projectileForce: this.projectileForce,
            fireRate: this.fireRate,
            isRemote: this.isRemote,
            targetPosition: this.targetPosition.toArray(),
            targetQuaternion: this.targetQuaternion.toArray(),
            isNodalMaterial: this.isNodalMaterial,
            materialNodes: this.materialNodes.map(n => n.toJSON()),
            inventory: this.inventory.toJSON(),
            avatarUrl: this.avatarUrl,
            transform: {
                position: this.object.position.toArray(),
                rotation: this.object.quaternion.toArray(),
                scale: this.object.scale.toArray()
            },
            physics: this.body ? {
                mass: this.body.mass,
                type: this.body.type
            } : null,
            logic: {
                sensors: this.sensors.map(s => s.toJSON()),
                controllers: this.controllers.map(c => c.toJSON()),
                actuators: this.actuators.map(a => a.toJSON())
            },
            children: this.children.map(c => c.toJSON())
        };
    }

    static fromJSON(data: any, threeObj: THREE.Object3D): B3Object {
        const obj = new B3Object(threeObj);
        obj.id = data.id;
        obj.name = data.name;
        obj.type = data.type;
        obj.networkId = data.networkId || obj.networkId;
        obj.syncTransform = data.syncTransform !== undefined ? data.syncTransform : true;
        obj.isStatic = data.isStatic || false;
        obj.isActor = data.isActor || false;
        obj.teamId = data.teamId || 0;
        obj.health = data.health ?? 100;
        obj.maxHealth = data.maxHealth ?? 100;
        obj.speed = data.speed ?? 0.1;
        obj.perceptionRadius = data.perceptionRadius ?? 10;
        obj.isVehicle = data.isVehicle || false;
        if (data.seats) obj.seats = data.seats.map((s: any) => ({ ...s, offset: new THREE.Vector3().fromArray(s.offset) }));
        obj.isWeapon = data.isWeapon || false;
        obj.weaponMode = data.weaponMode || 'physical';
        obj.metadata = data.metadata || {};
        obj.modelUrl = data.modelUrl || "";
        obj.damage = data.damage ?? 10;
        obj.projectileForce = data.projectileForce ?? 50;
        obj.fireRate = data.fireRate ?? 0.5;
        obj.isRemote = data.isRemote || false;
        if (data.targetPosition) obj.targetPosition.fromArray(data.targetPosition);
        if (data.targetQuaternion) obj.targetQuaternion.fromArray(data.targetQuaternion);
        obj.isNodalMaterial = data.isNodalMaterial || false;
        obj.object.position.fromArray(data.transform.position);
        obj.object.quaternion.fromArray(data.transform.rotation);
        obj.object.scale.fromArray(data.transform.scale);
        
        if (data.inventory) {
            obj.inventory = InventoryManager.fromJSON(data.inventory);
        }
        
        if (data.avatarUrl) {
            obj.setAvatar(data.avatarUrl);
        }

        // Restore Shader Nodes (via registry)
        if (data.materialNodes) {
            obj.materialNodes = data.materialNodes.map((nData: any) => {
                const factory = getShaderNodeFactory(nData.type);
                return factory ? factory(nData) : null;
            }).filter((n: any) => n !== null);
        }

        // Restore Logic Nodes (via registries)
        if (data.logic) {
            obj.sensors = (data.logic.sensors || []).map((n: any) => {
                const factory = getSensorFactory(n.type);
                return factory ? factory(n, obj) : null;
            }).filter((n: any) => n !== null);

            obj.controllers = (data.logic.controllers || []).map((n: any) => {
                const factory = getControllerFactory(n.type);
                return factory ? factory(n, obj) : null;
            }).filter((n: any) => n !== null);

            obj.actuators = (data.logic.actuators || []).map((n: any) => {
                const factory = getActuatorFactory(n.type);
                return factory ? factory(n, obj) : null;
            }).filter((n: any) => n !== null);
        }

        return obj;
    }
}
