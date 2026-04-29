import * as THREE from 'three';
import { Actuator, NodeInfo } from './base';
import { execIn, execOut, dataIn, dataOut } from './pins';
import type { ExecutionContext } from './graph';

/**
 * ElevatorActuator: Handles vertical movement, floor targets, and arrival events.
 */
export class ElevatorActuator extends Actuator {
    private isMoving: boolean = false;
    private atFloorOne: boolean = true;
    private currentHeight: number = 0;
    private targetHeight: number = 0;
    private speed: number = 2.0;

    constructor(nodeId?: string) {
        super();
        if (nodeId) this.id = nodeId;
        this.inputs = [
            execIn(this.id, 'Move'),
            dataIn(this.id, 'FloorOneY', 'number', 0),
            dataIn(this.id, 'FloorTwoY', 'number', 10),
            dataIn(this.id, 'Speed', 'number', 2.0)
        ];
        this.outputs = [
            execOut(this.id, 'OnArrived'),
            execOut(this.id, 'OnStart'),
            dataOut(this.id, 'CurrentHeight', 'number'),
            dataOut(this.id, 'AtFloorOne', 'boolean')
        ];
    }

    getTypeName(): string { return 'ElevatorActuator'; }

    static getNodeInfo(): NodeInfo {
        return {
            type: 'ElevatorActuator',
            label: 'Elevator Controller',
            category: 'Action',
            color: '#3b82f6',
            description: 'Handles smooth vertical movement between two floors.',
            icon: '↕️'
        };
    }

    async onExecute(pinId: string, ctx: any): Promise<void> {
        if (pinId === this.inputs[0].id) { // Move
            if (this.isMoving) return;
            
            this.atFloorOne = !this.atFloorOne;
            this.targetHeight = this.atFloorOne ? this.getInput('FloorOneY') : this.getInput('FloorTwoY');
            this.speed = this.getInput('Speed');
            this.isMoving = true;
            
            this.trigger('OnStart', ctx);
        }
    }

    private initialized: boolean = false;

    update(delta: number, b3obj: any, engine: any) {
        if (!b3obj || !b3obj.object) return;

        // Auto-initialize height from object's current position if not set
        if (!this.initialized) {
            this.currentHeight = b3obj.object.position.y;
            this.initialized = true;
        }

        if (!this.isMoving) return;

        const floor1 = this.getInput('FloorOneY') ?? 0;
        const floor2 = this.getInput('FloorTwoY') ?? 10;
        const target = this.atFloorOne ? floor1 : floor2;
        this.targetHeight = target;

        const movement = (this.getInput('Speed') ?? 2.0) * delta;
        const distToTarget = Math.abs(this.targetHeight - this.currentHeight);

        let step = movement;
        if (distToTarget < 1.0) {
            step = Math.min(movement, distToTarget * 0.5 + 0.01);
        }

        if (this.currentHeight < this.targetHeight) {
            this.currentHeight = Math.min(this.currentHeight + step, this.targetHeight);
        } else {
            this.currentHeight = Math.max(this.currentHeight - step, this.targetHeight);
        }

        // Final NaN Guard
        if (isNaN(this.currentHeight)) this.currentHeight = b3obj.object.position.y || 0;

        this.setOutput('CurrentHeight', this.currentHeight);
        this.setOutput('AtFloorOne', this.atFloorOne);

        // Apply to physical object
        b3obj.object.position.y = this.currentHeight;
        if (b3obj.body) {
            b3obj.body.position.y = this.currentHeight;
            b3obj.body.velocity.set(0, 0, 0);
        }

        if (engine && engine.spacetime && !b3obj.isRemote) {
            engine.spacetime.pushUpdate(b3obj);
        }

        if (Math.abs(this.currentHeight - this.targetHeight) < 0.001) {
            this.isMoving = false;
        }
    }

    private trigger(name: string, ctx: any) {
        const out = this.outputs.find(o => o.name === name);
        if (out) ctx.executor.executePin(out.id, ctx);
    }

    execute() {}

    toJSON() { 
        return { 
            ...super.toJSON(), 
            type: 'ElevatorActuator',
            isMoving: this.isMoving,
            atFloorOne: this.atFloorOne,
            currentHeight: this.currentHeight
        }; 
    }
    
    static fromJSON(data: any): ElevatorActuator {
        const n = new ElevatorActuator(data.id);
        n.restorePins(data);
        n.isMoving = data.isMoving;
        n.atFloorOne = data.atFloorOne;
        n.currentHeight = data.currentHeight || 0;
        return n;
    }
}

/**
 * GateActuator: Toggles gate animations and colliders.
 */
export class GateActuator extends Actuator {
    constructor(nodeId?: string) {
        super();
        if (nodeId) this.id = nodeId;
        this.inputs = [
            execIn(this.id, 'Open'),
            execIn(this.id, 'Close'),
            dataIn(this.id, 'OpenAnim', 'string', 'GateOpen'),
            dataIn(this.id, 'CloseAnim', 'string', 'GateClose')
        ];
        this.outputs = [
            execOut(this.id, 'OnOpened'),
            execOut(this.id, 'OnClosed')
        ];
    }

    getTypeName(): string { return 'GateActuator'; }

    static getNodeInfo(): NodeInfo {
        return {
            type: 'GateActuator',
            label: 'Gate/Door Controller',
            category: 'Action',
            color: '#8b5cf6',
            description: 'Controls animated gates and their collision state.',
            icon: '🚪'
        };
    }

    async onExecute(pinId: string, ctx: any): Promise<void> {
        const obj = ctx.engine.getObjectById(ctx.entityId);
        if (!obj) return;

        if (pinId === this.inputs[0].id) { // Open
            obj.playAnimation(this.getInput('OpenAnim'), false);
            if (obj.body) obj.body.collisionFilterMask = 0; // Disable collision
            this.trigger('OnOpened', ctx);
        } else if (pinId === this.inputs[1].id) { // Close
            obj.playAnimation(this.getInput('CloseAnim'), false);
            if (obj.body) obj.body.collisionFilterMask = -1; // Enable collision
            this.trigger('OnClosed', ctx);
        }
    }

    private trigger(name: string, ctx: any) {
        const out = this.outputs.find(o => o.name === name);
        if (out) ctx.executor.executePin(out.id, ctx);
    }

    update(delta: number, b3obj: any, engine: any) {}
    execute() {}

    toJSON() { return { ...super.toJSON(), type: 'GateActuator' }; }
    static fromJSON(data: any): GateActuator {
        const n = new GateActuator(data.id);
        n.restorePins(data);
        return n;
    }
}

/**
 * PulseActuator: Handles emissive pulsing logic.
 */
export class PulseActuator extends Actuator {
    private pulseTime: number = 0;

    constructor(nodeId?: string) {
        super();
        if (nodeId) this.id = nodeId;
        this.inputs = [
            dataIn(this.id, 'Color', 'string', '#00aaff'),
            dataIn(this.id, 'MinIntensity', 'number', 0.5),
            dataIn(this.id, 'MaxIntensity', 'number', 1.5),
            dataIn(this.id, 'Speed', 'number', 2.0),
            dataIn(this.id, 'MeshName', 'string', ''),
            dataIn(this.id, 'Metalness', 'number', 0.8),
            dataIn(this.id, 'Roughness', 'number', 0.2),
            dataIn(this.id, 'Enabled', 'boolean', true)
        ];
    }

    getTypeName(): string { return 'PulseActuator'; }

    static getNodeInfo(): NodeInfo {
        return {
            type: 'PulseActuator',
            label: 'Emissive Pulse',
            category: 'Action',
            color: '#f43f5e',
            description: 'Creates a pulsing emissive effect on a mesh.',
            icon: '✨'
        };
    }

    update(delta: number, b3obj: any, engine: any) {
        if (!this.getInput('Enabled')) return;
        if (!b3obj || !b3obj.object) return;

        const color = new THREE.Color(this.getInput('Color'));
        const min = this.getInput('MinIntensity');
        const max = this.getInput('MaxIntensity');
        const speed = this.getInput('Speed');
        const targetMesh = this.getInput('MeshName'); // Optional filter
        const metalness = this.getInput('Metalness');
        const roughness = this.getInput('Roughness');

        this.pulseTime += delta * speed;
        const t = (Math.sin(this.pulseTime) + 1) / 2;
        const intensity = min + (max - min) * t;

        b3obj.object.traverse((child: any) => {
            if (child.isMesh) {
                // Filter by name if specified
                if (targetMesh && !child.name.includes(targetMesh)) return;

                const applyPulse = (m: any) => {
                    // Critical: Clone material if shared to avoid "Global Glow"
                    if (!m._b3PulseCloned) {
                        const newMat = m.clone();
                        newMat._b3PulseCloned = true;
                        return newMat;
                    }
                    return m;
                };

                const updateMaterial = (m: any) => {
                    m.emissive = color;
                    m.emissiveIntensity = intensity;
                    if (metalness !== undefined && m.metalness !== undefined) m.metalness = metalness;
                    if (roughness !== undefined && m.roughness !== undefined) m.roughness = roughness;
                    if (m.envMapIntensity !== undefined) m.envMapIntensity = 1.5; // Boost reflections
                };

                if (Array.isArray(child.material)) {
                    child.material = child.material.map((m: any) => {
                        const pulseMat = applyPulse(m);
                        updateMaterial(pulseMat);
                        return pulseMat;
                    });
                } else if (child.material) {
                    child.material = applyPulse(child.material);
                    updateMaterial(child.material);
                }
            }
        });
    }

    execute() {}

    toJSON() { return { ...super.toJSON(), type: 'PulseActuator' }; }
    static fromJSON(data: any): PulseActuator {
        const n = new PulseActuator(data.id);
        n.restorePins(data);
        return n;
    }
}
