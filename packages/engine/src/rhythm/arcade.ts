/**
 * @b3js/engine — RhythmArcade
 *
 * The orchestrator that turns a RhythmMiniGame + RhythmSession into a
 * playable thing on every platform:
 *
 *   input (keys / touch / gamepad / XR)  →  Conductor (song time)
 *       →  RhythmSession (judgement)  →  MiniGame (DeFi model)
 *       →  CanvasRenderer · BeatSynth · haptics · DOM events
 *       →  PlayerProgress (XP, streaks, quests, bests)
 *
 * Headless-safe: with no `document` the arcade still runs charts via
 * `tick()` so Bun tests can drive full runs deterministically.
 *
 * DOM events (window): b3js:rhythm:start | beat | judgement | fever |
 *                      feedback | end | phase
 */

import { Conductor, RhythmSession, beatMs } from './core';
import type { Chart, SessionEvent, Judgement, ScoreSnapshot } from './core';
import { RhythmMiniGame, DIFFICULTY_SCORE_MULT } from './game';
import type { Difficulty, GameFeedback, MiniGameMeta, RunSummary } from './game';
import { InputAdapter, keyLabelsForLanes, nowMs } from './input';
import type { LaneInputEvent } from './input';
import { BeatSynth } from './audio';
import { CanvasRenderer } from './renderer';
import type { ArcadePhase, FloatingText, LaneFlash, RenderState } from './renderer';
import { PlayerProgress } from './progression';
import type { ArcadeView } from './view';
import { XRArcade } from './xr/XRArcade';
import type { RunOutcome, KeyValueStorage } from './progression';
import { BurnBeat } from './games/BurnBeat';
import { SwapTempo } from './games/SwapTempo';
import { YieldStairway } from './games/YieldStairway';
import { LiquidationDodge } from './games/LiquidationDodge';
import { MergePulse } from './games/MergePulse';

export type GameFactory = () => RhythmMiniGame<any>;

export interface StartOptions {
    difficulty?: Difficulty;
    seed?: string;
    /** Element to overlay the canvas on (defaults to the engine viewport / body). */
    container?: HTMLElement | null;
    /** Skip the audio engine (tests / silent mode). */
    silent?: boolean;
    /** Draw the 2D canvas overlay (default true). XR runs turn it off. */
    canvas?: boolean;
}

export interface ArcadeSnapshot {
    phase: ArcadePhase;
    gameId: string | null;
    meta: MiniGameMeta | null;
    difficulty: Difficulty;
    seed: string;
    score: ScoreSnapshot | null;
    hud: ReturnType<RhythmMiniGame['hud']>;
    results: { summary: RunSummary; outcome: RunOutcome; finalScore: number } | null;
    progress: PlayerProgress['data'];
    games: MiniGameMeta[];
    calibrationOffsetMs: number;
    muted: boolean;
    /** 0..1 — current DeFi intensity for visualizers. */
    intensity: number;
    bpm: number;
    hapticsEnabled: boolean;
}

export type ArcadeEvent =
    | { type: 'start'; gameId: string; difficulty: Difficulty; seed: string }
    | { type: 'beat'; beat: number; bar: number; bpm: number; intensity: number }
    | { type: 'judgement'; judgement: Judgement; lane: number; combo: number; multiplier: number }
    | { type: 'fever' }
    | { type: 'feedback'; feedback: GameFeedback }
    | { type: 'end'; summary: RunSummary; outcome: RunOutcome; finalScore: number; score: ScoreSnapshot }
    | { type: 'phase'; phase: ArcadePhase };

type Listener = (e: ArcadeEvent) => void;

const TIPS = [
    'PERFECT hits fill FEVER — full meter doubles everything for 16 beats.',
    'Combos ×2 at 10, ×4 at 25, ×8 at 50. Don\'t drop it.',
    'Tapping with nothing to hit is free. Drum along.',
    'Off by a lot? Calibrate in the Arcade tab.',
    'Hold notes: press on the head, release on the tail.',
];

export class RhythmArcade {
    public readonly progress: PlayerProgress;
    public readonly input = new InputAdapter();
    public readonly synth = new BeatSynth();
    public readonly conductor: Conductor;
    private factories = new Map<string, GameFactory>();
    private listeners = new Set<Listener>();

    public phase: ArcadePhase = 'idle';
    public game: RhythmMiniGame<any> | null = null;
    public session: RhythmSession<any> | null = null;
    public chart: Chart<any> | null = null;
    public difficulty: Difficulty = 'normal';
    public seed = '';
    public results: ArcadeSnapshot['results'] = null;
    public hapticsEnabled = true;
    /** WebXR arcade (stage + drum-pad input + picker). Null when headless. */
    public readonly xr: XRArcade | null;
    private views: ArcadeView[] = [];

    private renderer: CanvasRenderer | null = null;
    private useCanvas = true;
    private container: HTMLElement | null = null;
    private raf = 0;
    private floating: FloatingText[] = [];
    private flashes: LaneFlash[] = [];
    private heldLanes = new Set<number>();
    private lastBeatAt = 0;
    private lastBeat = -1;
    private tip = TIPS[0];
    private silent = false;
    private finalScore = 0;
    private calib: { samples: number[]; beatsLeft: number; offsetMs: number; startedWall: number } | null = null;
    private unsubInput: (() => void) | null = null;
    private onVisibility = () => { if (typeof document !== 'undefined' && document.hidden && this.phase === 'playing') this.pause(); };
    private onKey = (ev: KeyboardEvent) => {
        if (ev.code === 'Escape' && this.phase !== 'idle') { ev.preventDefault(); this.stop(); }
        else if (ev.code === 'KeyR' && (this.phase === 'results' || this.phase === 'paused')) { ev.preventDefault(); this.restart(); }
        else if (ev.code === 'KeyP' && (this.phase === 'playing' || this.phase === 'paused')) { ev.preventDefault(); this.phase === 'playing' ? this.pause() : this.resume(); }
    };

    constructor(
        private readonly engine: any = null,
        opts: { storage?: KeyValueStorage | null; now?: () => number } = {},
    ) {
        this.progress = new PlayerProgress(opts.storage === undefined ? undefined : opts.storage, opts.now);
        this.conductor = new Conductor(opts.now ?? nowMs);
        this.conductor.calibrationOffsetMs = this.progress.data.calibrationOffsetMs;
        this.registerGame('burn-beat', () => new BurnBeat());
        this.registerGame('swap-tempo', () => new SwapTempo());
        this.registerGame('yield-stairway', () => new YieldStairway());
        this.registerGame('liquidation-dodge', () => new LiquidationDodge());
        this.registerGame('merge-pulse', () => new MergePulse());
        this.unsubInput = this.input.onInput(e => this.handleInput(e));
        this.xr = engine && typeof document !== 'undefined' ? new XRArcade(this, engine) : null;
    }

    /** Add a view (e.g. the XR stage) that is drawn alongside the canvas. */
    attachView(v: ArcadeView) { if (!this.views.includes(v)) this.views.push(v); }
    detachView(v: ArcadeView) { this.views = this.views.filter(x => x !== v); }

    // ── Registry ───────────────────────────────────────────────────
    registerGame(id: string, factory: GameFactory) { this.factories.set(id, factory); }
    listGames(): MiniGameMeta[] { return [...this.factories.values()].map(f => f().meta); }
    hasGame(id: string) { return this.factories.has(id); }

    on(fn: Listener): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }

    private emit(e: ArcadeEvent) {
        for (const l of this.listeners) { try { l(e); } catch (err) { console.warn('B3JS Rhythm: listener error', err); } }
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
            window.dispatchEvent(new CustomEvent(`b3js:rhythm:${e.type}`, { detail: e }));
        }
    }

    private setPhase(p: ArcadePhase) { if (this.phase === p) return; this.phase = p; this.emit({ type: 'phase', phase: p }); }

    // ── Lifecycle ──────────────────────────────────────────────────
    async start(gameId: string, opts: StartOptions = {}): Promise<boolean> {
        const factory = this.factories.get(gameId);
        if (!factory) { console.warn(`B3JS Rhythm: unknown game "${gameId}"`); return false; }
        const difficulty = opts.difficulty ?? this.difficulty;
        if (!this.progress.isUnlocked(difficulty)) { console.warn(`B3JS Rhythm: ${difficulty} locked until level ${this.unlockLevel(difficulty)}`); return false; }
        this.teardownRun(false);

        this.difficulty = difficulty;
        this.seed = opts.seed ?? `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
        this.silent = !!opts.silent;
        this.useCanvas = opts.canvas !== false;
        this.game = factory();
        this.game.reset();
        this.chart = this.game.buildChart(this.seed, difficulty);
        this.session = new RhythmSession(this.chart);
        this.results = null;
        this.floating = []; this.flashes = []; this.heldLanes.clear();
        this.lastBeat = -1; this.finalScore = 0;
        this.tip = TIPS[Math.floor(Math.random() * TIPS.length)];

        // Presentation (browser only)
        if (typeof document !== 'undefined') {
            this.container = opts.container ?? this.defaultContainer();
            if (this.container && this.useCanvas) {
                if (getComputedStyle(this.container).position === 'static') this.container.style.position = 'relative';
                this.renderer = new CanvasRenderer(this.container);
                this.input.laneAt = this.renderer.laneAt;
                this.input.attach(this.renderer.canvas, this.chart.lanes);
            } else {
                // No overlay (XR): keyboard + gamepad still work; pointer does nothing.
                this.input.laneAt = () => -1;
                this.input.attach(document.body, this.chart.lanes);
            }
            window.addEventListener('keydown', this.onKey, { capture: true });
            document.addEventListener('visibilitychange', this.onVisibility);
            if (!this.silent) await this.synth.init();
            try { await this.engine?.audio?.resume?.(); } catch { /* optional */ }
        }

        const t0 = this.conductor['now']();
        this.conductor.start(t0);
        if (!this.silent && this.synth.ready) this.synth.startTrack(this.chart.bpm, this.chart.offset, t0 - this.conductor.calibrationOffsetMs);
        this.setPhase('countdown');
        this.emit({ type: 'start', gameId, difficulty, seed: this.seed });
        this.loop();
        return true;
    }

    restart() {
        if (!this.game) return;
        const id = this.game.meta.id;
        void this.start(id, { difficulty: this.difficulty, container: this.container, silent: this.silent, canvas: this.useCanvas });
    }

    pause() {
        if (this.phase !== 'playing' && this.phase !== 'countdown') return;
        this.conductor.pause();
        this.synth.stopTrack();
        this.input.releaseAll();
        this.setPhase('paused');
    }

    resume() {
        if (this.phase !== 'paused') return;
        const t = this.conductor['now']();
        this.conductor.resume(t);
        if (!this.silent && this.synth.ready && this.chart) {
            // Re-anchor the synth so song time 0 maps to the new wall offset
            this.synth.startTrack(this.chart.bpm, this.chart.offset, t - this.conductor.songTime(t) - this.conductor.calibrationOffsetMs);
        }
        this.setPhase('playing');
    }

    /** Stop and tear everything down (Esc). */
    stop() {
        this.teardownRun(true);
        this.setPhase('idle');
    }

    private teardownRun(clearGame: boolean) {
        if (this.raf && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this.raf);
        this.raf = 0;
        this.conductor.stop();
        this.synth.stopTrack();
        this.input.detach();
        if (typeof window !== 'undefined') window.removeEventListener('keydown', this.onKey, { capture: true } as any);
        if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
        this.renderer?.dispose(); this.renderer = null;
        this.calib = null;
        if (clearGame) { this.game = null; this.session = null; this.chart = null; }
    }

    dispose() { this.teardownRun(true); this.xr?.unmount(); this.unsubInput?.(); this.synth.dispose(); }

    private defaultContainer(): HTMLElement | null {
        const vp = this.engine?.renderer?.domElement?.parentElement as HTMLElement | undefined;
        return vp ?? document.body;
    }

    unlockLevel(d: Difficulty): number {
        return ({ easy: 1, normal: 1, hard: 3, insane: 6 } as Record<Difficulty, number>)[d];
    }

    // ── Calibration ────────────────────────────────────────────────
    async startCalibration(opts: { container?: HTMLElement | null; beats?: number } = {}) {
        this.teardownRun(true);
        const bpm = 100;
        this.chart = { bpm, lanes: 1, offset: 0, notes: [], lengthMs: 1e9, seed: 'calibration' };
        this.calib = { samples: [], beatsLeft: opts.beats ?? 12, offsetMs: this.conductor.calibrationOffsetMs, startedWall: 0 };
        this.lastBeat = -1;
        if (typeof document !== 'undefined') {
            this.container = opts.container ?? this.defaultContainer();
            if (this.container) {
                this.renderer = new CanvasRenderer(this.container);
                this.input.laneAt = () => 0;
                this.input.attach(this.renderer.canvas, 1);
                window.addEventListener('keydown', this.onKey, { capture: true });
            }
            await this.synth.init();
        }
        const t0 = this.conductor['now']();
        this.conductor.calibrationOffsetMs = 0; // measure raw
        this.conductor.start(t0);
        this.calib.startedWall = t0;
        if (this.synth.ready) this.synth.startTrack(bpm, 0, t0);
        this.setPhase('calibrating');
        this.loop();
    }

    private calibrationTap(wallMs: number) {
        if (!this.calib || !this.chart) return;
        const song = this.conductor.toSongTime(wallMs);
        const bl = beatMs(this.chart.bpm);
        if (song < bl) return; // ignore the first beat
        let d = ((song % bl) + bl) % bl;
        if (d > bl / 2) d -= bl;
        this.calib.samples.push(d);
        this.calib.beatsLeft--;
        const sorted = [...this.calib.samples].sort((a, b) => a - b);
        this.calib.offsetMs = sorted[Math.floor(sorted.length / 2)]; // median — robust to one fat-finger
        if (this.calib.beatsLeft <= 0) {
            this.progress.setCalibration(this.calib.offsetMs);
            this.conductor.calibrationOffsetMs = this.progress.data.calibrationOffsetMs;
            this.stop();
        }
    }

    setCalibrationOffset(ms: number) {
        this.progress.setCalibration(ms);
        this.conductor.calibrationOffsetMs = this.progress.data.calibrationOffsetMs;
    }

    // ── Input ──────────────────────────────────────────────────────
    private handleInput(e: LaneInputEvent) {
        if (this.phase === 'calibrating') { if (e.down) this.calibrationTap(e.timeMs); return; }
        if (this.phase === 'results') { if (e.down) this.restart(); return; }
        if (this.phase === 'paused') { if (e.down) this.resume(); return; }
        if (this.phase !== 'playing' && this.phase !== 'countdown') return;
        if (!this.session) return;
        const song = this.conductor.toSongTime(e.timeMs);
        if (e.down) {
            this.heldLanes.add(e.lane);
            const ev = this.session.hit(e.lane, song);
            if (ev) this.processEvents([ev]);
        } else {
            this.heldLanes.delete(e.lane);
            const ev = this.session.release(e.lane, song);
            if (ev) this.processEvents([ev]);
        }
    }

    /** Inject a lane press from anywhere (XR controllers, logic bricks, tests). */
    press(lane: number, down = true, timeMs?: number) { this.input.press(lane, down, timeMs); }

    // ── Loop ───────────────────────────────────────────────────────
    private loop = () => {
        if (typeof requestAnimationFrame === 'undefined') return;
        this.raf = requestAnimationFrame(this.loop);
        this.tick(this.conductor['now']());
    };

    /** Advance the arcade to wall time `nowWall` (ms). Public for headless tests. */
    tick(nowWall: number) {
        if (this.phase === 'idle') { this.xr?.update(); return; }
        this.input.pollGamepads(nowWall);
        this.xr?.update();
        const song = this.conductor.songTime(nowWall);

        if (this.phase === 'calibrating' && this.chart) {
            if (!this.silent) this.synth.schedule(song, nowWall);
            const bl = beatMs(this.chart.bpm);
            const beat = Math.floor(song / bl);
            if (beat > this.lastBeat) { this.lastBeat = beat; this.lastBeatAt = nowWall; this.haptic('neutral'); }
            this.draw(song, nowWall);
            return;
        }

        if (this.session && this.chart && (this.phase === 'countdown' || this.phase === 'playing')) {
            if (this.phase === 'countdown' && song >= this.chart.offset - 50) this.setPhase('playing');
            if (!this.silent) this.synth.schedule(song, nowWall);
            const events = this.session.update(song);
            this.processEvents(events, nowWall);
            if (this.game?.isGameOver() && this.phase === 'playing') this.finish(nowWall, true);
        }
        // Expire transient visuals
        this.floating = this.floating.filter(f => nowWall - f.bornAt < 1500);
        this.flashes = this.flashes.filter(f => nowWall - f.at < 400);
        this.draw(song, nowWall);
    }

    private processEvents(events: SessionEvent<any>[], nowWall: number = this.conductor['now']()) {
        if (!this.game || !this.session) return;
        for (const ev of events) {
            const fb = this.game.onEvent(ev);
            switch (ev.type) {
                case 'hit':
                case 'hold-start':
                    this.flashes.push({ lane: ev.note.lane, judgement: ev.judgement, at: nowWall });
                    if (!this.silent) this.synth.playJudgement(ev.judgement, ev.note.lane);
                    this.haptic(ev.judgement === 'PERFECT' ? 'good' : 'neutral');
                    this.emit({ type: 'judgement', judgement: ev.judgement, lane: ev.note.lane, combo: this.session.score.combo, multiplier: this.session.score.multiplier(ev.songTime) });
                    break;
                case 'miss':
                    this.flashes.push({ lane: ev.note.lane, judgement: 'MISS', at: nowWall });
                    if (!this.silent) this.synth.playJudgement('MISS', ev.note.lane);
                    this.haptic('bad');
                    this.emit({ type: 'judgement', judgement: 'MISS', lane: ev.note.lane, combo: 0, multiplier: 1 });
                    break;
                case 'hold-end':
                    this.flashes.push({ lane: ev.note.lane, judgement: ev.completed ? 'PERFECT' : 'MISS', at: nowWall });
                    if (!this.silent) this.synth.playJudgement(ev.completed ? 'PERFECT' : 'MISS', ev.note.lane);
                    break;
                case 'beat':
                    this.lastBeatAt = nowWall;
                    this.emit({ type: 'beat', beat: ev.beat, bar: ev.bar, bpm: this.chart!.bpm, intensity: this.game.intensity() });
                    break;
                case 'fever-start':
                    if (!this.silent) this.synth.playFever();
                    this.haptic('epic');
                    this.floating.push({ text: '🔥 FEVER ×2', tone: 'epic', bornAt: nowWall });
                    this.emit({ type: 'fever' });
                    break;
                case 'end':
                    this.finish(nowWall, false);
                    break;
            }
            for (const f of fb) {
                this.floating.push({ ...f, bornAt: nowWall });
                if (f.tone === 'epic' && !this.silent) this.synth.playEpic();
                if (f.tone === 'epic') this.haptic('epic');
                this.emit({ type: 'feedback', feedback: f });
            }
        }
    }

    private finish(nowWall: number, failed: boolean) {
        if (!this.game || !this.session || this.phase === 'results') return;
        const song = this.conductor.songTime(nowWall);
        if (!this.session.ended) { this.session.ended = true; this.game.onEvent({ type: 'end', songTime: song } as SessionEvent<any>); }
        const snap = this.session.score.snapshot(song);
        const summary = this.game.summary();
        const finalScore = Math.round((snap.score + summary.bonusPoints) * DIFFICULTY_SCORE_MULT[this.difficulty]);
        const outcome = this.progress.recordRun({ snap, summary, difficulty: this.difficulty, seed: this.seed, finalScore });
        this.finalScore = finalScore;
        this.results = { summary, outcome, finalScore };
        this.synth.stopTrack();
        if (!this.silent) { failed ? this.synth.playFail() : this.synth.playEpic(); }
        this.haptic(failed ? 'bad' : 'epic');
        this.input.releaseAll(nowWall);
        this.heldLanes.clear();
        this.setPhase('results');
        this.emit({ type: 'end', summary, outcome, finalScore, score: snap });
    }

    // ── Output ─────────────────────────────────────────────────────
    private haptic(tone: GameFeedback['tone']) {
        if (!this.hapticsEnabled) return;
        const pattern = tone === 'epic' ? [30, 40, 60] : tone === 'bad' ? [60] : tone === 'good' ? [15] : [8];
        try { (navigator as any)?.vibrate?.(pattern); } catch { /* unsupported */ }
        try {
            const h = this.engine?.haptics;
            if (h?.getStatus?.()?.connected) {
                const strength = tone === 'epic' ? 100 : tone === 'bad' ? 70 : tone === 'good' ? 45 : 20;
                h.triggerDots('VestFront', new Array(20).fill(strength), pattern.reduce((a, b) => a + b, 0));
            }
        } catch { /* optional hardware */ }
    }

    private draw(song: number, nowWall: number) {
        if (!this.renderer && this.views.length === 0) return;
        const state: RenderState = {
            phase: this.phase,
            songTime: song,
            wallTime: nowWall,
            chart: this.chart,
            session: this.session,
            meta: this.game?.meta ?? null,
            score: this.session ? this.session.score.snapshot(song) : null,
            hud: this.game?.hud() ?? [],
            floating: this.floating,
            flashes: this.flashes,
            heldLanes: this.heldLanes,
            approachMs: this.approachMs(),
            keyLabels: keyLabelsForLanes(this.chart?.lanes ?? 4),
            difficulty: this.difficulty,
            results: this.results,
            calibration: this.calib ? { samples: this.calib.samples, beatsLeft: this.calib.beatsLeft, offsetMs: this.calib.offsetMs } : null,
            lastBeatAt: this.lastBeatAt,
            bpm: this.chart?.bpm ?? 120,
            tip: this.tip,
        };
        this.renderer?.render(state);
        for (const v of this.views) v.render(state);
    }

    /** Notes are visible for ~4 beats; faster on harder difficulties. */
    approachMs(): number {
        const bl = beatMs(this.chart?.bpm ?? 120);
        const beats = this.difficulty === 'easy' ? 4.5 : this.difficulty === 'normal' ? 4 : this.difficulty === 'hard' ? 3.5 : 3;
        return bl * beats;
    }

    setMuted(m: boolean) { this.synth.setMuted(m); }

    getSnapshot(): ArcadeSnapshot {
        const song = this.conductor.started ? this.conductor.songTime() : 0;
        return {
            phase: this.phase,
            gameId: this.game?.meta.id ?? null,
            meta: this.game?.meta ?? null,
            difficulty: this.difficulty,
            seed: this.seed,
            score: this.session ? this.session.score.snapshot(song) : null,
            hud: this.game?.hud() ?? [],
            results: this.results,
            progress: this.progress.data,
            games: this.listGames(),
            calibrationOffsetMs: this.conductor.calibrationOffsetMs,
            muted: this.synth.muted,
            intensity: this.game?.intensity() ?? 0,
            bpm: this.chart?.bpm ?? 0,
            hapticsEnabled: this.hapticsEnabled,
        };
    }
}
