import { nanoid } from 'nanoid';
import { IPin, pinToJSON, pinFromJSON } from './pins';
import type { ExecutionContext, IGraphNode, NodeInfo } from './graph';

// Forward-declare types to avoid circular imports at module level.
// Concrete runtime references are passed as parameters, never imported.
export type B3ObjectRef = any;
export type B3EngineRef = any;

// Logic Brick Types
export type LogicState = 'NONE' | 'ACTIVE' | 'TRIGGERED';

/**
 * Base Logic Node (V2 — Pin Graph Compatible)
 * 
 * Supports both the classic Sensor/Controller/Actuator pipeline (V1)
 * and the new typed pin graph architecture (V2). V1 nodes are wrapped
 * in a compatibility shim by the graph executor.
 */
export abstract class LogicNode implements IGraphNode {
    id: string = nanoid();
    state: LogicState = 'NONE';
    enabled: boolean = true;
    guiMetadata: { x: number, y: number } = { x: Math.random() * 200, y: Math.random() * 200 };

    // V2 Pin System
    inputs: IPin[] = [];
    outputs: IPin[] = [];

    abstract update(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef): void;
    abstract getTypeName(): string;
    dispose?(): void;

    /** V2 pin graph execution entry point. Override in pin-aware nodes. */
    onExecute(pinId: string, ctx: ExecutionContext): void {
        // Default: delegate to legacy update() for backward compat
        this.update(ctx.delta, ctx.b3obj, ctx.engine);
    }

    /** UI metadata for the node palette. Override in subclasses. */
    static getNodeInfo(): NodeInfo {
        return {
            type: 'LogicNode',
            label: 'Logic Node',
            category: 'Legacy',
            color: '#666666',
            description: 'Base logic node',
            icon: '🔧'
        };
    }

    toJSON(): any {
        return {
            id: this.id,
            enabled: this.enabled,
            guiMetadata: this.guiMetadata,
            inputs: this.inputs.map(pinToJSON),
            outputs: this.outputs.map(pinToJSON)
        };
    }

    /** Restore pins from serialized data */
    restorePins(data: any) {
        if (data.inputs) this.inputs = data.inputs.map(pinFromJSON);
        if (data.outputs) this.outputs = data.outputs.map(pinFromJSON);
    }

    /** Utility: get the current value of a named input pin */
    getInput(name: string): any {
        const pin = this.inputs.find(p => p.name === name);
        return pin?.value;
    }

    /** Utility: set the value of a named output pin */
    setOutput(name: string, value: any) {
        const pin = this.outputs.find(p => p.name === name);
        if (pin) pin.value = value;
    }
}

/**
 * Sensors detect triggers (Keyboard, Timer, etc.)
 */
export abstract class Sensor extends LogicNode {
    positive: boolean = false; // Is the sensor currently triggered?
    abstract update(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef): void;
}

/**
 * Controllers process input from sensors (AND, OR, Python)
 */
export abstract class Controller extends LogicNode {
    sensors: Sensor[] = [];
    actuators: Actuator[] = [];

    addSensor(sensor: Sensor) { this.sensors.push(sensor); }
    addActuator(actuator: Actuator) { this.actuators.push(actuator); }

    abstract execute(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef): void;
}

/**
 * Actuators execute actions (Motion, Sound, etc.)
 */
export abstract class Actuator extends LogicNode {
    abstract execute(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef): void;
    abstract update(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef): void;
}
