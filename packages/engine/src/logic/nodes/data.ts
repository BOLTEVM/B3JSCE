import { LogicNode } from '../base';
import { execIn, execOut, dataIn, dataOut } from '../pins';
import type { ExecutionContext, NodeInfo } from '../graph';

/**
 * GetVariableNode: Read from the object's variable store.
 */
export class GetVariableNode extends LogicNode {
    constructor(public varName: string = 'myVar') {
        super();
        this.outputs = [
            dataOut(this.id, 'Value', 'any')
        ];
    }

    getTypeName() { return 'GetVariableNode'; }

    onExecute(pinId: string, ctx: ExecutionContext) {
        this.setOutput('Value', ctx.variables.get(this.varName));
    }

    update() {}

    static getNodeInfo(): NodeInfo {
        return { type: 'GetVariableNode', label: 'Get Variable', category: 'Data', color: '#2a9d8f', description: 'Read a named variable', icon: '📖' };
    }

    toJSON() { return { ...super.toJSON(), type: 'GetVariableNode', varName: this.varName }; }
    static fromJSON(data: any): GetVariableNode {
        const n = new GetVariableNode(data.varName);
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        n.restorePins(data);
        return n;
    }
}

/**
 * SetVariableNode: Write to the object's variable store.
 */
export class SetVariableNode extends LogicNode {
    constructor(public varName: string = 'myVar') {
        super();
        this.inputs = [
            execIn(this.id),
            dataIn(this.id, 'Value', 'any')
        ];
        this.outputs = [
            execOut(this.id, 'Out')
        ];
    }

    getTypeName() { return 'SetVariableNode'; }

    onExecute(pinId: string, ctx: ExecutionContext) {
        ctx.variables.set(this.varName, this.getInput('Value'));
        this.state = 'TRIGGERED';
    }

    update() {}

    static getNodeInfo(): NodeInfo {
        return { type: 'SetVariableNode', label: 'Set Variable', category: 'Data', color: '#2a9d8f', description: 'Write a named variable', icon: '✏️' };
    }

    toJSON() { return { ...super.toJSON(), type: 'SetVariableNode', varName: this.varName }; }
    static fromJSON(data: any): SetVariableNode {
        const n = new SetVariableNode(data.varName);
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        n.restorePins(data);
        return n;
    }
}

/**
 * MathOpNode: Arithmetic operations.
 */
export type MathOperation = 'Add' | 'Subtract' | 'Multiply' | 'Divide' | 'Clamp' | 'Lerp' | 'Abs' | 'Min' | 'Max';

export class MathOpNode extends LogicNode {
    constructor(public operation: MathOperation = 'Add') {
        super();
        this.inputs = [
            dataIn(this.id, 'A', 'number', 0),
            dataIn(this.id, 'B', 'number', 0)
        ];
        this.outputs = [
            dataOut(this.id, 'Result', 'number')
        ];
    }

    getTypeName() { return 'MathOpNode'; }

    onExecute(pinId: string, ctx: ExecutionContext) {
        const a = this.getInput('A') || 0;
        const b = this.getInput('B') || 0;
        let result = 0;
        switch (this.operation) {
            case 'Add':      result = a + b; break;
            case 'Subtract': result = a - b; break;
            case 'Multiply': result = a * b; break;
            case 'Divide':   result = b !== 0 ? a / b : 0; break;
            case 'Clamp':    result = Math.max(0, Math.min(a, b)); break;
            case 'Lerp':     result = a + (b - a) * 0.5; break;
            case 'Abs':      result = Math.abs(a); break;
            case 'Min':      result = Math.min(a, b); break;
            case 'Max':      result = Math.max(a, b); break;
        }
        this.setOutput('Result', result);
    }

    update() {}

    static getNodeInfo(): NodeInfo {
        return { type: 'MathOpNode', label: 'Math', category: 'Data', color: '#2a9d8f', description: 'Arithmetic operations (Add, Sub, Mul, etc.)', icon: '🔢' };
    }

    toJSON() { return { ...super.toJSON(), type: 'MathOpNode', operation: this.operation }; }
    static fromJSON(data: any): MathOpNode {
        const n = new MathOpNode(data.operation);
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        n.restorePins(data);
        return n;
    }
}

/**
 * CompareNode: Comparison operations.
 */
export type CompareOp = '==' | '!=' | '<' | '>' | '<=' | '>=';

export class CompareNode extends LogicNode {
    constructor(public op: CompareOp = '==') {
        super();
        this.inputs = [
            dataIn(this.id, 'A', 'number', 0),
            dataIn(this.id, 'B', 'number', 0)
        ];
        this.outputs = [
            dataOut(this.id, 'Result', 'boolean')
        ];
    }

    getTypeName() { return 'CompareNode'; }

    onExecute(pinId: string, ctx: ExecutionContext) {
        const a = this.getInput('A') || 0;
        const b = this.getInput('B') || 0;
        let result = false;
        switch (this.op) {
            case '==': result = a === b; break;
            case '!=': result = a !== b; break;
            case '<':  result = a < b; break;
            case '>':  result = a > b; break;
            case '<=': result = a <= b; break;
            case '>=': result = a >= b; break;
        }
        this.setOutput('Result', result);
    }

    update() {}

    static getNodeInfo(): NodeInfo {
        return { type: 'CompareNode', label: 'Compare', category: 'Data', color: '#2a9d8f', description: 'Comparison (==, <, >, etc.)', icon: '⚖️' };
    }

    toJSON() { return { ...super.toJSON(), type: 'CompareNode', op: this.op }; }
    static fromJSON(data: any): CompareNode {
        const n = new CompareNode(data.op);
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        n.restorePins(data);
        return n;
    }
}

/**
 * BoolLogicNode: Boolean algebra.
 */
export type BoolOp = 'AND' | 'OR' | 'NOT' | 'XOR';

export class BoolLogicNode extends LogicNode {
    constructor(public op: BoolOp = 'AND') {
        super();
        this.inputs = [
            dataIn(this.id, 'A', 'boolean', false),
            dataIn(this.id, 'B', 'boolean', false)
        ];
        this.outputs = [
            dataOut(this.id, 'Result', 'boolean')
        ];
    }

    getTypeName() { return 'BoolLogicNode'; }

    onExecute(pinId: string, ctx: ExecutionContext) {
        const a = !!this.getInput('A');
        const b = !!this.getInput('B');
        let result = false;
        switch (this.op) {
            case 'AND': result = a && b; break;
            case 'OR':  result = a || b; break;
            case 'NOT': result = !a; break;
            case 'XOR': result = a !== b; break;
        }
        this.setOutput('Result', result);
    }

    update() {}

    static getNodeInfo(): NodeInfo {
        return { type: 'BoolLogicNode', label: 'Bool Logic', category: 'Data', color: '#2a9d8f', description: 'Boolean algebra (AND, OR, NOT, XOR)', icon: '🔲' };
    }

    toJSON() { return { ...super.toJSON(), type: 'BoolLogicNode', op: this.op }; }
    static fromJSON(data: any): BoolLogicNode {
        const n = new BoolLogicNode(data.op);
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        n.restorePins(data);
        return n;
    }
}

/**
 * GetPropertyNode: Read position, health, speed, etc. from the owning B3Object.
 */
export type PropertyName = 'position' | 'rotation' | 'scale' | 'health' | 'speed' | 'name' | 'type';

export class GetPropertyNode extends LogicNode {
    constructor(public property: PropertyName = 'position') {
        super();
        const outType = ['position', 'rotation', 'scale'].includes(this.property) ? 'vector3' : 
                         ['health', 'speed'].includes(this.property) ? 'number' : 'string';
        this.outputs = [
            dataOut(this.id, 'Value', outType as any)
        ];
    }

    getTypeName() { return 'GetPropertyNode'; }

    onExecute(pinId: string, ctx: ExecutionContext) {
        switch (this.property) {
            case 'position': this.setOutput('Value', ctx.b3obj.object.position.clone()); break;
            case 'rotation': this.setOutput('Value', ctx.b3obj.object.rotation.clone()); break;
            case 'scale':    this.setOutput('Value', ctx.b3obj.object.scale.clone()); break;
            case 'health':   this.setOutput('Value', ctx.b3obj.health); break;
            case 'speed':    this.setOutput('Value', ctx.b3obj.speed); break;
            case 'name':     this.setOutput('Value', ctx.b3obj.name); break;
            case 'type':     this.setOutput('Value', ctx.b3obj.type); break;
        }
    }

    update() {}

    static getNodeInfo(): NodeInfo {
        return { type: 'GetPropertyNode', label: 'Get Property', category: 'Data', color: '#2a9d8f', description: 'Read object properties', icon: '📊' };
    }

    toJSON() { return { ...super.toJSON(), type: 'GetPropertyNode', property: this.property }; }
    static fromJSON(data: any): GetPropertyNode {
        const n = new GetPropertyNode(data.property);
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        n.restorePins(data);
        return n;
    }
}

/**
 * SetPropertyNode: Write position, health, speed, etc.
 */
export class SetPropertyNode extends LogicNode {
    constructor(public property: PropertyName = 'position') {
        super();
        const inType = ['position', 'rotation', 'scale'].includes(this.property) ? 'vector3' : 
                        ['health', 'speed'].includes(this.property) ? 'number' : 'string';
        this.inputs = [
            execIn(this.id),
            dataIn(this.id, 'Value', inType as any)
        ];
        this.outputs = [
            execOut(this.id, 'Out')
        ];
    }

    getTypeName() { return 'SetPropertyNode'; }

    onExecute(pinId: string, ctx: ExecutionContext) {
        const val = this.getInput('Value');
        if (val === undefined) return;
        switch (this.property) {
            case 'position': ctx.b3obj.object.position.copy(val); break;
            case 'rotation': ctx.b3obj.object.rotation.copy(val); break;
            case 'scale':    ctx.b3obj.object.scale.copy(val); break;
            case 'health':   ctx.b3obj.health = val; break;
            case 'speed':    ctx.b3obj.speed = val; break;
        }
        this.state = 'TRIGGERED';
    }

    update() {}

    static getNodeInfo(): NodeInfo {
        return { type: 'SetPropertyNode', label: 'Set Property', category: 'Data', color: '#2a9d8f', description: 'Write object properties', icon: '📝' };
    }

    toJSON() { return { ...super.toJSON(), type: 'SetPropertyNode', property: this.property }; }
    static fromJSON(data: any): SetPropertyNode {
        const n = new SetPropertyNode(data.property);
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        n.restorePins(data);
        return n;
    }
}
