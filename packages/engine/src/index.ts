import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { nanoid } from 'nanoid';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { 
    ShaderNode, ShaderMaterialGenerator, OutputNode, UniformManager,
    ColorNode, PositionNode, TimeNode, MathNode, AudioNode 
} from './shaders';
import { AudioManager } from './audio';
import { B3AudioSource } from './audio_sources';
import { NetworkManager } from './network';
import { XRManager } from './xr';
import { Optimizer } from './optimization';
import { VehicleManager } from './vehicle';
import { CombatManager } from './combat';
import { InventoryManager, B3Item } from './inventory';
import { Pathfinding } from 'three-pathfinding';

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';

export * from './shaders';
export * from './audio';
export * from './audio_sources';

// ECS Framework
export * from './ecs';
import { createEntity, EntityId, ECSWorld, HealthComponent, LogicComponent, registerSystem } from './ecs';
import { HealthSystem } from './ecs/systems/HealthSystem';
import { LogicSystem } from './ecs/systems/LogicSystem';

// Serialization Framework
export * from './serialization';

// Shader Chunk Library
export { registerShaderChunk, getShaderChunk, getShaderChunkNames } from './shaders/ShaderLib';

// Undo/Redo Command Pattern
export interface Command {
    execute(): void;
    undo(): void;
}

export class HistoryManager {
    private undoStack: Command[] = [];
    private redoStack: Command[] = [];

    execute(command: Command) {
        command.execute();
        this.undoStack.push(command);
        this.redoStack = []; // Clear redo stack on new command
    }

    undo() {
        const cmd = this.undoStack.pop();
        if (cmd) {
            cmd.undo();
            this.redoStack.push(cmd);
        }
    }

    redo() {
        const cmd = this.redoStack.pop();
        if (cmd) {
            cmd.execute();
            this.undoStack.push(cmd);
        }
    }
}

export class MoveObjectCommand implements Command {
    constructor(
        private obj: B3Object,
        private oldPos: THREE.Vector3,
        private oldRot: THREE.Quaternion,
        private newPos: THREE.Vector3,
        private newRot: THREE.Quaternion
    ) {}

    execute() {
        this.obj.object.position.copy(this.newPos);
        this.obj.object.quaternion.copy(this.newRot);
        if (this.obj.body) {
            this.obj.body.position.copy(this.newPos as any);
            this.obj.body.quaternion.copy(this.newRot as any);
        }
    }

    undo() {
        this.obj.object.position.copy(this.oldPos);
        this.obj.object.quaternion.copy(this.oldRot);
        if (this.obj.body) {
            this.obj.body.position.copy(this.oldPos as any);
            this.obj.body.quaternion.copy(this.oldRot as any);
        }
    }
}

export class SetPropertyCommand implements Command {
    private oldValue: any;
    constructor(
        private target: any,
        private property: string,
        private newValue: any
    ) {
        this.oldValue = this.resolve(target, property);
    }
    private resolve(obj: any, path: string): any {
        const keys = path.split('.');
        let cur = obj;
        for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]];
        return cur[keys[keys.length - 1]];
    }
    private assign(obj: any, path: string, val: any): void {
        const keys = path.split('.');
        let cur = obj;
        for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]];
        cur[keys[keys.length - 1]] = val;
    }
    execute() { this.assign(this.target, this.property, this.newValue); }
    undo() { this.assign(this.target, this.property, this.oldValue); }
}

// ─── Logic Brick Type Registries ─────────────────────────────────
const _sensorRegistry = new Map<string, (data: any, ctx?: any) => Sensor>();
const _controllerRegistry = new Map<string, (data: any, ctx?: any) => Controller>();
const _actuatorRegistry = new Map<string, (data: any, ctx?: any) => Actuator>();
const _shaderNodeRegistry = new Map<string, (data: any) => ShaderNode>();

export function registerSensorType(type: string, factory: (data: any, ctx?: any) => Sensor) { _sensorRegistry.set(type, factory); }
export function registerControllerType(type: string, factory: (data: any, ctx?: any) => Controller) { _controllerRegistry.set(type, factory); }
export function registerActuatorType(type: string, factory: (data: any, ctx?: any) => Actuator) { _actuatorRegistry.set(type, factory); }
export function registerShaderNodeType(type: string, factory: (data: any) => ShaderNode) { _shaderNodeRegistry.set(type, factory); }

// Logic Brick Types
export type LogicState = 'NONE' | 'ACTIVE' | 'TRIGGERED';

/**
 * Base Logic Node (Inspired by UPBGE)
 */
export abstract class LogicNode {
    id: string = nanoid();
    state: LogicState = 'NONE';
    enabled: boolean = true;
    guiMetadata: { x: number, y: number } = { x: Math.random() * 200, y: Math.random() * 200 };

    abstract update(delta: number, b3obj: B3Object, engine: B3Engine): void;
    abstract getTypeName(): string;
    dispose?(): void;

    toJSON(): any {
        return {
            id: this.id,
            enabled: this.enabled,
            guiMetadata: this.guiMetadata
        };
    }
}

/**
 * Sensors detect triggers (Keyboard, Timer, etc.)
 */
export abstract class Sensor extends LogicNode {
    positive: boolean = false; // Is the sensor currently triggered?
    abstract update(delta: number, b3obj: B3Object, engine: B3Engine): void;
}

/**
 * Controllers process input from sensors (AND, OR, Python)
 */
export abstract class Controller extends LogicNode {
    sensors: Sensor[] = [];
    actuators: Actuator[] = [];

    addSensor(sensor: Sensor) { this.sensors.push(sensor); }
    addActuator(actuator: Actuator) { this.actuators.push(actuator); }

    abstract execute(delta: number, b3obj: B3Object, engine: B3Engine): void;
}

/**
 * Actuators execute actions (Motion, Sound, etc.)
 */
export abstract class Actuator extends LogicNode {
    abstract execute(delta: number, b3obj: B3Object, engine: B3Engine): void;
    abstract update(delta: number, b3obj: B3Object, engine: B3Engine): void;
}

// Concrete Implementations
export class KeyboardSensor extends Sensor {
    private keys: Set<string> = new Set();
    private onKeyDown = (e: KeyboardEvent) => {
        if (e.code === this.targetKey) this.keys.add(e.code);
    };
    private onKeyUp = (e: KeyboardEvent) => {
        if (e.code === this.targetKey) this.keys.delete(e.code);
    };

    constructor(private targetKey: string) {
        super();
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
    }
    
    getTypeName() { return 'KeyboardSensor'; }

    update(delta: number, b3obj: B3Object, engine: B3Engine) {
        this.positive = this.keys.has(this.targetKey);
    }

    dispose() {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
    }

    toJSON() {
        return {
            ...super.toJSON(),
            type: 'KeyboardSensor',
            targetKey: this.targetKey
        };
    }

    static fromJSON(data: any): KeyboardSensor {
        const node = new KeyboardSensor(data.targetKey);
        node.id = data.id;
        node.guiMetadata = data.guiMetadata;
        node.enabled = data.enabled;
        return node;
    }
}

export class CollisionSensor extends Sensor {
    constructor(public targetProperty: string = "") { super(); }
    getTypeName() { return 'CollisionSensor'; }
    update(delta: number, b3obj: B3Object, engine: B3Engine) {
        this.positive = false;
        for (const other of engine.objects) {
            if (other === b3obj) continue;
            // Simplified radius check for now
            if (b3obj.object.position.distanceTo(other.object.position) < 1.5) {
                if (!this.targetProperty || other.metadata[this.targetProperty] !== undefined || other.type === this.targetProperty) {
                    this.positive = true;
                    if (this.positive) break;
                }
            }
        }
    }
    toJSON() { return { ...super.toJSON(), type: 'CollisionSensor', targetProperty: this.targetProperty }; }
    static fromJSON(data: any): CollisionSensor {
        const n = new CollisionSensor(data.targetProperty);
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        return n;
    }
}

export class AndController extends Controller {
    getTypeName() { return 'AndController'; }
    execute(delta: number, b3obj: B3Object, engine: B3Engine) {
        const anySensorOff = this.sensors.some(s => !s.positive);
        if (!anySensorOff) {
            this.actuators.forEach(a => a.execute(delta, b3obj, engine));
        }
    }

    update(delta: number, b3obj: B3Object, engine: B3Engine) { this.execute(delta, b3obj, engine); }

    toJSON() {
        return {
            ...super.toJSON(),
            type: 'AndController',
            sensorIds: this.sensors.map(s => s.id),
            actuatorIds: this.actuators.map(a => a.id)
        };
    }

    static fromJSON(data: any): AndController {
        const node = new AndController();
        node.id = data.id;
        node.guiMetadata = data.guiMetadata;
        node.enabled = data.enabled;
        return node;
    }
}

export class PythonController extends Controller {
    static pyodide: any = null;
    private pyNamespace: any = null;
    private isReady = false;
    getTypeName() { return 'PythonController'; }

    constructor(public script: string = "print('B3JS Python Active')") {
        super();
        this.initPy();
    }

    async initPy() {
        if (!PythonController.pyodide) {
            if (typeof (window as any).loadPyodide === 'function') {
                PythonController.pyodide = await (window as any).loadPyodide();
            } else {
                console.error("B3JS: loadPyodide not found. Ensure script is loaded in index.html");
                return;
            }
        }
        this.pyNamespace = PythonController.pyodide.globals.get("dict")();
        this.isReady = true;
    }

    /** When false, scripts from deserialized/shared scenes will not execute. */
    static allowUntrustedScripts: boolean = false;
    /** Set to true for scripts authored locally in this session. */
    public isTrusted: boolean = true;

    execute(delta: number, b3obj: B3Object, engine: B3Engine) {
        if (!this.isReady || !this.pyNamespace) return;
        if (!this.isTrusted && !PythonController.allowUntrustedScripts) {
            return; // Block untrusted scripts from executing
        }
        try {
            const pyodide = PythonController.pyodide;
            // Sandboxed namespace: only expose safe, limited data
            this.pyNamespace.set("delta", delta);
            this.pyNamespace.set("sensor_states", this.sensors.map(s => s.positive));
            this.pyNamespace.set("actuator_count", this.actuators.length);
            this.pyNamespace.set("position", [b3obj.object.position.x, b3obj.object.position.y, b3obj.object.position.z]);
            this.pyNamespace.set("health", b3obj.health);
            this.pyNamespace.set("speed", b3obj.speed);
            // NOTE: engine and b3obj are deliberately NOT exposed to prevent arbitrary access
            
            pyodide.runPython(this.script, { globals: this.pyNamespace });
        } catch (e) {
            if (Math.random() < 0.01) console.error("B3JS: Python Error", e);
        }
    }

    update(delta: number, b3obj: B3Object, engine: B3Engine) { this.execute(delta, b3obj, engine); }

    toJSON() {
        return {
            ...super.toJSON(),
            type: 'PythonController',
            script: this.script,
            sensorIds: this.sensors.map(s => s.id),
            actuatorIds: this.actuators.map(a => a.id)
        };
    }

    static fromJSON(data: any): PythonController {
        const node = new PythonController(data.script);
        node.id = data.id;
        node.guiMetadata = data.guiMetadata;
        node.enabled = data.enabled;
        return node;
    }
}

export class MotionActuator extends Actuator {
    constructor(private object: THREE.Object3D, private velocity: THREE.Vector3) {
        super();
    }
    getTypeName() { return 'MotionActuator'; }
    execute(delta: number, b3obj: B3Object, engine: B3Engine) {
        this.object.position.add(this.velocity);
    }
    update(delta: number, b3obj: B3Object, engine: B3Engine) { /* Passive */ }

    toJSON() {
        return {
            ...super.toJSON(),
            type: 'MotionActuator',
            velocity: this.velocity.toArray()
        };
    }

    static fromJSON(data: any, object: THREE.Object3D): MotionActuator {
        const vel = new THREE.Vector3().fromArray(data.velocity);
        const node = new MotionActuator(object, vel);
        node.id = data.id;
        node.guiMetadata = data.guiMetadata;
        node.enabled = data.enabled;
        return node;
    }
}

/**
 * MiningSensor: Detects if a miner is active and meets hashrate thresholds
 */
export class MiningSensor extends Sensor {
    public hashrate: number = 0;
    public shares: number = 0;

    constructor(public threshold: number = 100) { super(); }
    getTypeName() { return 'MiningSensor'; }
    update(delta: number, b3obj: B3Object, engine: B3Engine) {
        this.positive = this.hashrate >= this.threshold && this.shares > 0;
    }

    onTelemetry(data: { hashrate: number, shares: number }) {
        this.hashrate = data.hashrate;
        this.shares = data.shares;
    }

    toJSON() {
        return {
            ...super.toJSON(),
            type: 'MiningSensor',
            threshold: this.threshold
        };
    }

    static fromJSON(data: any): MiningSensor {
        const node = new MiningSensor(data.threshold);
        node.id = data.id;
        node.guiMetadata = data.guiMetadata;
        node.enabled = data.enabled;
        return node;
    }
}

/**
 * MiningActuator: Controls a miner (Start/Stop)
 */
export class MiningActuator extends Actuator {
    constructor(private callback: (active: boolean) => void, private active: boolean = true) {
        super();
    }
    getTypeName() { return 'MiningActuator'; }
    execute(delta: number, b3obj: B3Object, engine: B3Engine) {
        this.callback(this.active);
    }

    update(delta: number, b3obj: B3Object, engine: B3Engine) { /* Passive */ }

    toJSON() {
        return {
            ...super.toJSON(),
            type: 'MiningActuator',
            active: this.active
        };
    }

    static fromJSON(data: any, onExecute: (active: boolean) => void): MiningActuator {
        const node = new MiningActuator(onExecute, data.active);
        node.id = data.id;
        node.guiMetadata = data.guiMetadata;
        node.enabled = data.enabled;
        return node;
    }
}

// ─── Web3ConnectActuator ─────────────────────────────────────────
// When executed by a Controller, toggles a 3D-overlaid wallet connect panel.

export class Web3ConnectActuator extends Actuator {
    private label: CSS2DObject | null = null;
    private panelEl: HTMLDivElement | null = null;
    private isConnected = false;
    private address: string | null = null;
    private _attached = false;

    constructor(
        public buttonText: string = 'Connect Wallet',
        public buttonColor: string = '#6366f1',
        public interactionDistance: number = 4
    ) {
        super();
    }

    getTypeName() { return 'Web3ConnectActuator'; }

    /** Build the HTML overlay element once and attach it as a CSS2DObject */
    private ensurePanel(b3obj: B3Object) {
        if (this._attached) return;
        this._attached = true;

        const el = document.createElement('div');
        el.id = `web3-panel-${this.id}`;
        el.style.cssText = `
            pointer-events: auto;
            background: rgba(10, 12, 28, 0.92);
            border: 1px solid rgba(99, 102, 241, 0.4);
            border-radius: 12px;
            padding: 14px 20px;
            font-family: 'Inter', 'Segoe UI', sans-serif;
            color: #e2e8f0;
            min-width: 180px;
            text-align: center;
            backdrop-filter: blur(8px);
            box-shadow: 0 4px 24px rgba(99,102,241,0.15);
            transition: opacity 0.25s;
        `;

        const status = document.createElement('div');
        status.style.cssText = 'font-size:11px; margin-bottom:8px; opacity:0.7;';
        status.textContent = '🌐 Disconnected';
        status.id = `web3-status-${this.id}`;

        const btn = document.createElement('button');
        btn.textContent = this.buttonText;
        btn.id = `web3-btn-${this.id}`;
        btn.style.cssText = `
            background: ${this.buttonColor};
            color: #fff; border: none; border-radius: 8px;
            padding: 8px 18px; font-size: 13px; font-weight: 600;
            cursor: pointer; width: 100%;
            transition: transform 0.15s, box-shadow 0.15s;
        `;
        btn.onmouseenter = () => { btn.style.transform = 'scale(1.04)'; btn.style.boxShadow = '0 2px 12px rgba(99,102,241,0.4)'; };
        btn.onmouseleave = () => { btn.style.transform = 'scale(1)'; btn.style.boxShadow = 'none'; };
        btn.onclick = () => this.handleClick(status, btn);

        el.appendChild(status);
        el.appendChild(btn);

        this.panelEl = el;
        this.label = new CSS2DObject(el);
        this.label.position.set(0, 2.2, 0);
        b3obj.object.add(this.label);
    }

    private handleClick(status: HTMLDivElement, btn: HTMLButtonElement) {
        if (this.isConnected) {
            // Disconnect
            this.isConnected = false;
            this.address = null;
            status.textContent = '🌐 Disconnected';
            status.style.color = '#94a3b8';
            btn.textContent = this.buttonText;
            btn.style.background = this.buttonColor;
            // Dispatch engine-level event
            window.dispatchEvent(new CustomEvent('b3js:wallet:disconnect'));
        } else {
            // Request connection — dispatches to the React UI layer
            status.textContent = '⏳ Connecting...';
            status.style.color = '#f59e0b';
            btn.disabled = true;

            window.dispatchEvent(new CustomEvent('b3js:wallet:connect'));

            // Listen for response from React/wagmi layer
            const handler = (e: Event) => {
                const detail = (e as CustomEvent).detail;
                btn.disabled = false;
                if (detail?.address) {
                    this.isConnected = true;
                    this.address = detail.address;
                    const short = detail.address.substring(0, 6) + '...' + detail.address.substring(38);
                    status.textContent = `✅ ${short}`;
                    status.style.color = '#10b981';
                    btn.textContent = 'Disconnect';
                    btn.style.background = '#ef4444';
                } else {
                    status.textContent = '❌ Failed';
                    status.style.color = '#ef4444';
                    setTimeout(() => { status.textContent = '🌐 Disconnected'; status.style.color = '#94a3b8'; }, 2500);
                }
                window.removeEventListener('b3js:wallet:result', handler);
            };
            window.addEventListener('b3js:wallet:result', handler);
        }
    }

    execute(delta: number, b3obj: B3Object, engine: B3Engine) {
        this.ensurePanel(b3obj);
    }

    update(delta: number, b3obj: B3Object, engine: B3Engine) {
        this.execute(delta, b3obj, engine);

        // Hide panel if player is too far
        if (this.panelEl && engine.camera) {
            const dist = engine.camera.position.distanceTo(b3obj.object.position);
            this.panelEl.style.opacity = dist < this.interactionDistance ? '1' : '0';
            this.panelEl.style.pointerEvents = dist < this.interactionDistance ? 'auto' : 'none';
        }
    }

    dispose() {
        if (this.label) {
            this.label.removeFromParent();
            this.label = null;
        }
        this.panelEl = null;
        this._attached = false;
    }

    toJSON() {
        return {
            ...super.toJSON(),
            type: 'Web3ConnectActuator',
            buttonText: this.buttonText,
            buttonColor: this.buttonColor,
            interactionDistance: this.interactionDistance
        };
    }

    static fromJSON(data: any): Web3ConnectActuator {
        const a = new Web3ConnectActuator(data.buttonText, data.buttonColor, data.interactionDistance);
        a.id = data.id;
        a.guiMetadata = data.guiMetadata;
        a.enabled = data.enabled;
        return a;
    }
}

export class InventoryActuator extends Actuator {
    constructor(public itemCategory: string, public quantity: number) { super(); }
    getTypeName() { return 'InventoryActuator'; }
    execute(delta: number, b3obj: B3Object, engine: B3Engine) {
        // Grant to all touching actors (or just player)
        const actors = engine.objects.filter(o => o.isActor && o.object.position.distanceTo(b3obj.object.position) < 1.5);
        actors.forEach(actor => {
            actor.inventory.addItem({
                name: `${this.itemCategory} Pickup`,
                category: this.itemCategory as any,
                weight: 0.1, stackable: true, quantity: this.quantity
            });
        });
        
        // Mark for deletion if picked up
        if (actors.length > 0) {
            b3obj.object.removeFromParent();
            if (b3obj.body) engine.world.removeBody(b3obj.body);
            engine.objects = engine.objects.filter(o => o !== b3obj);
        }
    }
    update(delta: number, b3obj: B3Object, engine: B3Engine) {}
    toJSON() { return { ...super.toJSON(), type: 'InventoryActuator', itemCategory: this.itemCategory, quantity: this.quantity }; }
    static fromJSON(data: any): InventoryActuator {
        const n = new InventoryActuator(data.itemCategory, data.quantity);
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        return n;
    }
}

/**
 * B3Object: A Three.js object wrapper with logic support
 */
export class B3Object {
    id: string = nanoid();
    networkId: string = nanoid();
    name: string = "Unnamed Object";
    type: string = "Object";
    private _fallbackLogic: any = { sensors: [], controllers: [], actuators: [] };
    
    get sensors(): Sensor[] {
        if (!this._engineRef) return this._fallbackLogic.sensors;
        return this._engineRef.ecs.getComponent<LogicComponent>(this.ecsEntityId, 'Logic')?.sensors || this._fallbackLogic.sensors;
    }
    set sensors(s: Sensor[]) {
        if (!this._engineRef) { this._fallbackLogic.sensors = s; return; }
        const l = this._engineRef.ecs.getComponent<LogicComponent>(this.ecsEntityId, 'Logic');
        if (l) l.sensors = s;
    }
    
    get controllers(): Controller[] {
        if (!this._engineRef) return this._fallbackLogic.controllers;
        return this._engineRef.ecs.getComponent<LogicComponent>(this.ecsEntityId, 'Logic')?.controllers || this._fallbackLogic.controllers;
    }
    set controllers(c: Controller[]) {
        if (!this._engineRef) { this._fallbackLogic.controllers = c; return; }
        const l = this._engineRef.ecs.getComponent<LogicComponent>(this.ecsEntityId, 'Logic');
        if (l) l.controllers = c;
    }

    get actuators(): Actuator[] {
        if (!this._engineRef) return this._fallbackLogic.actuators;
        return this._engineRef.ecs.getComponent<LogicComponent>(this.ecsEntityId, 'Logic')?.actuators || this._fallbackLogic.actuators;
    }
    set actuators(a: Actuator[]) {
        if (!this._engineRef) { this._fallbackLogic.actuators = a; return; }
        const l = this._engineRef.ecs.getComponent<LogicComponent>(this.ecsEntityId, 'Logic');
        if (l) l.actuators = a;
    }
    body?: CANNON.Body;
    parent: B3Object | null = null;
    children: B3Object[] = [];
    metadata: any = {};

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
    private _engineRef: B3Engine | null = null;
    
    get health(): number { 
        if (this._engineRef) {
            const h = this._engineRef.ecs.getComponent<HealthComponent>(this.ecsEntityId, 'Health');
            if (h) return h.hp;
        }
        return 100;
    }
    set health(v: number) {
        if (this._engineRef) {
            const h = this._engineRef.ecs.getComponent<HealthComponent>(this.ecsEntityId, 'Health');
            if (h) h.hp = v;
        }
    }
    get maxHealth(): number {
        if (this._engineRef) {
            const h = this._engineRef.ecs.getComponent<HealthComponent>(this.ecsEntityId, 'Health');
            if (h) return h.maxHp;
        }
        return 100;
    }
    set maxHealth(v: number) {
        if (this._engineRef) {
            const h = this._engineRef.ecs.getComponent<HealthComponent>(this.ecsEntityId, 'Health');
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
    fireRate: number = 0.5; // Seconds between shots
    projectileForce: number = 50;
    lastFireTime: number = 0;

    // Inventory & Gear
    inventory: InventoryManager = new InventoryManager();
    sockets: Map<string, THREE.Object3D> = new Map();
    private equippedModels: Map<string, THREE.Object3D> = new Map();

    // Avatar & Visuals
    public avatarUrl: string = "";
    private visualGroup: THREE.Group = new THREE.Group();

    constructor(public object: THREE.Object3D) {
        this.ecsEntityId = createEntity();
        this.object.userData.b3obj = this; // Back-reference for raycasting
        this.targetPosition.copy(object.position);
        this.targetQuaternion.copy(object.quaternion);
        
        // Setup Visual Group
        this.object.add(this.visualGroup);
        if (this.object instanceof THREE.Mesh) {
            // If the root IS a mesh, move its geometry to a child to keep the root as a container
            const placeholder = new THREE.Mesh(this.object.geometry, this.object.material);
            this.visualGroup.add(placeholder);
            // Hide the root geometry/material if it remains a mesh (simplified)
            (this.object as any).visible = false; 
            // Better: Ensure root is a Group eventually, but for now we hide the parent mesh visuals
        }

        if ((this.object as any).material) {
            this.standardMaterial = (this.object as any).material;
        } else {
            this.standardMaterial = new THREE.MeshStandardMaterial({ color: 0x444444 });
        }
        this.initSockets();
    }

    setEngineRef(engine: B3Engine) {
        this._engineRef = engine;
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
            
            // 1. Clear current visuals
            [...this.visualGroup.children].forEach(child => this.visualGroup.remove(child));
            
            // 2. Add new model
            this.visualGroup.add(gltf.scene);
            this.visualGroup.visible = true;

            // 3. Attempt Socket Re-binding
            this.rebindSocketsToModel(gltf.scene);
            
            console.log(`B3JS Engine: Avatar Loaded Successfully.`);
        } catch (e) {
            console.error(`B3JS Engine: Failed to load avatar ${url}`, e);
        }
    }

    private rebindSocketsToModel(model: THREE.Group) {
        // Search for nodes named exactly like our sockets
        this.sockets.forEach((socket, name) => {
            const bone = model.getObjectByName(name) || model.getObjectByName(`SOCKET_${name}`);
            if (bone) {
                console.log(`B3JS Engine: Re-binding socket '${name}' to model bone.`);
                bone.add(socket);
                socket.position.set(0, 0, 0);
            } else {
                // Keep attached to root container if bone not found
                this.object.add(socket);
            }
        });
    }

    public recalculatePhysicsBody() {
        if (!this.body) return;

        // Compute Bounding Box from visual meshes
        const bbox = new THREE.Box3().setFromObject(this.visualGroup);
        const size = new THREE.Vector3();
        bbox.getSize(size);

        console.log(`B3JS Engine: Recalculating Physics for ${this.name}. Size:`, size);

        // Remove old shape
        while (this.body.shapes.length > 0) this.body.removeShape(this.body.shapes[0]);

        // Add new Box shape
        const shape = new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2));
        this.body.addShape(shape);
        
        // Offset if necessary
        const center = new THREE.Vector3();
        bbox.getCenter(center);
        const localCenter = center.sub(this.object.position);
        this.body.shapeOffsets[0].copy(localCenter as any);
        
        this.body.updateBoundingRadius();
    }

    public normalizeScale() {
        if (!this.object) return;
        
        // Ensure matrices are updated
        this.object.updateMatrixWorld(true);

        const scale = this.object.scale.clone();
        
        // Bake the scale into the geometry if possible
        if (this.object instanceof THREE.Mesh && this.object.geometry) {
            this.object.geometry.scale(scale.x, scale.y, scale.z);
            this.object.geometry.computeBoundingBox();
            this.object.geometry.computeBoundingSphere();
        } else {
            // Traverses down to find a mesh to scale if it's a group
            this.object.traverse((child) => {
                if (child instanceof THREE.Mesh && child.geometry) {
                    child.geometry.scale(scale.x, scale.y, scale.z);
                    child.geometry.computeBoundingBox();
                    child.geometry.computeBoundingSphere();
                }
            });
        }
        
        // Reset transform scale to 1,1,1
        this.object.scale.set(1, 1, 1);
        
        // Flag for deferred physics recalculation
        this._physicsDirty = true;
    }

    private initSockets() {
        // Create default attachment points
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
        
        // 1. Unequip current item in that slot
        this.unequipItem(item.slot);

        // 2. Track in state
        this.inventory.equipped.set(item.slot, item);

        // 3. Visual Representation
        if (item.modelUrl) {
            const socket = this.sockets.get(item.slot);
            if (socket) {
                // For now, spawn a placeholder if no URL, or load from URL
                const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.4), new THREE.MeshStandardMaterial({ color: 0xffaa00 }));
                socket.add(mesh);
                this.equippedModels.set(item.slot, mesh);
            }
        }

        // 4. Stat Modification
        if (item.stats?.damage && this.isWeapon) {
            this.damage += item.stats.damage;
        }
        console.log(`B3JS Gear: Equipped ${item.name} to ${item.slot}`);
    }

    public unequipItem(slot: string) {
        const item = this.inventory.equipped.get(slot);
        if (!item) return;

        // Visual Cleanup
        const model = this.equippedModels.get(slot);
        if (model) {
            const socket = this.sockets.get(slot);
            if (socket) socket.remove(model);
            this.equippedModels.delete(slot);
        }

        // Stat Reversion
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

        // Ensure we have an output node
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

    update(delta: number, engine: B3Engine) {
        if (!this.object) return;

        // Note: Logic Bricks Update is now handled globally via the ECS LogicSystem 
        // running inside B3Engine.animate()!
        
        if (!this.isRemote) {
            // Local Physics Sync — only for dynamic bodies (static/kinematic shouldn't overwrite visual position)
            if (this.body && this.body.type === CANNON.Body.DYNAMIC) {
                this.object.position.copy(this.body.position as any);
                this.object.quaternion.copy(this.body.quaternion as any);
            }
        } else {
            // Remote Interpolation
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
                const factory = _shaderNodeRegistry.get(nData.type);
                return factory ? factory(nData) : null;
            }).filter((n: any) => n !== null);
        }

        // Restore Logic Nodes (via registries)
        if (data.logic) {
            obj.sensors = (data.logic.sensors || []).map((n: any) => {
                const factory = _sensorRegistry.get(n.type);
                return factory ? factory(n, obj) : null;
            }).filter((n: any) => n !== null);

            obj.controllers = (data.logic.controllers || []).map((n: any) => {
                const factory = _controllerRegistry.get(n.type);
                return factory ? factory(n, obj) : null;
            }).filter((n: any) => n !== null);

            obj.actuators = (data.logic.actuators || []).map((n: any) => {
                const factory = _actuatorRegistry.get(n.type);
                return factory ? factory(n, obj) : null;
            }).filter((n: any) => n !== null);
        }

        return obj;
    }
}

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
    xr: XRManager;
    optimizer: Optimizer;
    vehicles: VehicleManager;
    combat: CombatManager;
    pathfinder: Pathfinding = new Pathfinding(); // Fallback for synchronous ops
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
    zoningRadius: number = 300; // 3 cells radius
    
    private audioSubsetBuffer = new Float32Array(128);
    private loadingManager = new THREE.LoadingManager();

    selectedObject: B3Object | null = null;
    private gizmo: TransformControls;
    private grid: THREE.GridHelper;
    private raycaster = new THREE.Raycaster();
    private mouse = new THREE.Vector2();
    private onSelectionChange: (obj: B3Object | null) => void = () => { };

    constructor(private container: HTMLElement) {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
        this.camera.add(this.audio.getListener()); // Attached for spatial audio

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.xr.enabled = true; // WebXR core activation
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
        (this.ecs as any)._engineRef = this; // Required for LogicSystem resolution

        // Setup XR Rig for independent locomotion
        this.scene.add(this.xrRig);
        this.xrRig.add(this.camera);
        this.xr = new XRManager(this);
        this.optimizer = new Optimizer(this);
        this.vehicles = new VehicleManager(this);
        this.combat = new CombatManager(this);

        this.world = new CANNON.World();
        this.world.gravity.set(0, -9.82, 0);

        // Grid Helper
        this.grid = new THREE.GridHelper(100, 100, 0x444444, 0x222222);
        this.scene.add(this.grid);

        // Transform Gizmo
        this.gizmo = new TransformControls(this.camera, this.renderer.domElement);
        this.gizmo.addEventListener('change', () => {
            if (this.selectedObject && this.selectedObject.body) {
                // Sync gizmo changes back to physics body
                this.selectedObject.body.position.copy(this.selectedObject.object.position as any);
                this.selectedObject.body.quaternion.copy(this.selectedObject.object.quaternion as any);
                this.selectedObject.body.velocity.set(0, 0, 0);
                this.selectedObject.body.angularVelocity.set(0, 0, 0);
            }
        });

        // Prevent raycasting selection while using gizmo
        let startPos = new THREE.Vector3();
        let startRot = new THREE.Quaternion();

        this.gizmo.addEventListener('dragging-changed', (event) => {
            if (this.selectedObject) {
                if (event.value) {
                    // Start dragging
                    startPos.copy(this.selectedObject.object.position);
                    startRot.copy(this.selectedObject.object.quaternion);
                } else {
                    // End dragging - Record History
                    const endPos = this.selectedObject.object.position.clone();
                    const endRot = this.selectedObject.object.quaternion.clone();
                    
                    if (!startPos.equals(endPos)) {
                        this.history.execute(new MoveObjectCommand(
                            this.selectedObject,
                            startPos.clone(),
                            startRot.clone(),
                            endPos,
                            endRot
                        ));
                    }
                }

                if (this.selectedObject.body) {
                    // Disable physics during drag to prevent jitter
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
        container.addEventListener('mousedown', (e) => this.handleClick(e));

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
            self.postMessage({ id: data.id, path: path }); // Array of Vector3-like objects
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
        // Only add to scene if it has no parent (root level)
        if (!b3obj.parent) {
            this.scene.add(b3obj.object);
        }
        if (b3obj.body) this.world.addBody(b3obj.body);
    }

    removeObject(id: string) {
        const b3obj = this.objects.find(o => o.id === id);
        if (!b3obj) return;

        // 1. Recursively remove children first
        [...b3obj.children].forEach(child => this.removeObject(child.id));

        // 2. Handle visual removal and parent detachment
        if (b3obj.parent) {
            b3obj.parent.removeChild(b3obj);
        } else {
            this.scene.remove(b3obj.object);
        }

        // 3. Cleanup physics
        if (b3obj.body) {
            this.world.removeBody(b3obj.body);
        }

        // 4. Cleanup logic node event listeners
        [...b3obj.sensors, ...b3obj.controllers, ...b3obj.actuators].forEach(node => {
            if (node.dispose) node.dispose();
        });

        // 5. Final tracking cleanup
        this.objects = this.objects.filter(o => o.id !== id);
        if (this.selectedObject === b3obj) this.selectObject(null);
    }

    toggleSimulation() {
        if (this.isPaused) {
            // Unpausing: User clicked "Play". Save current editor state
            this._prePlayState = this.serialize();
            this.isPaused = false;
        } else {
            // Pausing: User clicked "Stop". Restore pristine editor state
            this.isPaused = true;
            if (this._prePlayState) {
                // Remove physics engine interpolation loops immediately preventing body overrides during deserialize
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
        // Remove all user-added objects (keep floor if desired, or just clear all)
        [...this.objects].forEach(o => this.removeObject(o.id));
        this.scene.background = new THREE.Color(0x050505);
        console.log("B3JS Engine: Scene Reset");
    }

    /**
     * Scene Management API
     */
    createDefaultEnvironment() {
        this.resetScene();

        // 1. Skybox (Atmosphere)
        const skyGeo = new THREE.SphereGeometry(500, 32, 32);
        const skyMat = new THREE.MeshBasicMaterial({ color: 0x1a233a, side: THREE.BackSide });
        const sky = new THREE.Mesh(skyGeo, skyMat);
        const b3sky = new B3Object(sky);
        b3sky.name = "Skybox";
        b3sky.type = "Environment";
        b3sky.isStatic = true;
        this.addObject(b3sky);

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
        this.addObject(b3floor);

        // 3. Lights
        const ambient = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambient);
        
        const sun = new THREE.DirectionalLight(0xffffff, 1);
        sun.position.set(10, 20, 10);
        sun.castShadow = true;
        this.scene.add(sun);
    }

    createNewScene(name: string) {
        if (this.sceneRegistry.has(name)) return;
        
        // Save current first
        this.sceneRegistry.set(this.activeSceneName, JSON.parse(this.serialize()));
        
        this.activeSceneName = name;
        this.createDefaultEnvironment();
        this.saveToLocalStorage();
    }

    switchScene(name: string) {
        if (!this.sceneRegistry.has(name) && name !== this.activeSceneName) return;

        // Save current
        this.sceneRegistry.set(this.activeSceneName, JSON.parse(this.serialize()));

        // Load targeted
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
        const raw = localStorage.getItem('B3JS_PROJECT_DATA');
        if (!raw) {
            // Initial boot: populate with Boltevm World template
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

    /**
     * NPC & Pathfinding API
     */
    bakeNavMesh() {
        console.log("B3JS Engine: Baking NavMesh...");
        // Collect all static geometry + floor
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

        // Merge geometry for pathfinding (simplified)
        // In a complex engine, we'd use a real NavMesh generator. 
        // For B3JS, we'll use the combined geometry of static objects.
        const zone = Pathfinding.createZone(staticMeshes[0].geometry); // Using primary surface as anchor
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

    createCube(name = "Cube") {
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
        
        this.addObject(b3obj);
        return b3obj;
    }

    createNPC(name = "Basic NPC") {
        const npc = this.createCube(name);
        npc.isActor = true;
        npc.teamId = 2; // Default Hostile
        npc.type = "Actor";
        (npc.object as THREE.Mesh).material = new THREE.MeshStandardMaterial({ color: 0xff3333 });

        // Build a basic AI brain
        const and = new AndController();
        const motion = new MotionActuator(npc.object, new THREE.Vector3(0, 0, 0));
        npc.addController(and);
        npc.addActuator(motion);
        
        return npc;
    }

    createWeaponUnit(name = "Combat Turret") {
        const weapon = this.createCube(name);
        (weapon.object as THREE.Mesh).scale.set(0.5, 2, 0.5);
        weapon.isWeapon = true;
        weapon.weaponMode = 'physical';
        weapon.type = "Weapon";
        return weapon;
    }

    createVehicleBase(name = "Vehicle Chassis") {
        const chassis = this.createCube(name);
        (chassis.object as THREE.Mesh).scale.set(2, 0.5, 4);
        chassis.isVehicle = true;
        chassis.type = "Vehicle";
        chassis.seats.push({ name: "Driver", offset: new THREE.Vector3(0, 0.6, 0), occupantId: null });
        
        // Initialize physics
        this.vehicles.createVehicle(chassis);
        return chassis;
    }

    createSphere(name = "Sphere") {
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
        
        this.addObject(b3obj);
        return b3obj;
    }

    createLight(name = "PointLight") {
        const light = new THREE.PointLight(0xffffff, 10, 50);
        light.position.set(2, 5, 2);
        
        // Wrap light in a B3Object so it appears in outliner
        const b3obj = new B3Object(light);
        b3obj.name = name;
        b3obj.type = "Light";
        
        this.addObject(b3obj);
        return b3obj;
    }

    createSpatialAudio(url: string, name = "AudioSource") {
        const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.2, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0xe68523, wireframe: true })
        );
        const b3obj = new B3Object(mesh);
        b3obj.name = name;
        b3obj.type = "Audio";

        const source = new B3AudioSource(this.audio.getListener(), url);
        b3obj.object.add(source.audio);
        (b3obj as any).audioSource = source;

        this.addObject(b3obj);
        return b3obj;
    }

    createAmmoPickup(name = "Ammo Case") {
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
        
        this.addObject(obj);
        return obj;
    }

    createHealthPickup(name = "Medkit") {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.1), new THREE.MeshStandardMaterial({ color: 0xffffff }));
        const obj = new B3Object(mesh);
        obj.name = name;
        obj.type = "Pickup";
        
        // Add cross visual
        const cross = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.12), new THREE.MeshStandardMaterial({ color: 0xff3333 }));
        obj.object.add(cross);
        
        this.addObject(obj);
        return obj;
    }

    createAdvancedActor(name = "Tactical Hero") {
        const actor = this.createNPC(name);
        actor.isActor = true;
        actor.teamId = 1; // Playable team
        actor.inventory.addItem({
            name: "Initial Gear",
            category: 'Material',
            weight: 1,
            stackable: true,
            quantity: 1
        });

        // Set high-fidelity placeholder
        actor.setAvatar("https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/CesiumMan/glTF-Binary/CesiumMan.glb");
        
        return actor;
    }

    /**
     * Boltevm World Template
     * Spawns a complete Web3-enabled arena environment with:
     * - Ground plane with physics
     * - Ambient + directional lighting
     * - GLB props from Boltevm assets
     * - WalletConnect trigger kiosk with 3D HTML overlay
     */
    async createBoltevmTemplate(name = 'Boltevm World') {
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
        this.addObject(ground);

        // 2. Lighting
        const ambient = new THREE.AmbientLight(0x404060, 0.6);
        const ambObj = new B3Object(ambient);
        ambObj.name = 'Ambient Light';
        ambObj.type = 'Light';
        this.addObject(ambObj);

        const sun = new THREE.DirectionalLight(0xffeedd, 1.2);
        sun.position.set(10, 20, 10);
        sun.castShadow = true;
        const sunObj = new B3Object(sun);
        sunObj.name = 'Sun';
        sunObj.type = 'Light';
        this.addObject(sunObj);

        // 3. Load GLB props
        const loader = new GLTFLoader();
        try {
            const aiGltf = await loader.loadAsync('/ai.glb');
            const aiMesh = aiGltf.scene;
            aiMesh.position.set(-4, 0, -6);
            aiMesh.scale.setScalar(2);
            const aiObj = new B3Object(aiMesh);
            aiObj.name = 'AI Beacon';
            aiObj.type = 'Prop';
            aiObj.isStatic = true;
            this.addObject(aiObj);
        } catch (e) { console.warn('B3JS: ai.glb not found, skipping.'); }

        try {
            const blockGltf = await loader.loadAsync('/crash-block.glb');
            const blockMesh = blockGltf.scene;
            blockMesh.position.set(5, 0, -3);
            const blockObj = new B3Object(blockMesh);
            blockObj.name = 'Crash Block';
            blockObj.type = 'Prop';
            blockObj.isStatic = true;
            this.addObject(blockObj);
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

        this.addObject(kiosk);

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
            this.addObject(pObj);
        });

        console.log(`B3JS Engine: ${name} Template Generated Successfully.`);
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
                shape: source.body.shapes[0], // Shallow copy of shape
                position: source.body.position.clone() as any,
                quaternion: source.body.quaternion.clone() as any
            });
            // Nudge position slightly so they aren't perfectly overlapping
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

    applyBlueprint(objectId: string, blueprintId: string) {
        const obj = this.objects.find(o => o.id === objectId);
        if (!obj) return;

        if (blueprintId === 'WASD_MOVEMENT') {
            const keys = ['KeyW', 'KeyS', 'KeyA', 'KeyD'];
            const labels = ['Forward', 'Backward', 'Left', 'Right'];
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

    private handleClick(e: MouseEvent) {
        const rect = this.container.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / this.container.clientWidth) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / this.container.clientHeight) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);

        // Check for Gizmo intersection first
        const gizmoIntersects = this.raycaster.intersectObjects(this.gizmo.getHelper().children, true);
        if (gizmoIntersects.length > 0) return; // Gizmo handles its own events

        const intersects = this.raycaster.intersectObjects(this.scene.children, true);

        if (intersects.length > 0) {
            let obj3d = intersects[0].object;
            while (obj3d && !obj3d.userData.b3obj) obj3d = obj3d.parent!;

            if (obj3d && obj3d.userData.b3obj) {
                this.selectedObject = obj3d.userData.b3obj;
                this.gizmo.attach(this.selectedObject!.object);
                console.log("Selected:", this.selectedObject!.name);
            } else {
                this.selectedObject = null;
                this.gizmo.detach();
            }
        } else {
            this.selectedObject = null;
            this.gizmo.detach();
        }
        this.onSelectionChange(this.selectedObject);
    }

    private onResize() {
        this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.css2dRenderer.setSize(this.container.clientWidth, this.container.clientHeight);
    }

    start() {
        this.renderer.setAnimationLoop(() => this.animate());
    }

    private animate() {
        this.timer.update();
        const delta = Math.min(this.timer.getDelta(), 0.1); // Cap delta to prevent physics explosion

        if (!this.isPaused) {
            this.ecs.tick(delta);
            // Use fixed time step with delta for consistency
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

            // Deferred physics recalculation (e.g. from normalizeScale)
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
                // Generate base visuals
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
                } else {
                    mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
                }

                // Cleanly restore all state via fromJSON
                const restored = B3Object.fromJSON(objData, mesh);

                // Restore physics
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
                    const obj = new B3Object(gltf.scene);
                    obj.name = file.name;
                    this.addObject(obj);
                });
            }
        }
    }

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

// ─── Register Built-in Types ─────────────────────────────────────
registerSensorType('KeyboardSensor', (d) => KeyboardSensor.fromJSON(d));
registerSensorType('CollisionSensor', (d) => CollisionSensor.fromJSON(d));
registerSensorType('MiningSensor', (d) => MiningSensor.fromJSON(d));

registerControllerType('AndController', (d) => AndController.fromJSON(d));
registerControllerType('PythonController', (d) => PythonController.fromJSON(d));

registerActuatorType('MotionActuator', (d, ctx) => MotionActuator.fromJSON(d, ctx?.object));
registerActuatorType('MiningActuator', (d) => MiningActuator.fromJSON(d, () => {}));
registerActuatorType('InventoryActuator', (d) => InventoryActuator.fromJSON(d));
registerActuatorType('Web3ConnectActuator', (d) => Web3ConnectActuator.fromJSON(d));

registerShaderNodeType('ColorNode', (d) => ColorNode.fromJSON(d));
registerShaderNodeType('PositionNode', (d) => PositionNode.fromJSON(d));
registerShaderNodeType('TimeNode', (d) => TimeNode.fromJSON(d));
registerShaderNodeType('MathNode', (d) => MathNode.fromJSON(d));
registerShaderNodeType('AudioNode', (d) => AudioNode.fromJSON(d));
registerShaderNodeType('OutputNode', (d) => OutputNode.fromJSON(d));
