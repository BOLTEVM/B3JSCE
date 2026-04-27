import { LogicNode } from '../base';
import { execIn, execOut, dataIn, dataOut } from '../pins';
import type { ExecutionContext, NodeInfo } from '../graph';

/**
 * BranchNode: If/Else — routes execution based on a boolean condition.
 */
export class BranchNode extends LogicNode {
    constructor() {
        super();
        this.inputs = [
            execIn(this.id),
            dataIn(this.id, 'Condition', 'boolean', false)
        ];
        this.outputs = [
            execOut(this.id, 'True'),
            execOut(this.id, 'False')
        ];
    }

    getTypeName() { return 'BranchNode'; }

    onExecute(pinId: string, ctx: ExecutionContext) {
        const cond = this.getInput('Condition');
        // The graph executor will follow the appropriate exec output
        if (cond) {
            this.outputs.find(p => p.name === 'True')!.connectedTo.length > 0 && (this.state = 'TRIGGERED');
        } else {
            this.outputs.find(p => p.name === 'False')!.connectedTo.length > 0 && (this.state = 'TRIGGERED');
        }
    }

    update() {}

    static getNodeInfo(): NodeInfo {
        return { type: 'BranchNode', label: 'Branch', category: 'Flow', color: '#f4a261', description: 'If/Else conditional routing', icon: '🔀' };
    }

    toJSON() { return { ...super.toJSON(), type: 'BranchNode' }; }
    static fromJSON(data: any): BranchNode {
        const n = new BranchNode();
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        n.restorePins(data);
        return n;
    }
}

/**
 * SequenceNode: Execute multiple output paths in order.
 */
export class SequenceNode extends LogicNode {
    constructor(public outputCount: number = 3) {
        super();
        this.inputs = [execIn(this.id)];
        this.outputs = [];
        for (let i = 0; i < outputCount; i++) {
            this.outputs.push(execOut(this.id, `Then ${i}`));
        }
    }

    getTypeName() { return 'SequenceNode'; }
    onExecute(pinId: string, ctx: ExecutionContext) { this.state = 'TRIGGERED'; }
    update() {}

    static getNodeInfo(): NodeInfo {
        return { type: 'SequenceNode', label: 'Sequence', category: 'Flow', color: '#f4a261', description: 'Execute multiple paths in order', icon: '📋' };
    }

    toJSON() { return { ...super.toJSON(), type: 'SequenceNode', outputCount: this.outputCount }; }
    static fromJSON(data: any): SequenceNode {
        const n = new SequenceNode(data.outputCount);
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        n.restorePins(data);
        return n;
    }
}

/**
 * ForLoopNode: Iterate a fixed number of times.
 */
export class ForLoopNode extends LogicNode {
    constructor() {
        super();
        this.inputs = [
            execIn(this.id),
            dataIn(this.id, 'Count', 'number', 10)
        ];
        this.outputs = [
            execOut(this.id, 'Body'),
            dataOut(this.id, 'Index', 'number'),
            execOut(this.id, 'Done')
        ];
    }

    getTypeName() { return 'ForLoopNode'; }

    onExecute(pinId: string, ctx: ExecutionContext) {
        const count = this.getInput('Count') || 10;
        for (let i = 0; i < count; i++) {
            this.setOutput('Index', i);
            // Body exec fires each iteration (handled by graph executor's follow chain)
        }
        this.state = 'TRIGGERED';
    }

    update() {}

    static getNodeInfo(): NodeInfo {
        return { type: 'ForLoopNode', label: 'For Loop', category: 'Flow', color: '#f4a261', description: 'Iterate N times', icon: '🔁' };
    }

    toJSON() { return { ...super.toJSON(), type: 'ForLoopNode' }; }
    static fromJSON(data: any): ForLoopNode {
        const n = new ForLoopNode();
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        n.restorePins(data);
        return n;
    }
}

/**
 * DelayNode: Waits N seconds before firing the output exec.
 */
export class DelayNode extends LogicNode {
    private elapsed: number = 0;
    private active: boolean = false;

    constructor() {
        super();
        this.inputs = [
            execIn(this.id),
            dataIn(this.id, 'Seconds', 'number', 1.0)
        ];
        this.outputs = [
            execOut(this.id, 'Done')
        ];
    }

    getTypeName() { return 'DelayNode'; }

    onExecute(pinId: string, ctx: ExecutionContext) {
        if (!this.active) {
            this.active = true;
            this.elapsed = 0;
        }
        this.elapsed += ctx.delta;
        const target = this.getInput('Seconds') || 1.0;
        if (this.elapsed >= target) {
            this.active = false;
            this.elapsed = 0;
            this.state = 'TRIGGERED';
        } else {
            this.state = 'ACTIVE';
        }
    }

    update() {}

    static getNodeInfo(): NodeInfo {
        return { type: 'DelayNode', label: 'Delay', category: 'Flow', color: '#f4a261', description: 'Wait N seconds before continuing', icon: '⏳' };
    }

    toJSON() { return { ...super.toJSON(), type: 'DelayNode' }; }
    static fromJSON(data: any): DelayNode {
        const n = new DelayNode();
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        n.restorePins(data);
        return n;
    }
}

/**
 * GateNode: Only passes execution when the gate is open.
 */
export class GateNode extends LogicNode {
    constructor() {
        super();
        this.inputs = [
            execIn(this.id),
            dataIn(this.id, 'Open', 'boolean', true)
        ];
        this.outputs = [
            execOut(this.id, 'Out')
        ];
    }

    getTypeName() { return 'GateNode'; }

    onExecute(pinId: string, ctx: ExecutionContext) {
        const open = this.getInput('Open');
        this.state = open ? 'TRIGGERED' : 'NONE';
    }

    update() {}

    static getNodeInfo(): NodeInfo {
        return { type: 'GateNode', label: 'Gate', category: 'Flow', color: '#f4a261', description: 'Passthrough when open, blocks when closed', icon: '🚧' };
    }

    toJSON() { return { ...super.toJSON(), type: 'GateNode' }; }
    static fromJSON(data: any): GateNode {
        const n = new GateNode();
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        n.restorePins(data);
        return n;
    }
}
