import * as THREE from 'three';
import { LogicNode } from '../base';
import { execIn, execOut, dataIn, dataOut } from '../pins';
import type { ExecutionContext, NodeInfo } from '../graph';

/**
 * MoveToNode: Translate the object toward a direction or target position.
 */
export class MoveToNode extends LogicNode {
    constructor() {
        super();
        this.inputs = [
            execIn(this.id),
            dataIn(this.id, 'Direction', 'vector3', { x: 0, y: 0, z: -1 }),
            dataIn(this.id, 'Speed', 'number', 5)
        ];
        this.outputs = [
            execOut(this.id, 'Out')
        ];
    }

    getTypeName() { return 'MoveToNode'; }

    onExecute(pinId: string, ctx: ExecutionContext) {
        const dir = this.getInput('Direction') || { x: 0, y: 0, z: -1 };
        const speed = this.getInput('Speed') || 5;
        const v = new THREE.Vector3(dir.x, dir.y, dir.z).normalize().multiplyScalar(speed * ctx.delta);
        ctx.b3obj.object.position.add(v);
        if (ctx.b3obj.body) {
            ctx.b3obj.body.position.copy(ctx.b3obj.object.position as any);
        }
        this.state = 'TRIGGERED';
    }

    update() {}

    static getNodeInfo(): NodeInfo {
        return { type: 'MoveToNode', label: 'Move', category: 'Action', color: '#457b9d', description: 'Translate object in a direction', icon: '🏃' };
    }

    toJSON() { return { ...super.toJSON(), type: 'MoveToNode' }; }
    static fromJSON(data: any): MoveToNode {
        const n = new MoveToNode();
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        n.restorePins(data);
        return n;
    }
}

/**
 * RotateNode: Rotate the object by axis and speed.
 */
export class RotateNode extends LogicNode {
    constructor() {
        super();
        this.inputs = [
            execIn(this.id),
            dataIn(this.id, 'Axis', 'vector3', { x: 0, y: 1, z: 0 }),
            dataIn(this.id, 'Speed', 'number', 1)
        ];
        this.outputs = [execOut(this.id, 'Out')];
    }

    getTypeName() { return 'RotateNode'; }

    onExecute(pinId: string, ctx: ExecutionContext) {
        const axis = this.getInput('Axis') || { x: 0, y: 1, z: 0 };
        const speed = this.getInput('Speed') || 1;
        ctx.b3obj.object.rotateOnAxis(new THREE.Vector3(axis.x, axis.y, axis.z).normalize(), speed * ctx.delta);
        this.state = 'TRIGGERED';
    }

    update() {}

    static getNodeInfo(): NodeInfo {
        return { type: 'RotateNode', label: 'Rotate', category: 'Action', color: '#457b9d', description: 'Rotate object around an axis', icon: '🔄' };
    }

    toJSON() { return { ...super.toJSON(), type: 'RotateNode' }; }
    static fromJSON(data: any): RotateNode {
        const n = new RotateNode();
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        n.restorePins(data);
        return n;
    }
}

/**
 * PlaySoundNode: Trigger a spatial audio source.
 */
export class PlaySoundNode extends LogicNode {
    constructor() {
        super();
        this.inputs = [
            execIn(this.id),
            dataIn(this.id, 'Url', 'string', '/sounds/default.mp3'),
            dataIn(this.id, 'Volume', 'number', 1)
        ];
        this.outputs = [execOut(this.id, 'Out')];
    }

    getTypeName() { return 'PlaySoundNode'; }

    onExecute(pinId: string, ctx: ExecutionContext) {
        // Use engine audio system
        const url = this.getInput('Url');
        const volume = this.getInput('Volume') ?? 1;
        if (url && ctx.engine.audio) {
            try {
                const audio = new Audio(url);
                audio.volume = Math.max(0, Math.min(1, volume));
                audio.play().catch(() => {});
            } catch (e) { /* silent fail */ }
        }
        this.state = 'TRIGGERED';
    }

    update() {}

    static getNodeInfo(): NodeInfo {
        return { type: 'PlaySoundNode', label: 'Play Sound', category: 'Action', color: '#457b9d', description: 'Play an audio file', icon: '🔊' };
    }

    toJSON() { return { ...super.toJSON(), type: 'PlaySoundNode' }; }
    static fromJSON(data: any): PlaySoundNode {
        const n = new PlaySoundNode();
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        n.restorePins(data);
        return n;
    }
}

/**
 * SpawnObjectNode: Instantiate a primitive at a position.
 */
export class SpawnObjectNode extends LogicNode {
    constructor() {
        super();
        this.inputs = [
            execIn(this.id),
            dataIn(this.id, 'Type', 'string', 'Cube'),
            dataIn(this.id, 'Position', 'vector3', { x: 0, y: 2, z: 0 })
        ];
        this.outputs = [
            execOut(this.id, 'Out'),
            dataOut(this.id, 'Spawned', 'object')
        ];
    }

    getTypeName() { return 'SpawnObjectNode'; }

    onExecute(pinId: string, ctx: ExecutionContext) {
        const type = this.getInput('Type') || 'Cube';
        const pos = this.getInput('Position') || { x: 0, y: 2, z: 0 };
        let obj;
        if (type === 'Sphere') obj = ctx.engine.createSphere('Spawned Sphere');
        else obj = ctx.engine.createCube('Spawned Cube');
        
        if (obj) {
            obj.object.position.set(pos.x, pos.y, pos.z);
            if (obj.body) obj.body.position.set(pos.x, pos.y, pos.z);
            this.setOutput('Spawned', obj);
        }
        this.state = 'TRIGGERED';
    }

    update() {}

    static getNodeInfo(): NodeInfo {
        return { type: 'SpawnObjectNode', label: 'Spawn Object', category: 'Action', color: '#457b9d', description: 'Create a new object at runtime', icon: '✨' };
    }

    toJSON() { return { ...super.toJSON(), type: 'SpawnObjectNode' }; }
    static fromJSON(data: any): SpawnObjectNode {
        const n = new SpawnObjectNode();
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        n.restorePins(data);
        return n;
    }
}

/**
 * DestroyObjectNode: Remove the owning object from the scene.
 */
export class DestroyObjectNode extends LogicNode {
    constructor() {
        super();
        this.inputs = [execIn(this.id)];
    }

    getTypeName() { return 'DestroyObjectNode'; }

    onExecute(pinId: string, ctx: ExecutionContext) {
        ctx.engine.removeObject(ctx.b3obj.id);
    }

    update() {}

    static getNodeInfo(): NodeInfo {
        return { type: 'DestroyObjectNode', label: 'Destroy', category: 'Action', color: '#457b9d', description: 'Remove object from scene', icon: '💀' };
    }

    toJSON() { return { ...super.toJSON(), type: 'DestroyObjectNode' }; }
    static fromJSON(data: any): DestroyObjectNode {
        const n = new DestroyObjectNode();
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        n.restorePins(data);
        return n;
    }
}

/**
 * SendMessageNode: Dispatch a custom event to other objects.
 */
export class SendMessageNode extends LogicNode {
    constructor() {
        super();
        this.inputs = [
            execIn(this.id),
            dataIn(this.id, 'Channel', 'string', 'default'),
            dataIn(this.id, 'Payload', 'any', null)
        ];
        this.outputs = [execOut(this.id, 'Out')];
    }

    getTypeName() { return 'SendMessageNode'; }

    onExecute(pinId: string, ctx: ExecutionContext) {
        const channel = this.getInput('Channel') || 'default';
        const payload = this.getInput('Payload');
        window.dispatchEvent(new CustomEvent(`b3js:msg:${channel}`, { detail: { sender: ctx.b3obj.id, payload } }));
        this.state = 'TRIGGERED';
    }

    update() {}

    static getNodeInfo(): NodeInfo {
        return { type: 'SendMessageNode', label: 'Send Message', category: 'Action', color: '#457b9d', description: 'Broadcast a custom event', icon: '📡' };
    }

    toJSON() { return { ...super.toJSON(), type: 'SendMessageNode' }; }
    static fromJSON(data: any): SendMessageNode {
        const n = new SendMessageNode();
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        n.restorePins(data);
        return n;
    }
}

/**
 * LogNode: Print a message to the console (debugging).
 */
export class LogNode extends LogicNode {
    constructor() {
        super();
        this.inputs = [
            execIn(this.id),
            dataIn(this.id, 'Message', 'string', 'Hello B3JS')
        ];
        this.outputs = [execOut(this.id, 'Out')];
    }

    getTypeName() { return 'LogNode'; }

    onExecute(pinId: string, ctx: ExecutionContext) {
        console.log(`[B3JS Log] ${this.getInput('Message')}`);
        this.state = 'TRIGGERED';
    }

    update() {}

    static getNodeInfo(): NodeInfo {
        return { type: 'LogNode', label: 'Log', category: 'Action', color: '#457b9d', description: 'Print to console', icon: '📋' };
    }

    toJSON() { return { ...super.toJSON(), type: 'LogNode' }; }
    static fromJSON(data: any): LogNode {
        const n = new LogNode();
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        n.restorePins(data);
        return n;
    }
}

/**
 * SetMaterialNode: Change the object's material color at runtime.
 */
export class SetMaterialNode extends LogicNode {
    constructor() {
        super();
        this.inputs = [
            execIn(this.id),
            dataIn(this.id, 'Color', 'number', 0xff0000)
        ];
        this.outputs = [execOut(this.id, 'Out')];
    }

    getTypeName() { return 'SetMaterialNode'; }

    onExecute(pinId: string, ctx: ExecutionContext) {
        const color = this.getInput('Color') ?? 0xff0000;
        const obj = ctx.b3obj.object;
        if (obj instanceof THREE.Mesh && obj.material) {
            (obj.material as THREE.MeshStandardMaterial).color.setHex(color);
        }
        this.state = 'TRIGGERED';
    }

    update() {}

    static getNodeInfo(): NodeInfo {
        return { type: 'SetMaterialNode', label: 'Set Material', category: 'Action', color: '#457b9d', description: 'Change material color', icon: '🎨' };
    }

    toJSON() { return { ...super.toJSON(), type: 'SetMaterialNode' }; }
    static fromJSON(data: any): SetMaterialNode {
        const n = new SetMaterialNode();
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        n.restorePins(data);
        return n;
    }
}

/**
 * DoorToggleNode: Animates a door open/close via position offset.
 */
export class DoorToggleNode extends LogicNode {
    private isOpen = false;
    private progress = 0;

    constructor() {
        super();
        this.inputs = [
            execIn(this.id, 'Toggle'),
            dataIn(this.id, 'OpenOffset', 'vector3', { x: 0, y: 3, z: 0 }),
            dataIn(this.id, 'Speed', 'number', 2)
        ];
        this.outputs = [
            execOut(this.id, 'Opened'),
            execOut(this.id, 'Closed'),
            dataOut(this.id, 'IsOpen', 'boolean')
        ];
    }

    getTypeName() { return 'DoorToggleNode'; }

    onExecute(pinId: string, ctx: ExecutionContext) {
        if (pinId.includes('Toggle') || pinId === '__event__') {
            this.isOpen = !this.isOpen;
        }

        const offset = this.getInput('OpenOffset') || { x: 0, y: 3, z: 0 };
        const speed = this.getInput('Speed') || 2;
        const target = this.isOpen ? 1 : 0;
        
        this.progress += (target - this.progress) * Math.min(1, speed * ctx.delta);
        
        // Apply position offset
        const basePos = ctx.b3obj.metadata._doorBasePos;
        if (!basePos) {
            ctx.b3obj.metadata._doorBasePos = ctx.b3obj.object.position.clone();
        }
        const base = ctx.b3obj.metadata._doorBasePos;
        if (base) {
            ctx.b3obj.object.position.set(
                base.x + offset.x * this.progress,
                base.y + offset.y * this.progress,
                base.z + offset.z * this.progress
            );
        }

        this.setOutput('IsOpen', this.isOpen);
        this.state = 'TRIGGERED';
    }

    update() {}

    static getNodeInfo(): NodeInfo {
        return { type: 'DoorToggleNode', label: 'Door Toggle', category: 'Action', color: '#457b9d', description: 'Animate a door open/close', icon: '🚪' };
    }

    toJSON() { return { ...super.toJSON(), type: 'DoorToggleNode' }; }
    static fromJSON(data: any): DoorToggleNode {
        const n = new DoorToggleNode();
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        n.restorePins(data);
        return n;
    }
}

/**
 * CutSceneNode: Records and plays back camera movements in the viewport.
 */
export class CutSceneNode extends LogicNode {
    private keyframes: any[] = [];

    constructor() {
        super();
        this.inputs = [
            execIn(this.id, 'Play'),
            execIn(this.id, 'Record'),
            execIn(this.id, 'Stop'),
            execIn(this.id, 'Clear')
        ];
        this.outputs = [
            execOut(this.id, 'Finished'),
            dataOut(this.id, 'IsRecording', 'boolean')
        ];
    }

    getTypeName() { return 'CutSceneNode'; }

    onExecute(pinId: string, ctx: ExecutionContext) {
        if (pinId.includes('Record')) {
            ctx.engine.startRecording();
        } else if (pinId.includes('Stop')) {
            if (ctx.engine.isRecording) {
                this.keyframes = ctx.engine.stopRecording();
            } else if (ctx.engine.isPlayingCutscene) {
                ctx.engine.stopCutscene();
            }
        } else if (pinId.includes('Play')) {
            ctx.engine.playCutscene(this.keyframes, () => {
                // When finished, fire the output pin
                this.state = 'TRIGGERED';
                // Trigger next node in chain if possible
                if (ctx.engine.graphExecutor) {
                     const outPin = this.outputs.find(p => p.name === 'Finished');
                     if (outPin) (ctx.engine.graphExecutor as any).followExecChain(outPin, ctx);
                }
            });
        } else if (pinId.includes('Clear')) {
            this.keyframes = [];
        }
        
        this.setOutput('IsRecording', ctx.engine.isRecording);
        this.state = 'TRIGGERED';
    }

    update(delta: number, b3obj: any, engine: any) {
        this.setOutput('IsRecording', engine.isRecording);
    }

    static getNodeInfo(): NodeInfo {
        return { 
            type: 'CutSceneNode', 
            label: 'Cut Scene', 
            category: 'Action', 
            color: '#e63946', 
            description: 'Record and play camera movements', 
            icon: '🎬' 
        };
    }

    toJSON() { 
        return { 
            ...super.toJSON(), 
            type: 'CutSceneNode',
            keyframes: this.keyframes
        }; 
    }

    static fromJSON(data: any): CutSceneNode {
        const n = new CutSceneNode();
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        n.restorePins(data);
        n.keyframes = data.keyframes || [];
        return n;
    }
}
