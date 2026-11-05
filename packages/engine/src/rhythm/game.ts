/**
 * @b3js/engine — RhythmMiniGame base class
 *
 * A mini-game is a *pure* rules object: it builds a chart from a seed, reacts
 * to session events by mutating its DeFi model, and exposes HUD lines and a
 * run summary. Rendering, input and audio live in the arcade layer, so the
 * same game runs headless in tests, on desktop, mobile, gamepad and XR.
 */

import type { Chart, SessionEvent, Judgement } from './core';
import { JUDGEMENT_EFFICIENCY } from './core';

export type Difficulty = 'easy' | 'normal' | 'hard' | 'insane';

export interface DifficultyProfile {
    bpm: number;
    density: number;
    bars: number;
    subdivision: number;
    holdChance: number;
}

export const DIFFICULTY_PROFILES: Readonly<Record<Difficulty, DifficultyProfile>> = {
    easy:   { bpm: 96,  density: 0.35, bars: 16, subdivision: 1, holdChance: 0.15 },
    normal: { bpm: 120, density: 0.5,  bars: 24, subdivision: 2, holdChance: 0.2 },
    hard:   { bpm: 144, density: 0.62, bars: 32, subdivision: 2, holdChance: 0.25 },
    insane: { bpm: 172, density: 0.72, bars: 40, subdivision: 4, holdChance: 0.3 },
};

/** Score multiplier applied to the run's final score per difficulty. */
export const DIFFICULTY_SCORE_MULT: Readonly<Record<Difficulty, number>> = { easy: 1, normal: 1.5, hard: 2.25, insane: 3.5 };

/** Floating feedback shown by the renderer (and spoken by haptics). */
export interface GameFeedback {
    text: string;
    /** 'good' | 'bad' | 'neutral' | 'epic' drives colour & haptic strength. */
    tone: 'good' | 'bad' | 'neutral' | 'epic';
    lane?: number;
}

export interface HudLine {
    label: string;
    value: string;
    /** Optional 0..1 bar (e.g. health factor, fever). */
    bar?: number;
    tone?: 'good' | 'bad' | 'neutral';
}

export interface RunSummary {
    gameId: string;
    headline: string;
    /** Extra points the DeFi outcome adds to the rhythm score. */
    bonusPoints: number;
    /** Net QUAI (wei) the player's simulated wallet gained in this run. */
    quaiDeltaWei: bigint;
    /** Game-specific stats for the results screen. */
    stats: Record<string, string>;
}

export interface MiniGameMeta {
    id: string;
    title: string;
    tagline: string;
    /** What the player learns — shown on the card and results screen. */
    lesson: string;
    color: string;
    icon: string;
    lanes: number;
    laneLabels: string[];
    /** Endless games end on a fail state instead of chart end. */
    endless: boolean;
}

export abstract class RhythmMiniGame<P = unknown> {
    abstract readonly meta: MiniGameMeta;
    public difficulty: Difficulty = 'normal';

    /** Build a deterministic chart for a seed and difficulty. */
    abstract buildChart(seed: string, difficulty: Difficulty): Chart<P>;

    /** React to a session event; return feedback to display. */
    abstract onEvent(e: SessionEvent<P>): GameFeedback[];

    /** HUD lines for the renderer (called every frame — keep it cheap). */
    abstract hud(): HudLine[];

    /** Endless games return true when the player has failed. */
    isGameOver(): boolean { return false; }

    /** Results for the progression layer. */
    abstract summary(): RunSummary;

    /** Reset the DeFi model for a fresh run. */
    abstract reset(): void;

    /** Accent (for 3D visualizers): 0..1 intensity of the DeFi "heat". */
    intensity(): number { return 0; }

    protected efficiency(j: Judgement): number { return JUDGEMENT_EFFICIENCY[j]; }
}
