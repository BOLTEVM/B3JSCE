import { Sensor, Actuator, NodeInfo, B3ObjectRef, B3EngineRef } from './base';
import { execOut, dataOut, execIn, dataIn } from './pins';

/**
 * HandGestureSensor: Detects XR hand gestures (Pinch, Grab, Open Palm).
 * Bridges XR controller/hand state to the logic graph.
 */
export class HandGestureSensor extends Sensor {
    private lastGesture: string = 'NONE';

    constructor(nodeId?: string) {
        super();
        if (nodeId) this.id = nodeId;
        this.inputs = [
            dataIn(this.id, 'TargetHand', 'string', 'right') // 'left', 'right', 'both'
        ];
        this.outputs = [
            execOut(this.id, 'OnPinchStart'),
            execOut(this.id, 'OnPinchEnd'),
            execOut(this.id, 'OnGrabStart'),
            dataOut(this.id, 'Gesture', 'string')
        ];
    }

    getTypeName(): string { return 'HandGestureSensor'; }

    static getNodeInfo(): NodeInfo {
        return {
            type: 'HandGestureSensor',
            label: 'Hand Gesture',
            category: 'Web3',
            color: '#f59e0b',
            description: 'Detects XR hand tracking gestures like Pinch or Grab.',
            icon: '🖐️'
        };
    }

    update(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef) {
        // In XR mode, we would query the WebXR Hand objects.
        // For simulation, we check if the user is clicking while in a "Hand Mode".
        const currentGesture = (engine as any).xr?.getCurrentGesture(this.getInput('TargetHand')) || 'NONE';
        
        if (currentGesture !== this.lastGesture) {
            if (currentGesture === 'PINCH' && this.lastGesture !== 'PINCH') {
                this.trigger('OnPinchStart', { engine, b3obj, executor: (engine as any).logic.executor });
            } else if (currentGesture !== 'PINCH' && this.lastGesture === 'PINCH') {
                this.trigger('OnPinchEnd', { engine, b3obj, executor: (engine as any).logic.executor });
            } else if (currentGesture === 'GRAB' && this.lastGesture !== 'GRAB') {
                this.trigger('OnGrabStart', { engine, b3obj, executor: (engine as any).logic.executor });
            }
            this.lastGesture = currentGesture;
            this.setOutput('Gesture', currentGesture);
        }
    }

    private trigger(name: string, ctx: any) {
        const out = this.outputs.find(o => o.name === name);
        if (out && ctx.executor) {
            ctx.executor.executePin(out.id, ctx);
        }
    }

    toJSON() { return { ...super.toJSON(), type: 'HandGestureSensor' }; }
    static fromJSON(data: any): HandGestureSensor {
        const n = new HandGestureSensor(data.id);
        n.restorePins(data);
        n.guiMetadata = data.guiMetadata;
        return n;
    }
}

/**
 * BalanceDisplayActuator: Updates floating 3D text with wallet balance.
 */
export class BalanceDisplayActuator extends Actuator {
    constructor(nodeId?: string) {
        super();
        if (nodeId) this.id = nodeId;
        this.inputs = [
            execIn(this.id, 'Update'),
            dataIn(this.id, 'Address', 'string', '0x...'),
            dataIn(this.id, 'Asset', 'string', 'ETH')
        ];
        this.outputs = [
            execOut(this.id, 'OnUpdated'),
            dataOut(this.id, 'Balance', 'string')
        ];
    }

    getTypeName(): string { return 'BalanceDisplayActuator'; }

    static getNodeInfo(): NodeInfo {
        return {
            type: 'BalanceDisplayActuator',
            label: 'Balance Display',
            category: 'Web3',
            color: '#6366f1',
            description: 'Updates 3D text labels with live wallet balances.',
            icon: '💰'
        };
    }

    onExecute(pinId: string, ctx: any): void {
        if (pinId === this.inputs[0].id) {
            const address = this.getInput('Address');
            const asset = this.getInput('Asset');
            
            // Mock balance fetch (would use engine.web3.vault or provider)
            const balance = "1.234"; 
            
            this.setOutput('Balance', balance);
            
            // If the object has a "Text" component, update it
            if (ctx.b3obj.components.text) {
                ctx.b3obj.components.text.text = `${balance} ${asset}`;
            }

            const out = this.outputs.find(o => o.name === 'OnUpdated');
            if (out) ctx.executor.executePin(out.id, ctx);
        }
    }

    update() {}
    execute() {}

    toJSON() { return { ...super.toJSON(), type: 'BalanceDisplayActuator' }; }
    static fromJSON(data: any): BalanceDisplayActuator {
        const n = new BalanceDisplayActuator(data.id);
        n.restorePins(data);
        n.guiMetadata = data.guiMetadata;
        return n;
    }
}
