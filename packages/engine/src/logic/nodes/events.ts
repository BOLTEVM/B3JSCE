import { LogicNode } from '../base';
import { execOut, dataOut, IPin } from '../pins';
import type { ExecutionContext, NodeInfo } from '../graph';

/**
 * OnStartNode: Fires once when simulation begins.
 */
export class OnStartNode extends LogicNode {
    private fired = false;

    constructor() {
        super();
        this.outputs = [
            execOut(this.id, 'Start')
        ];
    }

    getTypeName() { return 'OnStartNode'; }

    onExecute(pinId: string, ctx: ExecutionContext) {
        if (!this.fired) {
            this.fired = true;
            this.state = 'TRIGGERED';
        }
    }

    update() {}

    static getNodeInfo(): NodeInfo {
        return { type: 'OnStartNode', label: 'On Start', category: 'Event', color: '#e63946', description: 'Fires once when simulation begins', icon: '▶️' };
    }

    toJSON() { return { ...super.toJSON(), type: 'OnStartNode' }; }
    static fromJSON(data: any): OnStartNode {
        const n = new OnStartNode();
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        n.restorePins(data);
        return n;
    }
}

/**
 * OnTickNode: Fires every frame. Outputs delta time.
 */
export class OnTickNode extends LogicNode {
    constructor() {
        super();
        this.outputs = [
            execOut(this.id, 'Tick'),
            dataOut(this.id, 'Delta', 'number')
        ];
    }

    getTypeName() { return 'OnTickNode'; }

    onExecute(pinId: string, ctx: ExecutionContext) {
        this.setOutput('Delta', ctx.delta);
    }

    update() {}

    static getNodeInfo(): NodeInfo {
        return { type: 'OnTickNode', label: 'On Tick', category: 'Event', color: '#e63946', description: 'Fires every frame with delta time', icon: '🔄' };
    }

    toJSON() { return { ...super.toJSON(), type: 'OnTickNode' }; }
    static fromJSON(data: any): OnTickNode {
        const n = new OnTickNode();
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        n.restorePins(data);
        return n;
    }
}

/**
 * OnKeyNode: Fires when a specific key is pressed.
 */
export class OnKeyNode extends LogicNode {
    private keys: Set<string> = new Set();
    private onKeyDown = (e: KeyboardEvent) => { if (e.code === this.targetKey) this.keys.add(e.code); };
    private onKeyUp = (e: KeyboardEvent) => { if (e.code === this.targetKey) this.keys.delete(e.code); };

    constructor(public targetKey: string = 'KeyW') {
        super();
        this.outputs = [
            execOut(this.id, 'Pressed'),
            dataOut(this.id, 'Key', 'string'),
            dataOut(this.id, 'IsHeld', 'boolean')
        ];
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);
    }

    getTypeName() { return 'OnKeyNode'; }

    onExecute(pinId: string, ctx: ExecutionContext) {
        const held = this.keys.has(this.targetKey);
        this.setOutput('Key', this.targetKey);
        this.setOutput('IsHeld', held);
        // Only propagate exec if key is held
        if (!held) this.state = 'NONE';
        else this.state = 'TRIGGERED';
    }

    update() {}

    dispose() {
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
    }

    static getNodeInfo(): NodeInfo {
        return { type: 'OnKeyNode', label: 'On Key', category: 'Event', color: '#e63946', description: 'Fires when a keyboard key is pressed', icon: '⌨️' };
    }

    toJSON() { return { ...super.toJSON(), type: 'OnKeyNode', targetKey: this.targetKey }; }
    static fromJSON(data: any): OnKeyNode {
        const n = new OnKeyNode(data.targetKey);
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        n.restorePins(data);
        return n;
    }
}

/**
 * OnCollisionNode: Fires when the object collides with another.
 */
export class OnCollisionNode extends LogicNode {
    constructor(public filterType: string = '') {
        super();
        this.outputs = [
            execOut(this.id, 'Hit'),
            dataOut(this.id, 'Other', 'object'),
            dataOut(this.id, 'Distance', 'number')
        ];
    }

    getTypeName() { return 'OnCollisionNode'; }

    onExecute(pinId: string, ctx: ExecutionContext) {
        for (const other of ctx.engine.objects) {
            if (other === ctx.b3obj) continue;
            const dist = ctx.b3obj.object.position.distanceTo(other.object.position);
            if (dist < 1.5) {
                if (!this.filterType || other.type === this.filterType) {
                    this.setOutput('Other', other);
                    this.setOutput('Distance', dist);
                    this.state = 'TRIGGERED';
                    return;
                }
            }
        }
        this.state = 'NONE';
    }

    update() {}

    static getNodeInfo(): NodeInfo {
        return { type: 'OnCollisionNode', label: 'On Collision', category: 'Event', color: '#e63946', description: 'Fires when touching another object', icon: '💥' };
    }

    toJSON() { return { ...super.toJSON(), type: 'OnCollisionNode', filterType: this.filterType }; }
    static fromJSON(data: any): OnCollisionNode {
        const n = new OnCollisionNode(data.filterType);
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        n.restorePins(data);
        return n;
    }
}

/**
 * OnTimerNode: Fires at a configurable interval.
 */
export class OnTimerNode extends LogicNode {
    private elapsed: number = 0;

    constructor(public interval: number = 1.0) {
        super();
        this.outputs = [
            execOut(this.id, 'Timer'),
            dataOut(this.id, 'Count', 'number')
        ];
    }

    private count: number = 0;
    getTypeName() { return 'OnTimerNode'; }

    onExecute(pinId: string, ctx: ExecutionContext) {
        this.elapsed += ctx.delta;
        if (this.elapsed >= this.interval) {
            this.elapsed -= this.interval;
            this.count++;
            this.setOutput('Count', this.count);
            this.state = 'TRIGGERED';
        } else {
            this.state = 'NONE';
        }
    }

    update() {}

    static getNodeInfo(): NodeInfo {
        return { type: 'OnTimerNode', label: 'On Timer', category: 'Event', color: '#e63946', description: 'Fires at a fixed interval', icon: '⏱️' };
    }

    toJSON() { return { ...super.toJSON(), type: 'OnTimerNode', interval: this.interval }; }
    static fromJSON(data: any): OnTimerNode {
        const n = new OnTimerNode(data.interval);
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        n.restorePins(data);
        return n;
    }
}

/**
 * OnInteractNode: Fires when the player is within range and presses a key.
 */
export class OnInteractNode extends LogicNode {
    private interactPressed = false;
    private handler = (e: KeyboardEvent) => { if (e.code === this.interactKey) this.interactPressed = true; };
    private releaseHandler = (e: KeyboardEvent) => { if (e.code === this.interactKey) this.interactPressed = false; };

    constructor(public interactKey: string = 'KeyE', public range: number = 3) {
        super();
        this.outputs = [
            execOut(this.id, 'Interact'),
            dataOut(this.id, 'Actor', 'object')
        ];
        window.addEventListener('keydown', this.handler);
        window.addEventListener('keyup', this.releaseHandler);
    }

    getTypeName() { return 'OnInteractNode'; }

    onExecute(pinId: string, ctx: ExecutionContext) {
        if (!this.interactPressed) { this.state = 'NONE'; return; }
        // Find nearest actor within range
        for (const other of ctx.engine.objects) {
            if (other === ctx.b3obj || !other.isActor) continue;
            const dist = ctx.b3obj.object.position.distanceTo(other.object.position);
            if (dist < this.range) {
                this.setOutput('Actor', other);
                this.state = 'TRIGGERED';
                return;
            }
        }
        this.state = 'NONE';
    }

    update() {}
    dispose() {
        window.removeEventListener('keydown', this.handler);
        window.removeEventListener('keyup', this.releaseHandler);
    }

    static getNodeInfo(): NodeInfo {
        return { type: 'OnInteractNode', label: 'On Interact', category: 'Event', color: '#e63946', description: 'Fires when player presses interact key within range', icon: '🤝' };
    }

    toJSON() { return { ...super.toJSON(), type: 'OnInteractNode', interactKey: this.interactKey, range: this.range }; }
    static fromJSON(data: any): OnInteractNode {
        const n = new OnInteractNode(data.interactKey, data.range);
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        n.restorePins(data);
        return n;
    }
}
