/**
 * @b3js/engine — Rhythm Core
 *
 * Platform-agnostic timing, judgement and scoring primitives shared by every
 * DeFi rhythm mini-game. Nothing here touches the DOM, WebAudio or Three.js,
 * so the whole module runs identically under Bun tests, in a browser, in XR
 * or on a phone. All times are in **milliseconds of song time**.
 *
 * Design notes (why the loop is sticky):
 *   - Four judgement tiers with tight windows → near-misses feel "almost".
 *   - Combo multiplier tiers (×1 → ×8) → every note matters more than the last.
 *   - FEVER meter fills on PERFECTs and doubles everything for a few bars →
 *     a visible "payoff" moment players chase.
 *   - Deterministic seeded charts → shareable seeds, fair leaderboards,
 *     reproducible unit tests.
 */

// ═══════════════════════════════════════════════════════════════════
//  Judgement
// ═══════════════════════════════════════════════════════════════════

export type Judgement = 'PERFECT' | 'GREAT' | 'GOOD' | 'MISS';

/** Absolute timing windows (ms). Anything beyond GOOD late is a MISS. */
export const JUDGEMENT_WINDOWS_MS: Readonly<Record<Exclude<Judgement, 'MISS'>, number>> = {
    PERFECT: 40,
    GREAT: 85,
    GOOD: 130,
};

/** A hit later than this (ms) after the note time auto-scores as MISS. */
export const MISS_LATE_MS = 160;

/** Base points per judgement before multipliers. */
export const JUDGEMENT_POINTS: Readonly<Record<Judgement, number>> = {
    PERFECT: 100,
    GREAT: 70,
    GOOD: 35,
    MISS: 0,
};

/** Fraction of the note's DeFi value realised per judgement (0..1). */
export const JUDGEMENT_EFFICIENCY: Readonly<Record<Judgement, number>> = {
    PERFECT: 1.0,
    GREAT: 0.75,
    GOOD: 0.4,
    MISS: 0,
};

/** Classify a hit by its signed timing delta (hit − note time, ms). */
export function judge(deltaMs: number): Judgement {
    const a = Math.abs(deltaMs);
    if (a <= JUDGEMENT_WINDOWS_MS.PERFECT) return 'PERFECT';
    if (a <= JUDGEMENT_WINDOWS_MS.GREAT) return 'GREAT';
    if (a <= JUDGEMENT_WINDOWS_MS.GOOD) return 'GOOD';
    return 'MISS';
}

// ═══════════════════════════════════════════════════════════════════
//  Deterministic PRNG (mulberry32) — seeds make charts reproducible
// ═══════════════════════════════════════════════════════════════════

export function hashSeed(seed: string | number): number {
    if (typeof seed === 'number') return seed >>> 0;
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
}

export function mulberry32(seed: string | number): () => number {
    let a = hashSeed(seed);
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ═══════════════════════════════════════════════════════════════════
//  Charts
// ═══════════════════════════════════════════════════════════════════

export type NoteType = 'tap' | 'hold';

export interface Note<P = unknown> {
    id: number;
    /** Song time (ms) at which the note should be hit. */
    time: number;
    lane: number;
    type: NoteType;
    /** Hold duration (ms) — only for `hold` notes. */
    duration?: number;
    /** Game-specific payload (e.g. a share, a swap order, a price shock). */
    payload?: P;
}

export interface Chart<P = unknown> {
    bpm: number;
    lanes: number;
    /** Lead-in before the first beat (ms). */
    offset: number;
    notes: Note<P>[];
    /** Total chart length (ms), including tail. */
    lengthMs: number;
    seed: string;
}

export const beatMs = (bpm: number) => 60000 / bpm;

export interface ChartGenOptions {
    seed: string;
    bpm: number;
    lanes: number;
    bars: number;
    /** 0..1 chance a subdivision slot carries a note. */
    density: number;
    /** Notes per beat (1 = quarter notes, 2 = eighths, 4 = sixteenths). */
    subdivision?: number;
    /** 0..1 chance a note becomes a hold (lasting 1–2 beats). */
    holdChance?: number;
    offset?: number;
    beatsPerBar?: number;
    /** Avoid the same lane twice in a row (default true). */
    avoidRepeats?: boolean;
}

/**
 * Generate a deterministic chart. The same options always yield the same
 * notes, so a seed is a complete, shareable description of a run.
 */
export function generateChart<P = unknown>(
    opts: ChartGenOptions,
    payloadFor?: (note: Omit<Note<P>, 'payload'>, rand: () => number) => P,
): Chart<P> {
    const rand = mulberry32(opts.seed);
    const sub = opts.subdivision ?? 2;
    const bpb = opts.beatsPerBar ?? 4;
    const offset = opts.offset ?? 2000;
    const holdChance = opts.holdChance ?? 0;
    const avoidRepeats = opts.avoidRepeats ?? true;
    const slotMs = beatMs(opts.bpm) / sub;
    const totalSlots = opts.bars * bpb * sub;

    const notes: Note<P>[] = [];
    let id = 0;
    let lastLane = -1;
    let holdUntil = -1; // slot index until which lanes are "busy" with a hold

    for (let s = 0; s < totalSlots; s++) {
        const onBeat = s % sub === 0;
        // Downbeats are more likely to carry notes → groove is readable.
        const p = onBeat ? Math.min(1, opts.density * 1.35) : opts.density * 0.8;
        if (rand() > p) continue;
        if (s < holdUntil) continue;

        let lane = Math.floor(rand() * opts.lanes);
        if (avoidRepeats && opts.lanes > 1 && lane === lastLane) lane = (lane + 1 + Math.floor(rand() * (opts.lanes - 1))) % opts.lanes;
        lastLane = lane;

        const time = offset + s * slotMs;
        let type: NoteType = 'tap';
        let duration: number | undefined;
        if (holdChance > 0 && onBeat && rand() < holdChance) {
            type = 'hold';
            const beats = 1 + Math.floor(rand() * 2);
            duration = beats * beatMs(opts.bpm);
            holdUntil = s + beats * sub;
        }
        const base: Omit<Note<P>, 'payload'> = { id: id++, time, lane, type, duration };
        notes.push(payloadFor ? { ...base, payload: payloadFor(base, rand) } : (base as Note<P>));
    }

    const lengthMs = offset + totalSlots * slotMs + beatMs(opts.bpm) * 2;
    return { bpm: opts.bpm, lanes: opts.lanes, offset, notes, lengthMs, seed: opts.seed };
}

// ═══════════════════════════════════════════════════════════════════
//  Conductor — song clock with latency calibration
// ═══════════════════════════════════════════════════════════════════

export class Conductor {
    private startedAt: number | null = null;
    private pausedAt: number | null = null;
    private pausedTotal = 0;
    /** Positive = player hits late on this device → shift judgement window. */
    public calibrationOffsetMs = 0;

    constructor(private readonly now: () => number = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())) {}

    start(atMs?: number) {
        this.startedAt = atMs ?? this.now();
        this.pausedAt = null;
        this.pausedTotal = 0;
    }

    pause(atMs?: number) {
        if (this.startedAt === null || this.pausedAt !== null) return;
        this.pausedAt = atMs ?? this.now();
    }

    resume(atMs?: number) {
        if (this.pausedAt === null) return;
        this.pausedTotal += (atMs ?? this.now()) - this.pausedAt;
        this.pausedAt = null;
    }

    get running(): boolean { return this.startedAt !== null && this.pausedAt === null; }
    get started(): boolean { return this.startedAt !== null; }

    /** Current song time in ms (0 before start). */
    songTime(atMs?: number): number {
        if (this.startedAt === null) return 0;
        const t = this.pausedAt ?? (atMs ?? this.now());
        return t - this.startedAt - this.pausedTotal - this.calibrationOffsetMs;
    }

    /** Convert a wall-clock timestamp (e.g. an input event's) to song time. */
    toSongTime(wallMs: number): number {
        if (this.startedAt === null) return 0;
        return wallMs - this.startedAt - this.pausedTotal - this.calibrationOffsetMs;
    }

    stop() { this.startedAt = null; this.pausedAt = null; this.pausedTotal = 0; }
}

// ═══════════════════════════════════════════════════════════════════
//  Scoring — combo tiers + FEVER
// ═══════════════════════════════════════════════════════════════════

/** Combo thresholds → multiplier. */
export const COMBO_TIERS: ReadonlyArray<{ combo: number; mult: number }> = [
    { combo: 0, mult: 1 },
    { combo: 10, mult: 2 },
    { combo: 25, mult: 4 },
    { combo: 50, mult: 8 },
];

export const FEVER_MAX = 100;
/** Fever gained per judgement. */
export const FEVER_GAIN: Readonly<Record<Judgement, number>> = { PERFECT: 8, GREAT: 4, GOOD: 1, MISS: -15 };
/** FEVER lasts this many beats once triggered. */
export const FEVER_BEATS = 16;

export function comboMultiplier(combo: number): number {
    let mult = 1;
    for (const tier of COMBO_TIERS) if (combo >= tier.combo) mult = tier.mult;
    return mult;
}

export interface ScoreSnapshot {
    score: number;
    combo: number;
    maxCombo: number;
    multiplier: number;
    fever: number;
    feverActive: boolean;
    counts: Record<Judgement, number>;
    notesJudged: number;
    /** 0..1 weighted accuracy. */
    accuracy: number;
    /** Letter grade for the run so far. */
    grade: 'S' | 'A' | 'B' | 'C' | 'D';
}

export class ScoreState {
    public score = 0;
    public combo = 0;
    public maxCombo = 0;
    public fever = 0;
    public feverUntilMs = -1;
    public counts: Record<Judgement, number> = { PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 };

    constructor(private readonly bpm: number) {}

    feverActive(songTimeMs: number): boolean { return songTimeMs < this.feverUntilMs; }

    /** Register a judgement. Returns the points awarded (after multipliers). */
    register(j: Judgement, songTimeMs: number): number {
        this.counts[j]++;
        if (j === 'MISS') {
            this.combo = 0;
        } else {
            this.combo++;
            if (this.combo > this.maxCombo) this.maxCombo = this.combo;
        }

        // Fever: cannot gain while active (it is the payoff, not the build-up)
        if (!this.feverActive(songTimeMs)) {
            this.fever = Math.max(0, Math.min(FEVER_MAX, this.fever + FEVER_GAIN[j]));
            if (this.fever >= FEVER_MAX) {
                this.feverUntilMs = songTimeMs + FEVER_BEATS * beatMs(this.bpm);
                this.fever = 0;
            }
        }

        const mult = this.multiplier(songTimeMs);
        const pts = JUDGEMENT_POINTS[j] * mult;
        this.score += pts;
        return pts;
    }

    multiplier(songTimeMs: number): number {
        return comboMultiplier(this.combo) * (this.feverActive(songTimeMs) ? 2 : 1);
    }

    get notesJudged(): number { return this.counts.PERFECT + this.counts.GREAT + this.counts.GOOD + this.counts.MISS; }

    accuracy(): number {
        const n = this.notesJudged;
        if (n === 0) return 1;
        const w = this.counts.PERFECT * 1 + this.counts.GREAT * 0.75 + this.counts.GOOD * 0.4;
        return w / n;
    }

    grade(): ScoreSnapshot['grade'] {
        const a = this.accuracy();
        if (this.notesJudged > 0 && a >= 0.95 && this.counts.MISS === 0) return 'S';
        if (a >= 0.9) return 'A';
        if (a >= 0.75) return 'B';
        if (a >= 0.5) return 'C';
        return 'D';
    }

    snapshot(songTimeMs: number): ScoreSnapshot {
        return {
            score: this.score,
            combo: this.combo,
            maxCombo: this.maxCombo,
            multiplier: this.multiplier(songTimeMs),
            fever: this.fever,
            feverActive: this.feverActive(songTimeMs),
            counts: { ...this.counts },
            notesJudged: this.notesJudged,
            accuracy: this.accuracy(),
            grade: this.grade(),
        };
    }
}

// ═══════════════════════════════════════════════════════════════════
//  RhythmSession — judges input against a chart
// ═══════════════════════════════════════════════════════════════════

export type SessionEvent<P = unknown> =
    | { type: 'hit'; note: Note<P>; judgement: Exclude<Judgement, 'MISS'>; deltaMs: number; points: number; songTime: number }
    | { type: 'miss'; note: Note<P>; songTime: number }
    | { type: 'hold-start'; note: Note<P>; judgement: Exclude<Judgement, 'MISS'>; deltaMs: number; points: number; songTime: number }
    | { type: 'hold-tick'; note: Note<P>; progress: number; songTime: number }
    | { type: 'hold-end'; note: Note<P>; completed: boolean; progress: number; points: number; songTime: number }
    | { type: 'beat'; beat: number; bar: number; songTime: number }
    | { type: 'fever-start'; songTime: number }
    | { type: 'end'; songTime: number };

interface ActiveHold<P> { note: Note<P>; startedAt: number; lastTick: number }

/**
 * Pure judgement machine. Feed it `hit()` / `release()` from any input
 * device and call `update()` every frame; it returns the events that
 * occurred since the last call.
 */
export class RhythmSession<P = unknown> {
    public readonly score: ScoreState;
    private pending: Note<P>[];
    private cursor = 0;
    private activeHolds = new Map<number, ActiveHold<P>>();
    private lastBeat = -1;
    private feverWasActive = false;
    public ended = false;

    constructor(public readonly chart: Chart<P>) {
        this.score = new ScoreState(chart.bpm);
        this.pending = [...chart.notes].sort((a, b) => a.time - b.time);
    }

    /** Notes still awaiting judgement (sorted by time). */
    get remaining(): ReadonlyArray<Note<P>> { return this.pending.slice(this.cursor); }

    /** Visible notes in a time window — for renderers. */
    visibleNotes(songTime: number, lookaheadMs: number): Note<P>[] {
        const out: Note<P>[] = [];
        for (let i = this.cursor; i < this.pending.length; i++) {
            const n = this.pending[i];
            if (n.time > songTime + lookaheadMs) break;
            out.push(n);
        }
        for (const h of this.activeHolds.values()) out.push(h.note);
        return out;
    }

    isHolding(noteId: number): boolean {
        for (const h of this.activeHolds.values()) if (h.note.id === noteId) return true;
        return false;
    }

    /**
     * Player pressed `lane` at `songTime`. Finds the closest unjudged note in
     * that lane inside the GOOD window; otherwise the press is ignored (no
     * penalty for drumming along — punishing taps feels bad on touch).
     */
    hit(lane: number, songTime: number): SessionEvent<P> | null {
        if (this.ended) return null;
        let bestIdx = -1;
        let bestDelta = Infinity;
        for (let i = this.cursor; i < this.pending.length; i++) {
            const n = this.pending[i];
            const d = songTime - n.time;
            if (d < -JUDGEMENT_WINDOWS_MS.GOOD) break;
            if (n.lane !== lane) continue;
            if (Math.abs(d) < Math.abs(bestDelta)) { bestDelta = d; bestIdx = i; }
        }
        if (bestIdx === -1) return null;
        const j = judge(bestDelta);
        if (j === 'MISS') return null;

        const note = this.pending[bestIdx];
        this.removePending(bestIdx);

        if (note.type === 'hold' && note.duration) {
            this.activeHolds.set(lane, { note, startedAt: songTime, lastTick: songTime });
            // Hold start is scored as a normal hit; completion adds a bonus.
            const points = this.score.register(j, songTime);
            return { type: 'hold-start', note, judgement: j, deltaMs: bestDelta, points, songTime };
        }

        const points = this.score.register(j, songTime);
        return { type: 'hit', note, judgement: j, deltaMs: bestDelta, points, songTime };
    }

    /** Player released `lane`. Ends an active hold (early release = partial). */
    release(lane: number, songTime: number): SessionEvent<P> | null {
        const h = this.activeHolds.get(lane);
        if (!h) return null;
        this.activeHolds.delete(lane);
        const end = h.note.time + (h.note.duration ?? 0);
        const progress = Math.max(0, Math.min(1, (songTime - h.note.time) / (h.note.duration ?? 1)));
        const completed = songTime >= end - JUDGEMENT_WINDOWS_MS.GOOD;
        const points = completed ? this.score.register('PERFECT', songTime) : (progress >= 0.5 ? this.score.register('GOOD', songTime) : this.score.register('MISS', songTime));
        return { type: 'hold-end', note: h.note, completed, progress, points, songTime };
    }

    /** Advance the clock: auto-miss stale notes, tick holds, emit beats. */
    update(songTime: number): SessionEvent<P>[] {
        const events: SessionEvent<P>[] = [];
        if (this.ended) return events;

        // Beats
        const beatLen = beatMs(this.chart.bpm);
        const beat = Math.floor((songTime - this.chart.offset) / beatLen);
        if (beat > this.lastBeat && songTime >= this.chart.offset) {
            for (let b = Math.max(this.lastBeat + 1, 0); b <= beat; b++) {
                events.push({ type: 'beat', beat: b, bar: Math.floor(b / 4), songTime });
            }
            this.lastBeat = beat;
        }

        // Auto-miss
        while (this.cursor < this.pending.length && songTime - this.pending[this.cursor].time > MISS_LATE_MS) {
            const note = this.pending[this.cursor];
            this.cursor++;
            this.score.register('MISS', songTime);
            events.push({ type: 'miss', note, songTime });
        }

        // Holds: tick & auto-complete when the duration elapses while held
        for (const [lane, h] of [...this.activeHolds.entries()]) {
            const end = h.note.time + (h.note.duration ?? 0);
            if (songTime >= end) {
                this.activeHolds.delete(lane);
                const points = this.score.register('PERFECT', songTime);
                events.push({ type: 'hold-end', note: h.note, completed: true, progress: 1, points, songTime });
            } else if (songTime - h.lastTick >= beatLen / 2) {
                h.lastTick = songTime;
                const progress = (songTime - h.note.time) / (h.note.duration ?? 1);
                events.push({ type: 'hold-tick', note: h.note, progress: Math.max(0, Math.min(1, progress)), songTime });
            }
        }

        // Fever edge
        const feverNow = this.score.feverActive(songTime);
        if (feverNow && !this.feverWasActive) events.push({ type: 'fever-start', songTime });
        this.feverWasActive = feverNow;

        // End
        if (songTime >= this.chart.lengthMs && this.cursor >= this.pending.length && this.activeHolds.size === 0) {
            this.ended = true;
            events.push({ type: 'end', songTime });
        }
        return events;
    }

    private removePending(idx: number) {
        // Keep array sorted & cursor valid: swap-remove is unsafe, so splice.
        this.pending.splice(idx, 1);
    }
}
