/**
 * Rhythm Arcade Logic Bricks — beat-reactive sensors and arcade actuators
 *
 * Lets builders wire the DeFi rhythm games into the world:
 *   RhythmBeatSensor       — pulses on every beat (or every Nth) while a game runs
 *   RhythmJudgementSensor  — pulses on a chosen judgement (PERFECT/GREAT/GOOD/MISS)
 *   RhythmFeverSensor      — true while FEVER is active
 *   RhythmStartActuator    — starts a game (step on a cabinet pad → play)
 *   RhythmLaneActuator     — presses a lane (XR buttons, pressure plates, MIDI…)
 *
 * Follows the Sensor → Controller → Actuator pipeline (see qaxe_nodes.ts).
 */

import { Sensor, Actuator, B3ObjectRef, B3EngineRef } from './base';
import type { NodeInfo } from './base';

const RHYTHM_COLOR = '#ff3333';

function arcadeOf(engine: B3EngineRef): any | null {
    return (engine as any)?.rhythm ?? null;
}

// ═══════════════════════════════════════════════════════════════════
//  SENSORS
// ═══════════════════════════════════════════════════════════════════

export class RhythmBeatSensor extends Sensor {
    /** Fire every Nth beat (1 = every beat, 4 = every bar). */
    public everyNBeats: number = 1;
    /** How long the pulse stays positive (ms). */
    public pulseMs: number = 120;
    /** Latest intensity (0..1) reported by the active game — for actuators. */
    public intensity: number = 0;
    public beatCount: number = 0;

    private positiveUntil = 0;
    private bound = false;

    constructor(everyNBeats = 1) { super(); this.everyNBeats = Math.max(1, everyNBeats); }

    getTypeName() { return 'RhythmBeatSensor'; }

    static getNodeInfo(): NodeInfo {
        return { type: 'RhythmBeatSensor', label: 'On Beat', category: 'Web3', color: RHYTHM_COLOR, description: 'Pulses on every Nth beat of the active rhythm game', icon: '🥁' };
    }

    private bind() {
        if (this.bound || typeof window === 'undefined') return;
        this.bound = true;
        window.addEventListener('b3js:rhythm:beat', (ev: Event) => {
            const d = (ev as CustomEvent).detail;
            this.intensity = d?.intensity ?? 0;
            this.beatCount++;
            if ((d?.beat ?? 0) % this.everyNBeats === 0) this.positiveUntil = Date.now() + this.pulseMs;
        });
    }

    update(_delta: number, _b3obj: B3ObjectRef, _engine: B3EngineRef): void {
        this.bind();
        this.positive = Date.now() < this.positiveUntil;
    }

    toJSON() { return { ...super.toJSON(), type: 'RhythmBeatSensor', everyNBeats: this.everyNBeats, pulseMs: this.pulseMs }; }

    static fromJSON(data: any): RhythmBeatSensor {
        const n = new RhythmBeatSensor(data.everyNBeats ?? 1);
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        n.pulseMs = data.pulseMs ?? 120;
        return n;
    }
}

export class RhythmJudgementSensor extends Sensor {
    public judgement: 'PERFECT' | 'GREAT' | 'GOOD' | 'MISS' | 'ANY' = 'PERFECT';
    public pulseMs: number = 150;
    public lastLane: number = -1;
    public lastCombo: number = 0;

    private positiveUntil = 0;
    private bound = false;

    constructor(judgement: RhythmJudgementSensor['judgement'] = 'PERFECT') { super(); this.judgement = judgement; }

    getTypeName() { return 'RhythmJudgementSensor'; }

    static getNodeInfo(): NodeInfo {
        return { type: 'RhythmJudgementSensor', label: 'On Judgement', category: 'Web3', color: RHYTHM_COLOR, description: 'Pulses when the player lands a given judgement', icon: '🎯' };
    }

    private bind() {
        if (this.bound || typeof window === 'undefined') return;
        this.bound = true;
        window.addEventListener('b3js:rhythm:judgement', (ev: Event) => {
            const d = (ev as CustomEvent).detail;
            if (this.judgement !== 'ANY' && d?.judgement !== this.judgement) return;
            this.lastLane = d?.lane ?? -1;
            this.lastCombo = d?.combo ?? 0;
            this.positiveUntil = Date.now() + this.pulseMs;
        });
    }

    update(_delta: number, _b3obj: B3ObjectRef, _engine: B3EngineRef): void {
        this.bind();
        this.positive = Date.now() < this.positiveUntil;
    }

    toJSON() { return { ...super.toJSON(), type: 'RhythmJudgementSensor', judgement: this.judgement, pulseMs: this.pulseMs }; }

    static fromJSON(data: any): RhythmJudgementSensor {
        const n = new RhythmJudgementSensor(data.judgement ?? 'PERFECT');
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        n.pulseMs = data.pulseMs ?? 150;
        return n;
    }
}

export class RhythmFeverSensor extends Sensor {
    getTypeName() { return 'RhythmFeverSensor'; }

    static getNodeInfo(): NodeInfo {
        return { type: 'RhythmFeverSensor', label: 'Fever Active', category: 'Web3', color: RHYTHM_COLOR, description: 'True while FEVER ×2 is active in the rhythm game', icon: '🔥' };
    }

    update(_delta: number, _b3obj: B3ObjectRef, engine: B3EngineRef): void {
        const arcade = arcadeOf(engine);
        this.positive = !!arcade?.getSnapshot?.().score?.feverActive;
    }

    toJSON() { return { ...super.toJSON(), type: 'RhythmFeverSensor' }; }

    static fromJSON(data: any): RhythmFeverSensor {
        const n = new RhythmFeverSensor();
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        return n;
    }
}

// ═══════════════════════════════════════════════════════════════════
//  ACTUATORS
// ═══════════════════════════════════════════════════════════════════

export class RhythmStartActuator extends Actuator {
    public gameId: string = 'burn-beat';
    public difficulty: 'easy' | 'normal' | 'hard' | 'insane' = 'normal';
    public cooldownMs: number = 3000;
    private lastAttempt = 0;

    constructor(gameId = 'burn-beat', difficulty: RhythmStartActuator['difficulty'] = 'normal') { super(); this.gameId = gameId; this.difficulty = difficulty; }

    getTypeName() { return 'RhythmStartActuator'; }

    static getNodeInfo(): NodeInfo {
        return { type: 'RhythmStartActuator', label: 'Start Rhythm Game', category: 'Web3', color: RHYTHM_COLOR, description: 'Launches a DeFi rhythm mini-game', icon: '🕹️' };
    }

    execute(_delta: number, _b3obj: B3ObjectRef, engine: B3EngineRef): void {
        const arcade = arcadeOf(engine);
        if (!arcade) return;
        const now = Date.now();
        if (now - this.lastAttempt < this.cooldownMs) return;
        this.lastAttempt = now;
        if (arcade.phase !== 'idle') return;
        void arcade.start(this.gameId, { difficulty: this.difficulty });
    }

    update(_delta: number, _b3obj: B3ObjectRef, _engine: B3EngineRef): void { /* passive */ }

    toJSON() { return { ...super.toJSON(), type: 'RhythmStartActuator', gameId: this.gameId, difficulty: this.difficulty, cooldownMs: this.cooldownMs }; }

    static fromJSON(data: any): RhythmStartActuator {
        const n = new RhythmStartActuator(data.gameId ?? 'burn-beat', data.difficulty ?? 'normal');
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        n.cooldownMs = data.cooldownMs ?? 3000;
        return n;
    }
}

export class RhythmLaneActuator extends Actuator {
    public lane: number = 0;
    private wasFiring = false;

    constructor(lane = 0) { super(); this.lane = lane; }

    getTypeName() { return 'RhythmLaneActuator'; }

    static getNodeInfo(): NodeInfo {
        return { type: 'RhythmLaneActuator', label: 'Press Lane', category: 'Web3', color: RHYTHM_COLOR, description: 'Presses a rhythm lane while triggered (XR buttons, plates, MIDI)', icon: '👆' };
    }

    execute(_delta: number, _b3obj: B3ObjectRef, engine: B3EngineRef): void {
        const arcade = arcadeOf(engine);
        if (!arcade) return;
        this.enabledThisTick = true;
        if (!this.wasFiring) { arcade.press(this.lane, true); this.wasFiring = true; }
    }

    update(_delta: number, _b3obj: B3ObjectRef, engine: B3EngineRef): void {
        // execute() is called while the controller fires; when it stops, release.
        if (this.wasFiring && !this.enabledThisTick) {
            arcadeOf(engine)?.press(this.lane, false);
            this.wasFiring = false;
        }
        this.enabledThisTick = false;
    }

    /** Set by execute() each tick the controller fires. */
    private enabledThisTick = false;

    toJSON() { return { ...super.toJSON(), type: 'RhythmLaneActuator', lane: this.lane }; }

    static fromJSON(data: any): RhythmLaneActuator {
        const n = new RhythmLaneActuator(data.lane ?? 0);
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        return n;
    }
}
