/**
 * QuaiAxe Logic Bricks — Burn-Mining Sensors & Actuators
 *
 * Gameplay wiring for the QuaiAxe mini-game: a furnace that feeds itself
 * whenever pending QUAI accumulates, lamps that pulse on every burn batch,
 * gates that open once enough $QAXE has been burned.
 *
 * Follows the Sensor → Controller → Actuator pipeline (see ceremony_nodes.ts).
 */

import { Sensor, Actuator, B3ObjectRef, B3EngineRef } from './base';
import type { NodeInfo } from './base';
import { QUAI_WEI } from '@b3js/web3';

// ═══════════════════════════════════════════════════════════════════
//  SENSORS
// ═══════════════════════════════════════════════════════════════════

/**
 * QuaiAxeMiningSensor — Fires while the QuaiAxe miner is actively mining
 * (MINING or SIMULATING state). Pair with MotionActuator to spin fans,
 * or AudioReactiveActuator for rig hum.
 */
export class QuaiAxeMiningSensor extends Sensor {
    getTypeName() { return 'QuaiAxeMiningSensor'; }

    static getNodeInfo(): NodeInfo {
        return {
            type: 'QuaiAxeMiningSensor',
            label: 'Miner Active',
            category: 'QuaiAxe',
            color: '#ff7a1a',
            description: 'Fires while the QUAI miner is hashing',
            icon: '⛏️'
        };
    }

    update(_delta: number, _b3obj: B3ObjectRef, engine: B3EngineRef): void {
        const game = engine.quaiAxe;
        if (!game) { this.positive = false; return; }
        const state = game.miner.telemetry.state;
        this.positive = state === 'MINING' || state === 'SIMULATING';
    }

    toJSON() {
        return { ...super.toJSON(), type: 'QuaiAxeMiningSensor' };
    }

    static fromJSON(data: any): QuaiAxeMiningSensor {
        const n = new QuaiAxeMiningSensor();
        n.id = data.id;
        n.guiMetadata = data.guiMetadata;
        n.enabled = data.enabled;
        return n;
    }
}

/**
 * QuaiAxeBurnSensor — Pulses (~1s) each time a burn batch executes.
 * Tracks the game's burn counter, so it works with burns triggered from
 * anywhere: UI button, another actuator, or the tutorial.
 */
export class QuaiAxeBurnSensor extends Sensor {
    /** Total burn batches observed. */
    public burnCount: number = 0;

    private lastSeen: number = -1;
    private positiveUntil: number = 0;

    getTypeName() { return 'QuaiAxeBurnSensor'; }

    static getNodeInfo(): NodeInfo {
        return {
            type: 'QuaiAxeBurnSensor',
            label: 'Burn Executed',
            category: 'QuaiAxe',
            color: '#ff7a1a',
            description: 'Pulses when a $QAXE burn batch executes',
            icon: '🔥'
        };
    }

    update(_delta: number, _b3obj: B3ObjectRef, engine: B3EngineRef): void {
        const game = engine.quaiAxe;
        if (!game) { this.positive = false; return; }

        const count = game.burnLog.length;
        this.burnCount = count;
        if (count > this.lastSeen && this.lastSeen >= 0) {
            this.positiveUntil = Date.now() + 1000;
        }
        this.lastSeen = count;
        this.positive = Date.now() < this.positiveUntil;
    }

    toJSON() {
        return { ...super.toJSON(), type: 'QuaiAxeBurnSensor' };
    }

    static fromJSON(data: any): QuaiAxeBurnSensor {
        const n = new QuaiAxeBurnSensor();
        n.id = data.id;
        n.guiMetadata = data.guiMetadata;
        n.enabled = data.enabled;
        return n;
    }
}

// ═══════════════════════════════════════════════════════════════════
//  ACTUATORS
// ═══════════════════════════════════════════════════════════════════

/**
 * QuaiAxeFeedActuator — Executes a burn batch when triggered, as long as
 * the pending pot meets `minBatchQuai`. Wire behind a timer or a
 * CollisionSensor: "throw fuel into the furnace".
 */
export class QuaiAxeFeedActuator extends Actuator {
    /** Minimum pending QUAI required to fire a batch. */
    public minBatchQuai: number = 1;
    /** Cooldown between batch attempts (ms). */
    public cooldownMs: number = 5000;

    private lastAttempt: number = 0;

    constructor(minBatchQuai: number = 1) {
        super();
        this.minBatchQuai = minBatchQuai;
    }

    getTypeName() { return 'QuaiAxeFeedActuator'; }

    static getNodeInfo(): NodeInfo {
        return {
            type: 'QuaiAxeFeedActuator',
            label: 'Feed Furnace',
            category: 'QuaiAxe',
            color: '#ff7a1a',
            description: 'Executes a $QAXE burn batch from pending QUAI',
            icon: '🏭'
        };
    }

    execute(_delta: number, _b3obj: B3ObjectRef, engine: B3EngineRef): void {
        const game = engine.quaiAxe;
        if (!game) return;

        const now = Date.now();
        if (now - this.lastAttempt < this.cooldownMs) return;
        this.lastAttempt = now;

        const minWei = BigInt(Math.round(this.minBatchQuai * 1e6)) * 10n ** 12n;
        if (game.pendingGrossWei < minWei) return;

        const record = game.executeBurnBatch();
        if (record) {
            const burnedQuai = (Number(record.split.burnBuy) / Number(QUAI_WEI)).toFixed(4);
            console.log(`B3JS QuaiAxe: burn batch #${record.id} — ${burnedQuai} QUAI → $QAXE burn`);
        }
    }

    update(_delta: number, _b3obj: B3ObjectRef, _engine: B3EngineRef): void { /* Passive */ }

    toJSON() {
        return {
            ...super.toJSON(),
            type: 'QuaiAxeFeedActuator',
            minBatchQuai: this.minBatchQuai,
            cooldownMs: this.cooldownMs,
        };
    }

    static fromJSON(data: any): QuaiAxeFeedActuator {
        const n = new QuaiAxeFeedActuator(data.minBatchQuai ?? 1);
        n.id = data.id;
        n.guiMetadata = data.guiMetadata;
        n.enabled = data.enabled;
        n.cooldownMs = data.cooldownMs || 5000;
        return n;
    }
}

/**
 * QuaiAxePaintActuator — Paints a pixel on the Furnace Wall when
 * triggered, charged to the payout balance. Lets builders wire "step on
 * the plate → claim your pixel" moments.
 */
export class QuaiAxePaintActuator extends Actuator {
    public pixelX: number = 0;
    public pixelY: number = 0;
    public color: string = '#ff6600';
    /** Cooldown between paint attempts (ms). */
    public cooldownMs: number = 3000;

    private lastAttempt: number = 0;

    getTypeName() { return 'QuaiAxePaintActuator'; }

    static getNodeInfo(): NodeInfo {
        return {
            type: 'QuaiAxePaintActuator',
            label: 'Paint Pixel',
            category: 'QuaiAxe',
            color: '#ff7a1a',
            description: 'Paints a Furnace Wall pixel (costs payout balance)',
            icon: '🎨'
        };
    }

    execute(_delta: number, _b3obj: B3ObjectRef, engine: B3EngineRef): void {
        const game = engine.quaiAxe;
        if (!game) return;

        const now = Date.now();
        if (now - this.lastAttempt < this.cooldownMs) return;
        this.lastAttempt = now;

        const result = game.paintPixel(this.pixelX, this.pixelY, this.color, 'world');
        if (!result.ok && result.reason === 'insufficient-payout') {
            console.warn('B3JS QuaiAxe: paint failed — insufficient payout balance');
        }
    }

    update(_delta: number, _b3obj: B3ObjectRef, _engine: B3EngineRef): void { /* Passive */ }

    toJSON() {
        return {
            ...super.toJSON(),
            type: 'QuaiAxePaintActuator',
            pixelX: this.pixelX,
            pixelY: this.pixelY,
            color: this.color,
            cooldownMs: this.cooldownMs,
        };
    }

    static fromJSON(data: any): QuaiAxePaintActuator {
        const n = new QuaiAxePaintActuator();
        n.id = data.id;
        n.guiMetadata = data.guiMetadata;
        n.enabled = data.enabled;
        n.pixelX = data.pixelX ?? 0;
        n.pixelY = data.pixelY ?? 0;
        n.color = data.color || '#ff6600';
        n.cooldownMs = data.cooldownMs || 3000;
        return n;
    }
}
