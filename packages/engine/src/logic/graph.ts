import { nanoid } from 'nanoid';
import { IPin, IConnection } from './pins';
import { LogicNode } from './base';

// ─── Execution Context ─────────────────────────────────────────
// Passed to every node during graph evaluation. Provides access to
// the owning object, engine, and per-object variable store.

export interface ExecutionContext {
    delta: number;
    b3obj: any;    // B3Object — typed as any to avoid circular import
    engine: any;   // B3Engine
    variables: VariableStore;
    getPinValue: (pinId: string) => any;
}

// ─── Variable Store ────────────────────────────────────────────
// Per-object state map for Get/Set Variable nodes.

export class VariableStore {
    private store: Map<string, { value: any, type: string }> = new Map();

    get(name: string): any {
        return this.store.get(name)?.value;
    }

    set(name: string, value: any, type = 'any'): void {
        this.store.set(name, { value, type });
    }

    has(name: string): boolean {
        return this.store.has(name);
    }

    getType(name: string): string {
        return this.store.get(name)?.type || 'any';
    }

    toJSON(): any {
        return Object.fromEntries(this.store);
    }

    static fromJSON(data: any): VariableStore {
        const vs = new VariableStore();
        if (data) {
            for (const [k, v] of Object.entries(data)) {
                vs.store.set(k, v as any);
            }
        }
        return vs;
    }
}

// ─── Graph Node Interface ──────────────────────────────────────
// V2 nodes implement this interface instead of (or in addition to) the
// classic Sensor/Controller/Actuator pattern.

export interface IGraphNode {
    id: string;
    inputs: IPin[];
    outputs: IPin[];
    onExecute(pinId: string, ctx: ExecutionContext): void;
    getTypeName(): string;
}

// ─── Node Metadata ─────────────────────────────────────────────
// Used by the UI node palette and search system.

export interface NodeInfo {
    type: string;
    label: string;
    category: 'Event' | 'Flow' | 'Data' | 'Action' | 'Script' | 'Legacy' | 'Economics' | 'Web3';
    color: string;
    description: string;
    icon: string;  // Emoji
}

// ─── Graph Executor ────────────────────────────────────────────
// Evaluates a pin-based node graph each tick. Handles:
// 1. Event node triggering (entry points)
// 2. Data pin propagation (pull-based: resolve inputs before execution)
// 3. Exec pin flow (push-based: follow outgoing exec connections)

export class GraphExecutor {
    private nodes: Map<string, IGraphNode> = new Map();
    private pins: Map<string, IPin> = new Map();
    private connections: IConnection[] = [];

    constructor(
        public variables: VariableStore = new VariableStore()
    ) {}

    /** Register a node in the graph */
    addNode(node: IGraphNode) {
        this.nodes.set(node.id, node);
        node.inputs.forEach(p => this.pins.set(p.id, p));
        node.outputs.forEach(p => this.pins.set(p.id, p));
    }

    removeNode(nodeId: string) {
        const node = this.nodes.get(nodeId);
        if (!node) return;
        // Remove all connections involving this node's pins
        const pinIds = new Set([...node.inputs, ...node.outputs].map(p => p.id));
        this.connections = this.connections.filter(c =>
            !pinIds.has(c.fromPinId) && !pinIds.has(c.toPinId)
        );
        node.inputs.forEach(p => this.pins.delete(p.id));
        node.outputs.forEach(p => this.pins.delete(p.id));
        this.nodes.delete(nodeId);
    }

    /** Create a wire between two pins */
    connect(fromPinId: string, toPinId: string): IConnection | null {
        const from = this.pins.get(fromPinId);
        const to = this.pins.get(toPinId);
        if (!from || !to) return null;
        if (from.direction !== 'output' || to.direction !== 'input') return null;

        const conn: IConnection = { id: nanoid(), fromPinId, toPinId };
        this.connections.push(conn);
        from.connectedTo.push(toPinId);
        to.connectedTo.push(fromPinId);
        return conn;
    }

    disconnect(connectionId: string) {
        const idx = this.connections.findIndex(c => c.id === connectionId);
        if (idx === -1) return;
        const conn = this.connections[idx];
        const from = this.pins.get(conn.fromPinId);
        const to = this.pins.get(conn.toPinId);
        if (from) from.connectedTo = from.connectedTo.filter(id => id !== conn.toPinId);
        if (to) to.connectedTo = to.connectedTo.filter(id => id !== conn.fromPinId);
        this.connections.splice(idx, 1);
    }

    /** Resolve the current value of a data input pin by tracing its connection */
    private resolveDataPin(pinId: string): any {
        const pin = this.pins.get(pinId);
        if (!pin) return undefined;

        // If this is an output pin, return its value directly
        if (pin.direction === 'output') return pin.value;

        // If this is an input pin with no connection, return its default
        if (pin.connectedTo.length === 0) return pin.value;

        // Trace the connection to the output pin it's wired from
        const sourcePinId = pin.connectedTo[0];
        const sourcePin = this.pins.get(sourcePinId);
        return sourcePin?.value ?? pin.value;
    }

    /** Execute a single tick of the graph */
    tick(delta: number, b3obj: any, engine: any) {
        const ctx: ExecutionContext = {
            delta,
            b3obj,
            engine,
            variables: this.variables,
            getPinValue: (pinId: string) => this.resolveDataPin(pinId)
        };

        // 1. Find all Event nodes (nodes with no exec input pins) — they are entry points
        for (const [, node] of this.nodes) {
            const hasExecInput = node.inputs.some(p => p.dataType === 'exec');
            if (!hasExecInput) {
                // This is an event/root node — fire it
                const firstExecOut = node.outputs.find(p => p.dataType === 'exec');
                if (firstExecOut) {
                    node.onExecute('__event__', ctx);
                    // Follow outgoing exec connections
                    this.followExecChain(firstExecOut, ctx);
                }
            }
        }
    }

    /** Follow an exec output pin to all connected exec input pins and execute their nodes */
    private followExecChain(execOutPin: IPin, ctx: ExecutionContext) {
        for (const targetPinId of execOutPin.connectedTo) {
            const targetPin = this.pins.get(targetPinId);
            if (!targetPin || targetPin.dataType !== 'exec') continue;

            const targetNode = this.nodes.get(targetPin.nodeId);
            if (!targetNode) continue;

            // Resolve all data inputs for this node before executing
            for (const input of targetNode.inputs) {
                if (input.dataType !== 'exec') {
                    input.value = this.resolveDataPin(input.id);
                }
            }

            // Execute the node
            targetNode.onExecute(targetPin.id, ctx);

            // Follow any outgoing exec pins from this node
            for (const output of targetNode.outputs) {
                if (output.dataType === 'exec' && output.connectedTo.length > 0) {
                    this.followExecChain(output, ctx);
                }
            }
        }
    }

    // ─── Serialization ─────────────────────────────────────────

    toJSON(): any {
        return {
            connections: this.connections.map(c => ({ ...c })),
            variables: this.variables.toJSON()
        };
    }

    loadConnections(connections: IConnection[]) {
        this.connections = connections;
        // Rebuild pin connection arrays
        for (const conn of connections) {
            const from = this.pins.get(conn.fromPinId);
            const to = this.pins.get(conn.toPinId);
            if (from && !from.connectedTo.includes(conn.toPinId)) from.connectedTo.push(conn.toPinId);
            if (to && !to.connectedTo.includes(conn.fromPinId)) to.connectedTo.push(conn.fromPinId);
        }
    }
}
