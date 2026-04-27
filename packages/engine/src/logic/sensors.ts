import { Sensor, B3ObjectRef, B3EngineRef } from './base';

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

    update(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef) {
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
    update(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef) {
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

/**
 * MiningSensor: Detects if a miner is active and meets hashrate thresholds
 */
export class MiningSensor extends Sensor {
    public hashrate: number = 0;
    public shares: number = 0;

    constructor(public threshold: number = 100) { super(); }
    getTypeName() { return 'MiningSensor'; }
    update(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef) {
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
