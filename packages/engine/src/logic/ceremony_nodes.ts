/**
 * Ceremony Logic Bricks — ZK Ceremony Sensors & Actuators
 *
 * Gameplay wiring for multi-party trusted setup ceremonies. World builders
 * can make ceremonies playable: a door that opens when a ceremony
 * finalizes, a forge that contributes entropy when a player interacts,
 * an altar that publishes the circuit blueprint the party just assembled.
 *
 * Follows the Sensor → Controller → Actuator pipeline (see zk_nodes.ts).
 */

import { Sensor, Actuator, B3ObjectRef, B3EngineRef } from './base';
import type { NodeInfo } from './base';
import { randomEntropy } from '@b3js/zk';
import type { CeremonyPhase } from '@b3js/zk';

// ═══════════════════════════════════════════════════════════════════
//  SENSORS
// ═══════════════════════════════════════════════════════════════════

/**
 * CeremonyTurnSensor — Fires while it is the local player's turn to
 * contribute in the watched ceremony.
 *
 * Classic pairing: CeremonyTurnSensor → AndController →
 * CeremonyContributeActuator makes an auto-contributing shrine.
 */
export class CeremonyTurnSensor extends Sensor {
    /** Ceremony to watch (empty = any running ceremony where it's our turn). */
    public ceremonyId: string = '';

    constructor(ceremonyId: string = '') {
        super();
        this.ceremonyId = ceremonyId;
    }

    getTypeName() { return 'CeremonyTurnSensor'; }

    static getNodeInfo(): NodeInfo {
        return {
            type: 'CeremonyTurnSensor',
            label: 'Ceremony Turn',
            category: 'ZK Ceremony',
            color: '#b366ff',
            description: 'Fires while it is your turn to contribute entropy',
            icon: '🔮'
        };
    }

    update(_delta: number, _b3obj: B3ObjectRef, engine: B3EngineRef): void {
        const coordinator = engine.ceremony;
        if (!coordinator) { this.positive = false; return; }

        const me = coordinator.localIdentity();
        const ids = this.ceremonyId
            ? [this.ceremonyId]
            : coordinator.manager.listCeremonies().map((c: any) => c.id);

        this.positive = ids.some((id: string) => {
            const current = coordinator.manager.getCurrentTurn(id);
            return current?.id === me;
        });
    }

    toJSON() {
        return { ...super.toJSON(), type: 'CeremonyTurnSensor', ceremonyId: this.ceremonyId };
    }

    static fromJSON(data: any): CeremonyTurnSensor {
        const n = new CeremonyTurnSensor(data.ceremonyId || '');
        n.id = data.id;
        n.guiMetadata = data.guiMetadata;
        n.enabled = data.enabled;
        return n;
    }
}

/**
 * CeremonyPhaseSensor — Fires while the watched ceremony is in the
 * configured phase. The 'finalized' phase is the money shot: use it to
 * unlock content that only exists once the trusted setup completes
 * (e.g. a vault that opens when the circuit's parameters are forged).
 */
export class CeremonyPhaseSensor extends Sensor {
    public ceremonyId: string = '';
    public phase: CeremonyPhase = 'finalized';

    constructor(ceremonyId: string = '', phase: CeremonyPhase = 'finalized') {
        super();
        this.ceremonyId = ceremonyId;
        this.phase = phase;
    }

    getTypeName() { return 'CeremonyPhaseSensor'; }

    static getNodeInfo(): NodeInfo {
        return {
            type: 'CeremonyPhaseSensor',
            label: 'Ceremony Phase',
            category: 'ZK Ceremony',
            color: '#b366ff',
            description: 'Fires when a ceremony reaches a phase (e.g. finalized)',
            icon: '⏳'
        };
    }

    update(_delta: number, _b3obj: B3ObjectRef, engine: B3EngineRef): void {
        const coordinator = engine.ceremony;
        if (!coordinator) { this.positive = false; return; }

        if (this.ceremonyId) {
            this.positive = coordinator.manager.getCeremony(this.ceremonyId)?.phase === this.phase;
        } else {
            this.positive = coordinator.manager
                .listCeremonies()
                .some((c: any) => c.phase === this.phase);
        }
    }

    toJSON() {
        return { ...super.toJSON(), type: 'CeremonyPhaseSensor', ceremonyId: this.ceremonyId, phase: this.phase };
    }

    static fromJSON(data: any): CeremonyPhaseSensor {
        const n = new CeremonyPhaseSensor(data.ceremonyId || '', data.phase || 'finalized');
        n.id = data.id;
        n.guiMetadata = data.guiMetadata;
        n.enabled = data.enabled;
        return n;
    }
}

/**
 * CeremonyContributionSensor — Fires (for one evaluation window) when a
 * new contribution lands in the watched ceremony. Useful for celebration
 * effects — each contribution is a beat in the ritual.
 */
export class CeremonyContributionSensor extends Sensor {
    public ceremonyId: string = '';
    /** Total contributions observed in the watched ceremony. */
    public contributionCount: number = 0;

    private lastSeen: number = -1;
    private positiveUntil: number = 0;

    constructor(ceremonyId: string = '') {
        super();
        this.ceremonyId = ceremonyId;
    }

    getTypeName() { return 'CeremonyContributionSensor'; }

    static getNodeInfo(): NodeInfo {
        return {
            type: 'CeremonyContributionSensor',
            label: 'Ceremony Contribution',
            category: 'ZK Ceremony',
            color: '#b366ff',
            description: 'Pulses when a new entropy contribution lands',
            icon: '✨'
        };
    }

    update(_delta: number, _b3obj: B3ObjectRef, engine: B3EngineRef): void {
        const coordinator = engine.ceremony;
        if (!coordinator) { this.positive = false; return; }

        const ceremonies = this.ceremonyId
            ? [coordinator.manager.getCeremony(this.ceremonyId)].filter(Boolean)
            : coordinator.manager.listCeremonies();

        const count = ceremonies.reduce(
            (n: number, c: any) => n + (c?.contributions?.length ?? 0), 0,
        );
        this.contributionCount = count;

        if (count > this.lastSeen && this.lastSeen >= 0) {
            // New contribution(s) detected — pulse for ~1s
            this.positiveUntil = Date.now() + 1000;
        }
        this.lastSeen = count;
        this.positive = Date.now() < this.positiveUntil;
    }

    toJSON() {
        return { ...super.toJSON(), type: 'CeremonyContributionSensor', ceremonyId: this.ceremonyId };
    }

    static fromJSON(data: any): CeremonyContributionSensor {
        const n = new CeremonyContributionSensor(data.ceremonyId || '');
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
 * CeremonyContributeActuator — Contributes entropy to the watched
 * ceremony when executed (and it is the local player's turn).
 *
 * entropySource 'random' uses the CSPRNG; the UI's mouse-entropy
 * mini-game routes through the CeremonyPanel instead.
 */
export class CeremonyContributeActuator extends Actuator {
    public ceremonyId: string = '';
    /** Public attestation text recorded in the transcript. */
    public attestation: string = '';
    /** Cooldown between attempts (ms). */
    public cooldownMs: number = 2000;

    private lastAttempt: number = 0;
    private busy: boolean = false;

    constructor(ceremonyId: string = '') {
        super();
        this.ceremonyId = ceremonyId;
    }

    getTypeName() { return 'CeremonyContributeActuator'; }

    static getNodeInfo(): NodeInfo {
        return {
            type: 'CeremonyContributeActuator',
            label: 'Ceremony Contribute',
            category: 'ZK Ceremony',
            color: '#b366ff',
            description: 'Contributes entropy to a ceremony on your turn',
            icon: '🕯️'
        };
    }

    execute(_delta: number, _b3obj: B3ObjectRef, engine: B3EngineRef): void {
        const coordinator = engine.ceremony;
        if (!coordinator || this.busy) return;

        const now = Date.now();
        if (now - this.lastAttempt < this.cooldownMs) return;
        this.lastAttempt = now;

        // Find the ceremony where it's our turn
        const me = coordinator.localIdentity();
        const candidates = this.ceremonyId
            ? [this.ceremonyId]
            : coordinator.manager.listCeremonies().map((c: any) => c.id);

        const target = candidates.find((id: string) => {
            return coordinator.manager.getCurrentTurn(id)?.id === me;
        });
        if (!target) return;

        this.busy = true;
        coordinator
            .contribute(target, randomEntropy(48), {
                entropySource: 'random',
                attestation: this.attestation || undefined,
            })
            .then((c: any) => {
                console.log(`B3JS Ceremony: contributed to "${target}" → ${c.accumulatorHash.substring(0, 12)}…`);
            })
            .catch((e: any) => console.warn('B3JS Ceremony: contribution failed', e))
            .finally(() => { this.busy = false; });
    }

    update(_delta: number, _b3obj: B3ObjectRef, _engine: B3EngineRef): void { /* Passive */ }

    toJSON() {
        return {
            ...super.toJSON(),
            type: 'CeremonyContributeActuator',
            ceremonyId: this.ceremonyId,
            attestation: this.attestation,
            cooldownMs: this.cooldownMs,
        };
    }

    static fromJSON(data: any): CeremonyContributeActuator {
        const n = new CeremonyContributeActuator(data.ceremonyId || '');
        n.id = data.id;
        n.guiMetadata = data.guiMetadata;
        n.enabled = data.enabled;
        n.attestation = data.attestation || '';
        n.cooldownMs = data.cooldownMs || 2000;
        return n;
    }
}

/**
 * CeremonyFinalizeActuator — Finalizes a ceremony (creator only) with an
 * optional public beacon. Wire behind a phase sensor on 'finalizing'.
 */
export class CeremonyFinalizeActuator extends Actuator {
    public ceremonyId: string = '';
    /** Public beacon value (e.g. a blockhash). Empty = none. */
    public beacon: string = '';

    private busy: boolean = false;

    constructor(ceremonyId: string = '', beacon: string = '') {
        super();
        this.ceremonyId = ceremonyId;
        this.beacon = beacon;
    }

    getTypeName() { return 'CeremonyFinalizeActuator'; }

    static getNodeInfo(): NodeInfo {
        return {
            type: 'CeremonyFinalizeActuator',
            label: 'Ceremony Finalize',
            category: 'ZK Ceremony',
            color: '#b366ff',
            description: 'Finalizes a ceremony with an optional beacon',
            icon: '⚗️'
        };
    }

    execute(_delta: number, _b3obj: B3ObjectRef, engine: B3EngineRef): void {
        const coordinator = engine.ceremony;
        if (!coordinator || this.busy || !this.ceremonyId) return;

        const ceremony = coordinator.manager.getCeremony(this.ceremonyId);
        if (!ceremony || ceremony.phase !== 'finalizing') return;

        this.busy = true;
        coordinator
            .finalizeCeremony(this.ceremonyId, this.beacon || undefined)
            .then((hash: string) => {
                console.log(`B3JS Ceremony: "${this.ceremonyId}" finalized → ${finalHashPreview(finalHash)}`);
            })
            .catch((e: any) => console.warn('B3JS Ceremony: finalize failed', e))
            .finally(() => { this.busy = false; });
    }

    update(_delta: number, _b3obj: B3ObjectRef, _engine: B3EngineRef): void { /* Passive */ }

    toJSON() {
        return { ...super.toJSON(), type: 'CeremonyFinalizeActuator', ceremonyId: this.ceremonyId, beacon: this.beacon };
    }

    static fromJSON(data: any): CeremonyFinalizeActuator {
        const n = new CeremonyFinalizeActuator(data.ceremonyId || '', data.beacon || '');
        n.id = data.id;
        n.guiMetadata = data.guiMetadata;
        n.enabled = data.enabled;
        return n;
    }
}

function finalHashPreview(hash: string): string {
    return `${hash.substring(0, 16)}…`;
}

/**
 * CeremonyUnlockActuator — Slides the parent object by an offset when
 * triggered, then stays open. The classic pairing:
 * CeremonyPhaseSensor('finalized') → AndController → CeremonyUnlockActuator
 * on a door slab: the vault opens when the ceremony completes.
 */
export class CeremonyUnlockActuator extends Actuator {
    /** Slide offset applied when unlocked (world units). */
    public offsetX: number = 0;
    public offsetY: number = -3.2;
    public offsetZ: number = 0;
    /** Animation speed (higher = faster). */
    public speed: number = 1.5;

    private opening: boolean = false;
    private progress: number = 0;
    private basePos: { x: number; y: number; z: number } | null = null;

    getTypeName() { return 'CeremonyUnlockActuator'; }

    static getNodeInfo(): NodeInfo {
        return {
            type: 'CeremonyUnlockActuator',
            label: 'Ceremony Unlock',
            category: 'ZK Ceremony',
            color: '#b366ff',
            description: 'Slides open (door/vault) when the ceremony completes',
            icon: '🚪'
        };
    }

    execute(_delta: number, b3obj: B3ObjectRef, _engine: B3EngineRef): void {
        if (!this.basePos) {
            const p = b3obj.object.position;
            this.basePos = { x: p.x, y: p.y, z: p.z };
        }
        this.opening = true;
    }

    update(delta: number, b3obj: B3ObjectRef, _engine: B3EngineRef): void {
        if (!this.opening || !this.basePos || this.progress >= 1) return;
        this.progress = Math.min(1, this.progress + this.speed * delta);
        // Ease-out cubic
        const t = 1 - Math.pow(1 - this.progress, 3);
        b3obj.object.position.set(
            this.basePos.x + this.offsetX * t,
            this.basePos.y + this.offsetY * t,
            this.basePos.z + this.offsetZ * t,
        );
    }

    toJSON() {
        return {
            ...super.toJSON(),
            type: 'CeremonyUnlockActuator',
            offsetX: this.offsetX,
            offsetY: this.offsetY,
            offsetZ: this.offsetZ,
            speed: this.speed,
        };
    }

    static fromJSON(data: any): CeremonyUnlockActuator {
        const n = new CeremonyUnlockActuator();
        n.id = data.id;
        n.guiMetadata = data.guiMetadata;
        n.enabled = data.enabled;
        n.offsetX = data.offsetX ?? 0;
        n.offsetY = data.offsetY ?? -3.2;
        n.offsetZ = data.offsetZ ?? 0;
        n.speed = data.speed ?? 1.5;
        return n;
    }
}
