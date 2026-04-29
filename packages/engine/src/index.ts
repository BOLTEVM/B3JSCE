import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { Pathfinding } from 'three-pathfinding';

import { AudioManager } from './audio';
import { B3AudioSource } from './audio_sources';
import { NetworkManager } from './network';
import { XRManager } from './xr';
import { Optimizer } from './optimization';
import { VehicleManager } from './vehicle';
import { CombatManager } from './combat';
import { InventoryManager, B3Item } from './inventory';
import { SpacetimeManager } from './spacetime';
import { ProjectManager } from './project';
import { RoboticsManager } from './robotics/RoboticsManager';
import { UnitreeManager } from './robotics/UnitreeManager';
import { DigitalTwinSystem } from './robotics/DigitalTwinSystem';
import { MiningManager } from './mining';
import { EconomyManager } from './economics';
import { B3Web3 } from '@b3js/web3';
import { processGlbPhysics } from './glbParser';

// ─── Core Module Re-exports ────────────────────────────────────
export { B3Object } from './core/B3Object';
export { HistoryManager, MoveObjectCommand, ScaleObjectCommand, SetPropertyCommand } from './core/history';
export type { Command } from './core/history';
export {
    registerSensorType, registerControllerType, registerActuatorType, registerShaderNodeType,
    getSensorFactory, getControllerFactory, getActuatorFactory, getShaderNodeFactory
} from './core/registry';

// ─── Logic Module Re-exports ───────────────────────────────────
// Importing the barrel triggers boot-time registration of all built-in types.
export * from './logic';

// ─── Existing Module Re-exports ────────────────────────────────
export * from './shaders';
export * from './audio';
export * from './audio_sources';
export * from './ecs';
export * from './serialization';
export * from './glbParser';
export { registerShaderChunk, getShaderChunk, getShaderChunkNames } from './shaders/ShaderLib';
export * from './ai_nodes';

// ─── Factories & Templates ─────────────────────────────────────
export {
    createCube, createSphere, createLight, createNPC,
    createWeaponUnit, createVehicleBase, createSpatialAudio,
    createAmmoPickup, createHealthPickup, createAdvancedActor, createUnitreeBot,
    createMarketTerminal, createShopKiosk, createWeb3Gateway, createArmoryRack,
    createTokenCoin, createPinPad
} from './factories';
export { createDefaultEnvironment, createBoltevmTemplate, createExchangeTemplate, createSpatialWalletTemplate } from './templates';

// ─── Internal Imports for B3Engine ─────────────────────────────
import { B3Object } from './core/B3Object';
import { HistoryManager, MoveObjectCommand, ScaleObjectCommand } from './core/history';
import { registerShaderNodeType } from './core/registry';
import { KeyboardSensor, CollisionSensor } from './logic/sensors';
import { AndController, PythonController } from './logic/controllers';
import { MotionActuator, InventoryActuator, MiningActuator, SpawnActuator } from './logic/actuators';
import { OrderbookActuator, ContractActuator, EventSensor, ShopActuator, ArmoryActuator } from './logic/economics_nodes';
import { HandGestureSensor, BalanceDisplayActuator } from './logic/spatial_nodes';
import { WalletActuator, PinPadActuator } from './logic/wallet_nodes';
import { Sensor, Controller, Actuator } from './logic/base';
import {
    ShaderNode, ShaderMaterialGenerator, OutputNode, UniformManager,
    ColorNode, PositionNode, TimeNode, MathNode, AudioNode
} from './shaders';
import { SightSensor, NavMoveActuator, BoneLookAtActuator, BoneTransformActuator } from './ai_nodes';
import { ECSWorld, HealthComponent, LogicComponent, registerSystem } from './ecs';
import { HealthSystem } from './ecs/systems/HealthSystem';
import { LogicSystem } from './ecs/systems/LogicSystem';
import * as Factories from './factories';
import * as Templates from './templates';

// ─── Shader Node Registration (boot-time) ──────────────────────
registerShaderNodeType('ColorNode', (d) => ColorNode.fromJSON(d));
registerShaderNodeType('PositionNode', (d) => PositionNode.fromJSON(d));
registerShaderNodeType('TimeNode', (d) => TimeNode.fromJSON(d));
registerShaderNodeType('MathNode', (d) => MathNode.fromJSON(d));
registerShaderNodeType('AudioNode', (d) => AudioNode.fromJSON(d));
registerShaderNodeType('OutputNode', (d) => OutputNode.fromJSON(d));

import { registerSensorType, registerActuatorType } from './core/registry';
registerSensorType('SightSensor', (d) => SightSensor.fromJSON(d));
registerActuatorType('NavMoveActuator', (d) => NavMoveActuator.fromJSON(d));
registerActuatorType('BoneLookAtActuator', (d) => BoneLookAtActuator.fromJSON(d));
registerActuatorType('BoneTransformActuator', (d) => BoneTransformActuator.fromJSON(d));
registerActuatorType('SpawnActuator', (d) => SpawnActuator.fromJSON(d));
registerActuatorType('OrderbookActuator', (d) => OrderbookActuator.fromJSON(d));
registerActuatorType('ContractActuator', (d) => ContractActuator.fromJSON(d));
registerActuatorType('ShopActuator', (d) => ShopActuator.fromJSON(d));
registerActuatorType('ArmoryActuator', (d) => ArmoryActuator.fromJSON(d));
registerActuatorType('BalanceDisplayActuator', (d) => BalanceDisplayActuator.fromJSON(d));
registerActuatorType('WalletActuator', (d) => WalletActuator.fromJSON(d));
registerActuatorType('PinPadActuator', (d) => PinPadActuator.fromJSON(d));
registerSensorType('EventSensor', (d) => EventSensor.fromJSON(d));
registerSensorType('HandGestureSensor', (d) => HandGestureSensor.fromJSON(d));

/**
 * Main Engine Orchestrator
 */
export class B3Engine {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    css2dRenderer: CSS2DRenderer;
    world: CANNON.World;
    ecs: ECSWorld = new ECSWorld();
    objects: B3Object[] = [];
    timer: THREE.Timer = new THREE.Timer();
    isPaused: boolean = false;
    history: HistoryManager = new HistoryManager();
    audio: AudioManager = new AudioManager();
    network: NetworkManager = new NetworkManager(this);
    mining: MiningManager = new MiningManager(this);
    xr: XRManager;
    optimizer: Optimizer;
    vehicles: VehicleManager;
    combat: CombatManager;
    public spacetime: SpacetimeManager;
    public robotics!: RoboticsManager;
    public digitalTwin!: DigitalTwinSystem;
    public economics: EconomyManager;
    public web3: typeof B3Web3 = B3Web3;
    projects: ProjectManager = new ProjectManager();
    activeProjectId: string | null = null;
    pathfinder: Pathfinding = new Pathfinding();
    pathfinderWorker: Worker | null = null;
    private _pathCallbacks: Map<number, (path: any) => void> = new Map();
    private _pathIdSeq: number = 0;
    navMeshId: string = 'main_nav';
    xrRig: THREE.Group = new THREE.Group();
    
    // Multi-Scene State
    sceneRegistry: Map<string, any> = new Map();
    activeSceneName: string = "MainScene";
    private _prePlayState: string | null = null;

    // Optimization State
    optimizationMode: 'auto' | 'manual' = 'auto';
    zoningRadius: number = 300;
    
    private audioSubsetBuffer = new Float32Array(128);
    private loadingManager = new THREE.LoadingManager();

    selectedObject: B3Object | null = null;
    private gizmo: TransformControls;
    private grid: THREE.GridHelper;
    private raycaster = new THREE.Raycaster();
    private mouse = new THREE.Vector2();
    private onSelectionChange: (obj: B3Object | null) => void = () => { };
    keysDown: Set<string> = new Set();

    // ─── Cut-Scene & Recording State ───────────────────────────
    isRecording: boolean = false;
    recordedKeyframes: { pos: number[], rot: number[], fov: number, time: number }[] = [];
    recordingStartTime: number = 0;
    isPlayingCutscene: boolean = false;
    playbackStartTime: number = 0;
    playbackKeyframes: any[] = [];
    private onCutsceneFinished: (() => void) | null = null;
    private isPointerLocked: boolean = false;

    constructor(private container: HTMLElement) {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
        this.camera.rotation.order = 'YXZ';
        this.camera.add(this.audio.getListener());

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.xr.enabled = true;
        container.appendChild(this.renderer.domElement);

        // CSS2D Overlay Renderer (for 3D HTML panels)
        this.css2dRenderer = new CSS2DRenderer();
        this.css2dRenderer.setSize(container.clientWidth, container.clientHeight);
        this.css2dRenderer.domElement.style.position = 'absolute';
        this.css2dRenderer.domElement.style.top = '0';
        this.css2dRenderer.domElement.style.pointerEvents = 'none';
        container.appendChild(this.css2dRenderer.domElement);

        // ECS Initialization
        registerSystem(HealthSystem);
        registerSystem(LogicSystem);
        (this.ecs as any)._engineRef = this;

        // Setup XR Rig for independent locomotion
        this.scene.add(this.xrRig);
        this.xrRig.add(this.camera);
        this.xr = new XRManager(this);
        this.optimizer = new Optimizer(this);
        this.vehicles = new VehicleManager(this);
        this.combat = new CombatManager(this);
        this.spacetime = new SpacetimeManager(this);
        this.robotics = new UnitreeManager(this);
        this.digitalTwin = new DigitalTwinSystem(this);
        this.economics = new EconomyManager(this);
        this.mining.init();

        this.world = new CANNON.World();
        this.world.gravity.set(0, -9.82, 0);

        // Grid Helper
        this.grid = new THREE.GridHelper(100, 100, 0x444444, 0x222222);
        this.scene.add(this.grid);

        // Transform Gizmo
        this.gizmo = new TransformControls(this.camera, this.renderer.domElement);
        this.gizmo.addEventListener('change', () => {
            if (this.selectedObject) {
                if (this.selectedObject.body) {
                    this.selectedObject.body.position.copy(this.selectedObject.object.position as any);
                    this.selectedObject.body.quaternion.copy(this.selectedObject.object.quaternion as any);
                    this.selectedObject.body.velocity.set(0, 0, 0);
                    this.selectedObject.body.angularVelocity.set(0, 0, 0);
                }
                
                if (this.gizmo.getMode() === 'scale') {
                    (this.selectedObject as any)._physicsDirty = true;
                }
            }
        });

        let startPos = new THREE.Vector3();
        let startRot = new THREE.Quaternion();
        let startScale = new THREE.Vector3();

        this.gizmo.addEventListener('dragging-changed', (event) => {
            if (this.selectedObject) {
                if (event.value) {
                    startPos.copy(this.selectedObject.object.position);
                    startRot.copy(this.selectedObject.object.quaternion);
                    startScale.copy(this.selectedObject.object.scale);
                } else {
                    const endPos = this.selectedObject.object.position.clone();
                    const endRot = this.selectedObject.object.quaternion.clone();
                    const endScale = this.selectedObject.object.scale.clone();
                    
                    if (!startPos.equals(endPos) || !startRot.equals(endRot)) {
                        this.history.execute(new MoveObjectCommand(
                            this.selectedObject,
                            startPos.clone(),
                            startRot.clone(),
                            endPos,
                            endRot
                        ));
                    }

                    if (!startScale.equals(endScale)) {
                        this.history.execute(new ScaleObjectCommand(
                            this.selectedObject,
                            startScale.clone(),
                            endScale
                        ));
                    }
                }

                if (this.selectedObject && !this.selectedObject.isRemote) {
                    this.spacetime.pushUpdate(this.selectedObject);
                }

                if (this.selectedObject.body) {
                    this.selectedObject.body.type = event.value ? CANNON.Body.KINEMATIC : CANNON.Body.DYNAMIC;
                    if (!event.value) {
                        this.selectedObject.body.velocity.set(0, 0, 0);
                        this.selectedObject.body.angularVelocity.set(0, 0, 0);
                    }
                }
            }
        });

        this.scene.add(this.gizmo.getHelper());

        window.addEventListener('resize', () => this.onResize());
        window.addEventListener('keydown', (e) => this.keysDown.add(e.code));
        window.addEventListener('keyup', (e) => this.keysDown.delete(e.code));
        container.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });

        let isDraggingCam = false;
        let dragThreshold = 5;
        let startX = 0;
        let startY = 0;
        let lastX = 0;
        let lastY = 0;

        container.addEventListener('mousedown', (e) => {
            const isShift = this.keysDown.has('ShiftLeft') || this.keysDown.has('ShiftRight');
            
            // If Shift is held, prioritize cinematic camera rotation over gizmo/selection
            if (isShift && e.button === 0) {
                this.renderer.domElement.requestPointerLock();
                isDraggingCam = true;
                startX = e.clientX;
                startY = e.clientY;
                lastX = e.clientX;
                lastY = e.clientY;
                return; // Early return to avoid gizmo raycast
            }

            // Check if we hit the gizmo first
            const rect = this.container.getBoundingClientRect();
            this.mouse.x = ((e.clientX - rect.left) / this.container.clientWidth) * 2 - 1;
            this.mouse.y = -((e.clientY - rect.top) / this.container.clientHeight) * 2 + 1;
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const gizmoIntersects = this.raycaster.intersectObjects(this.gizmo.getHelper().children, true);
            
            if (gizmoIntersects.length > 0) {
                isDraggingCam = false;
                return;
            }

            startX = e.clientX;
            startY = e.clientY;
            lastX = e.clientX;
            lastY = e.clientY;
            isDraggingCam = true;
        }, true);

        container.addEventListener('dblclick', (e) => {
            this.handleDoubleClick(e);
        });

        window.addEventListener('mouseup', (e) => {
            const diffX = Math.abs(e.clientX - startX);
            const diffY = Math.abs(e.clientY - startY);
            
            if (isDraggingCam && diffX < dragThreshold && diffY < dragThreshold) {
                // If it was a static click (not a drag), handle object selection
                this.handleClick(e);
            }
            isDraggingCam = false;
        });

        window.addEventListener('mousemove', (e) => {
            const sensitivity = 0.002;
            const deltaX = e.movementX !== undefined ? e.movementX : (e.clientX - lastX);
            const deltaY = e.movementY !== undefined ? e.movementY : (e.clientY - lastY);
            lastX = e.clientX;
            lastY = e.clientY;

            if (document.pointerLockElement || isDraggingCam) {
                // If Shift is down, rotate. If not, only rotate if we were dragging (legacy behavior)
                const isShift = this.keysDown.has('ShiftLeft') || this.keysDown.has('ShiftRight');
                
                if (isShift || isDraggingCam) {
                    this.camera.rotation.order = 'YXZ';
                    this.camera.rotation.y -= deltaX * sensitivity;
                    this.camera.rotation.x -= deltaY * sensitivity;
                    
                    // Clamp vertical rotation to avoid flipping (approx 85 degrees)
                    this.camera.rotation.x = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, this.camera.rotation.x));
                    
                    // Force zero roll to prevent diagonal tilting
                    this.camera.rotation.z = 0;
                }
            }
        });

        document.addEventListener('pointerlockchange', () => {
            this.isPointerLocked = !!document.pointerLockElement;
        });

        // Initialize Inline Blob Worker
        const workerCode = `
import { Pathfinding } from 'https://esm.sh/three-pathfinding@1.3.0';

const pathfinder = new Pathfinding();

self.onmessage = function(e) {
    const data = e.data;
    if (data.type === 'setZoneData') {
        pathfinder.setZoneData(data.zoneId, data.zone);
    } else if (data.type === 'findPath') {
        const group = pathfinder.getGroup(data.zoneId, data.start);
        if (group !== null) {
            const path = pathfinder.findPath(data.start, data.target, data.zoneId, group);
            self.postMessage({ id: data.id, path: path });
        } else {
            self.postMessage({ id: data.id, path: null });
        }
    }
};
`;
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        this.pathfinderWorker = new Worker(URL.createObjectURL(blob), { type: 'module' });
        this.pathfinderWorker.onmessage = (e) => {
            const cb = this._pathCallbacks.get(e.data.id);
            if (cb) {
                cb(e.data.path ? e.data.path.map((p: any) => new THREE.Vector3(p.x, p.y, p.z)) : null);
                this._pathCallbacks.delete(e.data.id);
            }
        };
    }

    setGizmoMode(mode: 'translate' | 'rotate' | 'scale') {
        this.gizmo.setMode(mode);
    }

    setOnSelectionChange(cb: (obj: B3Object | null) => void) {
        this.onSelectionChange = cb;
    }

    addObject(b3obj: B3Object) {
        b3obj.setEngineRef(this);
        this.objects.push(b3obj);
        if (!b3obj.parent) {
            this.scene.add(b3obj.object);
        }
        if (b3obj.body) this.world.addBody(b3obj.body);

        if (!b3obj.isRemote) {
            this.spacetime.pushSpawn(b3obj);
        }
    }

    removeObject(id: string) {
        const b3obj = this.objects.find(o => o.id === id);
        if (!b3obj) return;

        console.log(`B3JS Engine: Removing Object -> ${b3obj.name} (${b3obj.type}, ID: ${id})`);
        [...b3obj.children].forEach(child => this.removeObject(child.id));

        if (b3obj.parent) {
            b3obj.parent.removeChild(b3obj);
        } else {
            this.scene.remove(b3obj.object);
        }

        if (b3obj.body) {
            this.world.removeBody(b3obj.body);
        }

        [...b3obj.sensors, ...b3obj.controllers, ...b3obj.actuators].forEach(node => {
            if (node.dispose) node.dispose();
        });

        this.objects = this.objects.filter(o => o.id !== id);
        if (this.selectedObject === b3obj) this.selectObject(null);

        if (!b3obj.isRemote) {
            this.spacetime.pushDelete(id);
        }
    }

    toggleSimulation() {
        if (this.isPaused) {
            this._prePlayState = this.serialize();
            this.isPaused = false;
        } else {
            this.isPaused = true;
            if (this._prePlayState) {
                this.objects.forEach(obj => {
                    if (obj.body) {
                        obj.body.velocity.set(0, 0, 0);
                        obj.body.angularVelocity.set(0, 0, 0);
                    }
                });
                this.deserialize(this._prePlayState);
                this._prePlayState = null;
            }
        }
        console.log(`B3JS Engine: Simulation ${this.isPaused ? 'PAUSED' : 'RESUMED'}`);
    }

    resetScene() {
        [...this.objects].forEach(o => this.removeObject(o.id));
        this.scene.background = new THREE.Color(0x050505);
        console.log("B3JS Engine: Scene Reset");
    }

    // ─── Delegated Factory Methods ─────────────────────────────
    createDefaultEnvironment() { Templates.createDefaultEnvironment(this); }
    async createBoltevmTemplate(name = 'Boltevm World') { await Templates.createBoltevmTemplate(this, name); }
    createCube(name = "Cube") { return Factories.createCube(this, name); }
    createSphere(name = "Sphere") { return Factories.createSphere(this, name); }
    createLight(name = "PointLight") { return Factories.createLight(this, name); }
    createNPC(name = "Basic NPC") { return Factories.createNPC(this, name); }
    createWeaponUnit(name = "Combat Turret") { return Factories.createWeaponUnit(this, name); }
    createVehicleBase(name = "Vehicle Chassis") { return Factories.createVehicleBase(this, name); }
    createSpatialAudio(url: string, name = "AudioSource") { return Factories.createSpatialAudio(this, url, name); }
    createAmmoPickup(name = "Ammo Case") { return Factories.createAmmoPickup(this, name); }
    createHealthPickup(name = "Medkit") { return Factories.createHealthPickup(this, name); }
    createAdvancedActor(name = "Tactical Hero") { return Factories.createAdvancedActor(this, name); }
    createUnitreeBot(name = "Unitree B1") { return Factories.createUnitreeBot(this, name); }
    createSpawnPoint(name = "Spawn Point") { return Factories.createSpawnPoint(this, name); }

    spawnActor(actorType: string, teamId: number = 0) {
        const spawnPoints = this.objects.filter(o => o.type === 'SpawnPoint' && (o.metadata.teamId === teamId || o.metadata.teamId === 0));
        
        let spawnPos = new THREE.Vector3(0, 5, 0);
        if (spawnPoints.length > 0) {
            const sp = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
            spawnPos.copy(sp.object.position);
            spawnPos.y += 1;
        }

        let newObj: B3Object | null = null;
        if (actorType === 'Basic NPC') newObj = this.createNPC();
        else if (actorType === 'Tactical Hero') newObj = this.createAdvancedActor();
        else newObj = this.createCube();

        if (newObj) {
            newObj.object.position.copy(spawnPos);
            if (newObj.body) {
                newObj.body.position.copy(spawnPos as any);
                newObj.body.velocity.set(0, 0, 0);
            }
            newObj.teamId = teamId;
        }
        return newObj;
    }

    // ─── Scene Management ──────────────────────────────────────
    createNewScene(name: string) {
        if (this.sceneRegistry.has(name)) return;
        this.sceneRegistry.set(this.activeSceneName, JSON.parse(this.serialize()));
        this.activeSceneName = name;
        this.createDefaultEnvironment();
        this.saveToLocalStorage();
    }

    switchScene(name: string) {
        if (!this.sceneRegistry.has(name) && name !== this.activeSceneName) return;
        this.sceneRegistry.set(this.activeSceneName, JSON.parse(this.serialize()));
        const data = this.sceneRegistry.get(name);
        this.activeSceneName = name;
        if (data) this.deserialize(JSON.stringify(data));
        this.saveToLocalStorage();
    }

    deleteScene(name: string) {
        if (this.sceneRegistry.size <= 1) return;
        this.sceneRegistry.delete(name);
        if (this.activeSceneName === name) {
            const first = this.sceneRegistry.keys().next().value;
            this.switchScene(first!);
        }
        this.saveToLocalStorage();
    }

    saveToLocalStorage() {
        const data = {
            active: this.activeSceneName,
            registry: Object.fromEntries(this.sceneRegistry)
        };
        localStorage.setItem('B3JS_PROJECT_DATA', JSON.stringify(data));
        console.log("B3JS Engine: Project Saved to LocalStorage");
    }

    loadFromLocalStorage() {
        const offlineCache = localStorage.getItem('B3JS_OFFLINE_CACHE');
        const raw = offlineCache || localStorage.getItem('B3JS_PROJECT_DATA');
        
        if (!raw) {
            this.createBoltevmTemplate().then(() => {
                this.sceneRegistry.set("MainScene", JSON.parse(this.serialize()));
                console.log("B3JS Engine: Boltevm World Template loaded as default MainScene.");
            });
            return;
        }

        try {
            const data = JSON.parse(raw);
            this.sceneRegistry = new Map(Object.entries(data.registry));
            this.switchScene(data.active);
            console.log("B3JS Engine: Project Restored from LocalStorage");
        } catch (e) {
            console.error("B3JS Engine: Failed to restore project", e);
        }
    }

    // ─── NPC & Pathfinding ─────────────────────────────────────
    bakeNavMesh() {
        console.log("B3JS Engine: Baking NavMesh...");
        const staticMeshes: THREE.Mesh[] = [];
        this.objects.forEach(obj => {
            if (obj.isStatic && obj.object instanceof THREE.Mesh) {
                staticMeshes.push(obj.object);
            }
        });

        if (staticMeshes.length === 0) {
            console.warn("B3JS Engine: No static geometry found for NavMesh bake.");
            return;
        }

        const zone = Pathfinding.createZone(staticMeshes[0].geometry);
        this.pathfinder.setZoneData(this.navMeshId, zone);
        if (this.pathfinderWorker) {
            this.pathfinderWorker.postMessage({ type: 'setZoneData', zoneId: this.navMeshId, zone });
        }
        console.log("B3JS Engine: NavMesh Bake Successful.");
    }

    async requestPath(start: THREE.Vector3, target: THREE.Vector3): Promise<THREE.Vector3[] | null> {
        if (!this.pathfinderWorker) return null;
        
        return new Promise((resolve) => {
            const id = this._pathIdSeq++;
            this._pathCallbacks.set(id, (path) => resolve(path));
            this.pathfinderWorker!.postMessage({
                type: 'findPath',
                id,
                zoneId: this.navMeshId,
                start,
                target
            });
        });
    }

    applyBlueprint(objectId: string, blueprintId: string) {
        const obj = this.objects.find(o => o.id === objectId);
        if (!obj) return;

        if (blueprintId === 'WASD_MOVEMENT') {
            const keys = ['KeyW', 'KeyS', 'KeyA', 'KeyD'];
            const dirs = [
                new THREE.Vector3(0, 0, -0.1),
                new THREE.Vector3(0, 0, 0.1),
                new THREE.Vector3(-0.1, 0, 0),
                new THREE.Vector3(0.1, 0, 0)
            ];

            keys.forEach((k, i) => {
                const s = new KeyboardSensor(k);
                s.guiMetadata = { x: 50, y: 50 + i * 120 };
                const c = new AndController();
                c.guiMetadata = { x: 300, y: 50 + i * 120 };
                const a = new MotionActuator(obj.object, dirs[i]);
                a.guiMetadata = { x: 550, y: 50 + i * 120 };
                
                c.addSensor(s);
                c.addActuator(a);
                obj.addSensor(s);
                obj.addController(c);
                obj.addActuator(a);
            });
        }
    }

    duplicateObject(id: string) {
        const source = this.objects.find(o => o.id === id);
        if (!source) return null;

        const clonedMesh = source.object.clone();
        const b3obj = new B3Object(clonedMesh);
        b3obj.name = `${source.name} (Copy)`;
        b3obj.type = source.type;

        if (source.body) {
            const body = new CANNON.Body({
                mass: source.body.mass,
                shape: source.body.shapes[0],
                position: source.body.position.clone() as any,
                quaternion: source.body.quaternion.clone() as any
            });
            body.position.x += 1;
            b3obj.body = body;
        }

        this.addObject(b3obj);
        this.selectObject(b3obj.id);
        return b3obj;
    }

    selectObject(id: string | null) {
        if (!id) {
            this.selectedObject = null;
            this.gizmo.detach();
        } else {
            this.selectedObject = this.objects.find(o => o.id === id) || null;
            if (this.selectedObject) {
                this.gizmo.attach(this.selectedObject.object);
            } else {
                this.gizmo.detach();
            }
        }
        if (this.onSelectionChange) this.onSelectionChange(this.selectedObject);
    }

    private handleClick(e: MouseEvent) {
        const rect = this.container.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / this.container.clientWidth) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / this.container.clientHeight) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);

        const gizmoIntersects = this.raycaster.intersectObjects(this.gizmo.getHelper().children, true);
        if (gizmoIntersects.length > 0) return;

        const intersects = this.raycaster.intersectObjects(this.scene.children, true);

        if (intersects.length > 0) {
            let obj3d = intersects[0].object;
            while (obj3d && !obj3d.userData.b3obj) obj3d = obj3d.parent!;

            if (obj3d && obj3d.userData.b3obj) {
                const b3obj = obj3d.userData.b3obj;
                if (b3obj.locked) {
                    // Search for deeper objects if the first hit is locked
                    for (let i = 1; i < intersects.length; i++) {
                        let subObj = intersects[i].object;
                        while (subObj && !subObj.userData.b3obj) subObj = subObj.parent!;
                        if (subObj && subObj.userData.b3obj && !subObj.userData.b3obj.locked) {
                            this.selectObject(subObj.userData.b3obj.id);
                            return;
                        }
                    }
                    this.selectObject(null);
                    return;
                }
                this.selectObject(b3obj.id);
            } else {
                this.selectObject(null);
            }
        } else {
            this.selectObject(null);
        }
    }

    private handleDoubleClick(e: MouseEvent) {
        this.handleClick(e);
        if (this.selectedObject) {
            console.log("Double Clicked:", this.selectedObject.name);
            // Optional: Smoothly move camera towards object?
            // For now, just ensure onSelectionChange is fired with a special flag if needed.
        }
    }

    private handleWheel(e: WheelEvent) {
        e.preventDefault();
        const zoomSpeed = 0.05;
        this.camera.fov += e.deltaY * zoomSpeed;
        this.camera.fov = Math.max(10, Math.min(120, this.camera.fov));
        this.camera.updateProjectionMatrix();
    }

    private onResize() {
        this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.css2dRenderer.setSize(this.container.clientWidth, this.container.clientHeight);
    }

    // ─── Recording & Playback API ──────────────────────────────
    startRecording() {
        this.isRecording = true;
        this.recordedKeyframes = [];
        this.recordingStartTime = performance.now();
        console.log("B3JS Engine: Recording Started");
    }

    stopRecording() {
        this.isRecording = false;
        console.log(`B3JS Engine: Recording Stopped. Captured ${this.recordedKeyframes.length} frames.`);
        return [...this.recordedKeyframes];
    }

    playCutscene(keyframes: any[], onFinished?: () => void) {
        if (keyframes.length === 0) return;
        this.playbackKeyframes = keyframes;
        this.playbackStartTime = performance.now();
        this.isPlayingCutscene = true;
        this.onCutsceneFinished = onFinished || null;
        console.log("B3JS Engine: Cutscene Playback Started");
    }

    stopCutscene() {
        this.isPlayingCutscene = false;
        if (this.onCutsceneFinished) this.onCutsceneFinished();
        this.onCutsceneFinished = null;
    }

    private applyCutsceneFrame(elapsed: number) {
        const frames = this.playbackKeyframes;
        if (elapsed > frames[frames.length - 1].time) {
            this.stopCutscene();
            return;
        }

        // Find surrounding frames
        let i = 0;
        while (i < frames.length - 2 && frames[i + 1].time < elapsed) i++;

        const f1 = frames[i];
        const f2 = frames[i + 1];
        const t = (elapsed - f1.time) / (f2.time - f1.time);

        // Interpolate position
        this.camera.position.set(
            f1.pos[0] + (f2.pos[0] - f1.pos[0]) * t,
            f1.pos[1] + (f2.pos[1] - f1.pos[1]) * t,
            f1.pos[2] + (f2.pos[2] - f1.pos[2]) * t
        );

        // Interpolate rotation (Euler)
        this.camera.rotation.set(
            f1.rot[0] + (f2.rot[0] - f1.rot[0]) * t,
            f1.rot[1] + (f2.rot[1] - f1.rot[1]) * t,
            f1.rot[2] + (f2.rot[2] - f1.rot[2]) * t,
            'YXZ'
        );

        // Interpolate FOV
        this.camera.fov = f1.fov + (f2.fov - f1.fov) * t;
        this.camera.updateProjectionMatrix();
    }

    start() {
        this.renderer.setAnimationLoop(() => this.animate());
    }

    private animate() {
        this.timer.update();
        const delta = Math.min(this.timer.getDelta(), 0.1);

        if (this.isPlayingCutscene) {
            const elapsed = (performance.now() - this.playbackStartTime) / 1000;
            this.applyCutsceneFrame(elapsed);
        } else if (this.isRecording) {
            const elapsed = (performance.now() - this.recordingStartTime) / 1000;
            this.recordedKeyframes.push({
                pos: this.camera.position.toArray(),
                rot: this.camera.rotation.toArray() as number[],
                fov: this.camera.fov,
                time: elapsed
            });
        }

        // Editor Camera Navigation (Shift + WASD)
        if (this.keysDown.has('ShiftLeft') || this.keysDown.has('ShiftRight')) {
            const speed = 20 * delta;
            const dir = new THREE.Vector3();
            if (this.keysDown.has('KeyW')) dir.z -= 1;
            if (this.keysDown.has('KeyS')) dir.z += 1;
            if (this.keysDown.has('KeyA')) dir.x -= 1;
            if (this.keysDown.has('KeyD')) dir.x += 1;
            
            if (dir.lengthSq() > 0) {
                dir.normalize();
                dir.applyQuaternion(this.camera.quaternion);
                this.camera.position.addScaledVector(dir, speed);
            }
        }

        if (!this.isPaused) {
            this.ecs.tick(delta);
            this.world.step(1 / 60, delta);
            this.objects.forEach(obj => obj.update(delta, this));
            this.xr.update(delta);
            this.optimizer.update();

            // Audio Spectrum Update
            if (this.audio.isReady()) {
                const freq = this.audio.getFrequencyData();
                for (let i = 0; i < 128; i++) this.audioSubsetBuffer[i] = freq[i];

                const subset = this.audioSubsetBuffer;
                this.objects.forEach(obj => {
                    if (obj.isNodalMaterial && (obj.object as any).material?.uniforms?.uAudioData) {
                        (obj.object as any).material.uniforms.uAudioData.value = subset;
                    }
                });
            }

            // Deferred physics recalculation
            this.objects.forEach(obj => {
                if (obj._physicsDirty) {
                    if (obj.body) this.world.removeBody(obj.body);
                    obj.recalculatePhysicsBody();
                    if (obj.body) this.world.addBody(obj.body);
                    obj._physicsDirty = false;
                }
            });
        }

        this.renderer.render(this.scene, this.camera);
        this.css2dRenderer.render(this.scene, this.camera);
    }

    serialize(): string {
        const rootObjects = this.objects.filter(o => !o.parent);
        return JSON.stringify({
            version: "1.0.0",
            objects: rootObjects.map(o => o.toJSON())
        }, null, 2);
    }

    deserialize(jsonString: string) {
        try {
            const data = JSON.parse(jsonString);
            this.resetScene();

            const spawnObject = (objData: any, parentB3: B3Object | null = null) => {
                let mesh: THREE.Object3D;
                if (objData.type === "Primitive") {
                    if (objData.name.includes("Cube")) {
                        mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x444444 }));
                    } else if (objData.name.includes("Sphere")) {
                        mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 32), new THREE.MeshStandardMaterial({ color: 0x444444 }));
                    } else {
                        mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x444444 }));
                    }
                    mesh.castShadow = true;
                } else if (objData.type === "Light") {
                    mesh = new THREE.PointLight(0xffffff, 10, 50);
                } else if (objData.type === "Environment") {
                    const geo = new THREE.PlaneGeometry(80, 80);
                    const mat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.85 });
                    mesh = new THREE.Mesh(geo, mat);
                    (mesh as THREE.Mesh).receiveShadow = true;
                } else if (objData.type === "Interactive") {
                    const geo = new THREE.CylinderGeometry(0.6, 0.6, 1.8, 16);
                    const mat = new THREE.MeshStandardMaterial({ color: 0x6366f1, metalness: 0.6, roughness: 0.3 });
                    mesh = new THREE.Mesh(geo, mat);
                    (mesh as THREE.Mesh).castShadow = true;
                } else if (objData.type === "Skybox") {
                    mesh = new THREE.Group();
                } else if (objData.type === "SpawnPoint") {
                    mesh = new THREE.Mesh(
                        new THREE.CylinderGeometry(0.5, 0.5, 0.1, 16),
                        new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true, transparent: true, opacity: 0.5 })
                    );
                } else {
                    mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
                }

                const restored = B3Object.fromJSON(objData, mesh);

                if (objData.physics) {
                    restored.body = new CANNON.Body({ mass: objData.physics.mass });
                    restored.body.type = objData.physics.type;
                    restored.recalculatePhysicsBody();
                    
                    if (restored.body && objData.transform) {
                        restored.body.position.set(objData.transform.position[0], objData.transform.position[1], objData.transform.position[2]);
                        restored.body.quaternion.set(objData.transform.rotation[0], objData.transform.rotation[1], objData.transform.rotation[2], objData.transform.rotation[3]);
                    }
                }

                this.addObject(restored);

                if (parentB3) {
                    this.scene.remove(restored.object);
                    parentB3.addChild(restored);
                }

                // Async GLB reload for objects with a stored modelUrl
                if (objData.modelUrl) {
                    const loader = new GLTFLoader();
                    loader.loadAsync(objData.modelUrl).then((gltf) => {
                        const model = gltf.scene;
                        // Copy transform from the placeholder onto the loaded model's parent
                        model.position.copy(restored.object.position);
                        model.quaternion.copy(restored.object.quaternion);
                        model.scale.copy(restored.object.scale);
                        // Swap the placeholder with the real model
                        if (restored.parent) {
                            restored.parent.object.remove(restored.object);
                            restored.parent.object.add(model);
                        } else {
                            this.scene.remove(restored.object);
                            this.scene.add(model);
                        }
                        restored.object = model;
                        model.userData.b3obj = restored;
                        restored.extractMetadata();
                        console.log(`B3JS Engine: Reloaded GLB and extracted metadata -> ${objData.modelUrl}`);
                    }).catch((err) => {
                        console.warn(`B3JS Engine: Failed to reload ${objData.modelUrl}`, err);
                    });
                }

                objData.children?.forEach((childData: any) => spawnObject(childData, restored));
            };

            data.objects.forEach((objData: any) => spawnObject(objData));
            console.log("B3JS Engine: Deserialization Successful");
        } catch (e) {
            console.error("B3JS Engine: Deserialization Failed", e);
        }
    }

    async handleFilesDrop(files: FileList) {
        const fileMap = new Map<string, File>();
        for (let i = 0; i < files.length; i++) {
            fileMap.set(files[i].name, files[i]);
        }

        const manager = new THREE.LoadingManager();
        manager.setURLModifier((url) => {
            const fileName = url.split('/').pop() || '';
            const file = fileMap.get(fileName);
            if (file) return URL.createObjectURL(file);
            return url;
        });

        const entries = Array.from(files).filter(f => 
            f.name.toLowerCase().endsWith('.glb') || 
            f.name.toLowerCase().endsWith('.gltf') || 
            f.name.toLowerCase().endsWith('.obj')
        );

        for (const file of entries) {
            const url = URL.createObjectURL(file);
            if (file.name.toLowerCase().endsWith('.obj')) {
                const mtlName = file.name.toLowerCase().replace('.obj', '.mtl');
                const mtlFile = Array.from(files).find(f => f.name.toLowerCase() === mtlName);
                
                const loadObj = (materials?: any) => {
                    const loader = new OBJLoader(manager);
                    if (materials) {
                        materials.preload();
                        loader.setMaterials(materials);
                    }
                    loader.load(url, (group) => {
                        const obj = new B3Object(group);
                        obj.name = file.name;
                        this.addObject(obj);
                    });
                };

                if (mtlFile) {
                    const mtlLoader = new MTLLoader(manager);
                    mtlLoader.load(URL.createObjectURL(mtlFile), (materials) => loadObj(materials));
                } else {
                    loadObj();
                }
            } else {
                const loader = new GLTFLoader(manager);
                loader.load(url, (gltf) => {
                    processGlbPhysics(gltf, this.world);
                    const obj = new B3Object(gltf.scene);
                    obj.name = file.name;
                    this.addObject(obj);
                });
            }
        }
    }

    // ─── Static References for backward compatibility ──────────
    static B3Object = B3Object;
    static Sensor = Sensor;
    static Controller = Controller;
    static Actuator = Actuator;
    static KeyboardSensor = KeyboardSensor;
    static CollisionSensor = CollisionSensor;
    static AndController = AndController;
    static PythonController = PythonController;
    static MotionActuator = MotionActuator;
    static InventoryActuator = InventoryActuator;
    static MiningActuator = MiningActuator;
    static SightSensor = SightSensor;
    static NavMoveActuator = NavMoveActuator;
    static BoneLookAtActuator = BoneLookAtActuator;
    static BoneTransformActuator = BoneTransformActuator;

    static ColorNode = ColorNode;
    static PositionNode = PositionNode;
    static TimeNode = TimeNode;
    static MathNode = MathNode;
    static AudioNode = AudioNode;

    static InventorySensor = class extends Sensor {
        constructor(public itemName: string, public threshold: number = 1) { super(); }
        getTypeName() { return 'InventorySensor'; }
        update(delta: number, obj: B3Object) {
            const item = obj.inventory.items.find(i => i.name === this.itemName);
            this.positive = item ? item.quantity >= this.threshold : false;
        }
    };

    static EquipActuator = class extends Actuator {
        constructor(public itemId: string) { super(); }
        getTypeName() { return 'EquipActuator'; }
        execute(delta: number, obj: B3Object) {
            const item = obj.inventory.items.find(i => i.id === this.itemId);
            if (item) obj.equipItem(item);
        }
        update() {}
    };
}
