/**
 * @b3js/engine — Rhythm progression (the "one more run" layer)
 *
 * XP & levels, difficulty unlocks, per-game/per-difficulty best scores,
 * daily streaks and three seeded daily quests. Storage is injected so it
 * runs headless; the browser default is localStorage.
 */

import { mulberry32 } from './core';
import type { ScoreSnapshot } from './core';
import type { Difficulty, RunSummary } from './game';

export interface KeyValueStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

export const PROGRESS_STORAGE_KEY = 'B3JS_RHYTHM_PROGRESS_V1';

export interface BestScore {
    score: number;
    grade: ScoreSnapshot['grade'];
    accuracy: number;
    maxCombo: number;
    at: number;
}

export interface RunRecord {
    gameId: string;
    difficulty: Difficulty;
    score: number;
    grade: ScoreSnapshot['grade'];
    accuracy: number;
    maxCombo: number;
    perfects: number;
    quaiDeltaWei: string;
    headline: string;
    at: number;
    seed: string;
}

export interface DailyQuest {
    id: string;
    text: string;
    target: number;
    progress: number;
    xp: number;
    done: boolean;
}

export interface ProgressData {
    xp: number;
    level: number;
    totalRuns: number;
    streakDays: number;
    lastPlayDay: string | null;
    bests: Record<string, BestScore>;
    recent: RunRecord[];
    questDay: string | null;
    quests: DailyQuest[];
    /** Lifetime simulated QUAI delta per game (wei as string). */
    lifetimeQuai: Record<string, string>;
    calibrationOffsetMs: number;
}

export interface RunOutcome {
    xpGained: number;
    leveledUp: boolean;
    level: number;
    newBest: boolean;
    questsCompleted: DailyQuest[];
    streakDays: number;
    streakExtended: boolean;
}

export const DIFFICULTY_UNLOCK_LEVEL: Readonly<Record<Difficulty, number>> = { easy: 1, normal: 1, hard: 3, insane: 6 };

/** XP required to go from `level` to `level + 1`. */
export function xpForLevel(level: number): number {
    return Math.round(120 * Math.pow(level, 1.45));
}

type QuestDef = { id: string; text: string; target: number; xp: number; measure: (ctx: QuestCtx) => number };
interface QuestCtx { snap: ScoreSnapshot; summary: RunSummary; difficulty: Difficulty }

const QUEST_POOL: QuestDef[] = [
    { id: 'perfects-60', text: 'Land 60 PERFECTs (any games)', target: 60, xp: 150, measure: c => c.snap.counts.PERFECT },
    { id: 'combo-30', text: 'Reach a 30 combo', target: 30, xp: 120, measure: c => c.snap.maxCombo >= 30 ? 30 : c.snap.maxCombo },
    { id: 'runs-3', text: 'Finish 3 runs', target: 3, xp: 100, measure: () => 1 },
    { id: 'grade-a', text: 'Clear a run with grade A or S', target: 1, xp: 160, measure: c => (c.snap.grade === 'A' || c.snap.grade === 'S') ? 1 : 0 },
    { id: 'burn-5', text: 'Burn 5 QUAI of $QAXE in Burn Beat', target: 5, xp: 180, measure: c => c.summary.gameId === 'burn-beat' ? parseFloat(c.summary.stats['Burned'] ?? '0') : 0 },
    { id: 'survive-80', text: 'Survive 80 beats in Liquidation Dodge', target: 80, xp: 180, measure: c => c.summary.gameId === 'liquidation-dodge' ? Math.min(80, parseInt(c.summary.stats['Beats survived'] ?? '0', 10)) : 0 },
    { id: 'merge-3', text: 'Mine 3 merged blocks in Merge Pulse', target: 3, xp: 180, measure: c => c.summary.gameId === 'merge-pulse' ? parseInt(c.summary.stats['Merged blocks'] ?? '0', 10) : 0 },
    { id: 'yield-10', text: 'Claim 10 QUAI of yield in Yield Stairway', target: 10, xp: 160, measure: c => c.summary.gameId === 'yield-stairway' ? parseFloat(c.summary.stats['Yield claimed'] ?? '0') : 0 },
    { id: 'swap-profit', text: 'Finish Swap Tempo in profit', target: 1, xp: 160, measure: c => c.summary.gameId === 'swap-tempo' && c.summary.quaiDeltaWei > 0n ? 1 : 0 },
    { id: 'hard-clear', text: 'Clear any game on Hard or Insane', target: 1, xp: 200, measure: c => (c.difficulty === 'hard' || c.difficulty === 'insane') ? 1 : 0 },
];

export function utcDay(nowMs: number): string {
    return new Date(nowMs).toISOString().slice(0, 10);
}

export function questsForDay(day: string): DailyQuest[] {
    const rand = mulberry32(`quests:${day}`);
    const pool = [...QUEST_POOL];
    const out: DailyQuest[] = [];
    while (out.length < 3 && pool.length) {
        const i = Math.floor(rand() * pool.length);
        const q = pool.splice(i, 1)[0];
        out.push({ id: q.id, text: q.text, target: q.target, progress: 0, xp: q.xp, done: false });
    }
    return out;
}

export class PlayerProgress {
    public data: ProgressData;

    constructor(private readonly storage: KeyValueStorage | null = defaultStorage(), private readonly now: () => number = () => Date.now()) {
        this.data = this.load();
        this.refreshQuests();
    }

    private static fresh(): ProgressData {
        return { xp: 0, level: 1, totalRuns: 0, streakDays: 0, lastPlayDay: null, bests: {}, recent: [], questDay: null, quests: [], lifetimeQuai: {}, calibrationOffsetMs: 0 };
    }

    private load(): ProgressData {
        try {
            const raw = this.storage?.getItem(PROGRESS_STORAGE_KEY);
            if (raw) return { ...PlayerProgress.fresh(), ...JSON.parse(raw) };
        } catch { /* corrupt → fresh */ }
        return PlayerProgress.fresh();
    }

    save() {
        try { this.storage?.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(this.data)); } catch { /* quota / private mode */ }
    }

    /** Roll daily quests when the UTC day changes. */
    refreshQuests() {
        const day = utcDay(this.now());
        if (this.data.questDay !== day) {
            this.data.questDay = day;
            this.data.quests = questsForDay(day);
            this.save();
        }
    }

    isUnlocked(d: Difficulty): boolean { return this.data.level >= DIFFICULTY_UNLOCK_LEVEL[d]; }

    bestKey(gameId: string, d: Difficulty) { return `${gameId}:${d}`; }
    best(gameId: string, d: Difficulty): BestScore | undefined { return this.data.bests[this.bestKey(gameId, d)]; }

    xpToNext(): number { return xpForLevel(this.data.level); }

    setCalibration(ms: number) { this.data.calibrationOffsetMs = Math.max(-250, Math.min(250, Math.round(ms))); this.save(); }

    recordRun(args: { snap: ScoreSnapshot; summary: RunSummary; difficulty: Difficulty; seed: string; finalScore: number }): RunOutcome {
        this.refreshQuests();
        const { snap, summary, difficulty, seed, finalScore } = args;
        const d = this.data;
        const day = utcDay(this.now());

        // Streak
        let streakExtended = false;
        if (d.lastPlayDay !== day) {
            const yesterday = utcDay(this.now() - 86_400_000);
            d.streakDays = d.lastPlayDay === yesterday ? d.streakDays + 1 : 1;
            d.lastPlayDay = day;
            streakExtended = true;
        }

        // Bests
        const key = this.bestKey(summary.gameId, difficulty);
        const prev = d.bests[key];
        const newBest = !prev || finalScore > prev.score;
        if (newBest) d.bests[key] = { score: finalScore, grade: snap.grade, accuracy: snap.accuracy, maxCombo: snap.maxCombo, at: this.now() };

        // Lifetime QUAI
        const life = BigInt(d.lifetimeQuai[summary.gameId] ?? '0') + summary.quaiDeltaWei;
        d.lifetimeQuai[summary.gameId] = life.toString();

        // Quests
        const completed: DailyQuest[] = [];
        for (const q of d.quests) {
            if (q.done) continue;
            const def = QUEST_POOL.find(p => p.id === q.id);
            if (!def) continue;
            const m = def.measure({ snap, summary, difficulty });
            q.progress = q.id === 'runs-3' || q.id === 'perfects-60' ? q.progress + m : Math.max(q.progress, m);
            if (q.progress >= q.target) { q.progress = q.target; q.done = true; completed.push(q); }
        }

        // XP: score-based + accuracy + quests + streak bonus
        // sqrt keeps insane-difficulty score inflation from trivialising levels
        let xp = Math.round(Math.sqrt(Math.max(0, finalScore)) * 2) + Math.round(snap.accuracy * 60) + (snap.grade === 'S' ? 80 : snap.grade === 'A' ? 40 : 0);
        xp += completed.reduce((a, q) => a + q.xp, 0);
        if (streakExtended) xp += Math.min(200, d.streakDays * 20);
        d.xp += xp;
        let leveledUp = false;
        while (d.xp >= xpForLevel(d.level)) { d.xp -= xpForLevel(d.level); d.level++; leveledUp = true; }

        d.totalRuns++;
        d.recent.unshift({
            gameId: summary.gameId, difficulty, score: finalScore, grade: snap.grade, accuracy: snap.accuracy, maxCombo: snap.maxCombo,
            perfects: snap.counts.PERFECT, quaiDeltaWei: summary.quaiDeltaWei.toString(), headline: summary.headline, at: this.now(), seed,
        });
        if (d.recent.length > 20) d.recent.length = 20;
        this.save();
        return { xpGained: xp, leveledUp, level: d.level, newBest, questsCompleted: completed, streakDays: d.streakDays, streakExtended };
    }
}

function defaultStorage(): KeyValueStorage | null {
    try { if (typeof localStorage !== 'undefined') return localStorage; } catch { /* sandboxed */ }
    return null;
}
