import { describe, test, expect } from 'bun:test';
import {
    judge, generateChart, RhythmSession, ScoreState, Conductor, comboMultiplier, mulberry32,
    JUDGEMENT_WINDOWS_MS, MISS_LATE_MS, FEVER_MAX, FEVER_BEATS, beatMs,
} from '../src/rhythm/core';
import {
    ConstantProductPool, LendingPosition, StakingVault, QiQuaiConverter,
    tiersAtBeat, topTierAtBeat, mergedReward, toWei, applyBps, QUAI_WEI, BPS, QUAI_ZONES, QUAI_REGIONS,
} from '../src/rhythm/defi';
import { PlayerProgress, questsForDay, xpForLevel, DIFFICULTY_UNLOCK_LEVEL } from '../src/rhythm/progression';
import type { KeyValueStorage } from '../src/rhythm/progression';
import { RhythmArcade } from '../src/rhythm/arcade';
import { BurnBeat, BURNBEAT_SHARES_PER_BATCH } from '../src/rhythm/games/BurnBeat';
import { SwapTempo } from '../src/rhythm/games/SwapTempo';
import { YieldStairway } from '../src/rhythm/games/YieldStairway';
import { LiquidationDodge } from '../src/rhythm/games/LiquidationDodge';
import { MergePulse } from '../src/rhythm/games/MergePulse';
import { KEY_LAYOUTS, GAMEPAD_LAYOUTS, keyLabelsForLanes } from '../src/rhythm/input';
import type { Difficulty } from '../src/rhythm/game';

class MemStorage implements KeyValueStorage {
    map = new Map<string, string>();
    getItem(k: string) { return this.map.get(k) ?? null; }
    setItem(k: string, v: string) { this.map.set(k, v); }
}

/** Drive an arcade run headlessly with a scripted accuracy. */
async function autoplay(arcade: RhythmArcade, gameId: string, opts: { difficulty?: Difficulty; seed?: string; offsetMs?: number; missEvery?: number; clock: { t: number } }) {
    const clock = opts.clock;
    clock.t = 0;
    const ok = await arcade.start(gameId, { difficulty: opts.difficulty ?? 'normal', seed: opts.seed ?? 'test', silent: true });
    expect(ok).toBe(true);
    const chart = arcade.chart!;
    const notes = [...chart.notes].sort((a, b) => a.time - b.time);
    let i = 0;
    const holds: typeof notes = [];
    let count = 0;
    while (arcade.phase !== 'results' && arcade.phase !== 'idle' && clock.t < chart.lengthMs + 2000) {
        clock.t += 8;
        while (i < notes.length && notes[i].time + (opts.offsetMs ?? 0) <= clock.t) {
            const n = notes[i++];
            count++;
            if (opts.missEvery && count % opts.missEvery === 0) continue;
            arcade.press(n.lane, true, clock.t);
            if (n.type === 'hold') holds.push(n); else arcade.press(n.lane, false, clock.t + 4);
        }
        for (let k = holds.length - 1; k >= 0; k--) {
            const n = holds[k];
            if (clock.t >= n.time + (n.duration ?? 0) - 10) { arcade.press(n.lane, false, clock.t); holds.splice(k, 1); }
        }
        arcade.tick(clock.t);
    }
    return arcade.getSnapshot();
}

function makeArcade() {
    const clock = { t: 0 };
    const arcade = new RhythmArcade(null, { storage: new MemStorage(), now: () => clock.t });
    return { arcade, clock };
}

// ═══════════════════════════════════════════════════════════════════

describe('Rhythm core — judgement & scoring', () => {
    test('judgement windows are tiered and symmetric', () => {
        expect(judge(0)).toBe('PERFECT');
        expect(judge(JUDGEMENT_WINDOWS_MS.PERFECT)).toBe('PERFECT');
        expect(judge(-JUDGEMENT_WINDOWS_MS.PERFECT)).toBe('PERFECT');
        expect(judge(JUDGEMENT_WINDOWS_MS.PERFECT + 1)).toBe('GREAT');
        expect(judge(-JUDGEMENT_WINDOWS_MS.GREAT)).toBe('GREAT');
        expect(judge(JUDGEMENT_WINDOWS_MS.GOOD)).toBe('GOOD');
        expect(judge(JUDGEMENT_WINDOWS_MS.GOOD + 1)).toBe('MISS');
    });

    test('combo tiers multiply ×1 → ×2 → ×4 → ×8', () => {
        expect(comboMultiplier(0)).toBe(1);
        expect(comboMultiplier(9)).toBe(1);
        expect(comboMultiplier(10)).toBe(2);
        expect(comboMultiplier(25)).toBe(4);
        expect(comboMultiplier(50)).toBe(8);
        expect(comboMultiplier(500)).toBe(8);
    });

    test('a miss resets combo but keeps max combo', () => {
        const s = new ScoreState(120);
        for (let i = 0; i < 12; i++) s.register('PERFECT', i * 100);
        expect(s.combo).toBe(12);
        s.register('MISS', 1300);
        expect(s.combo).toBe(0);
        expect(s.maxCombo).toBe(12);
        expect(s.counts.MISS).toBe(1);
    });

    test('FEVER triggers at full meter, doubles the multiplier, and expires', () => {
        const s = new ScoreState(120);
        let t = 0;
        let fired = false;
        for (let i = 0; i < 20 && !fired; i++) { s.register('PERFECT', t); t += 100; fired = s.feverActive(t); }
        expect(fired).toBe(true);
        expect(s.fever).toBe(0);
        expect(s.multiplier(t)).toBe(comboMultiplier(s.combo) * 2);
        const afterMs = t + FEVER_BEATS * beatMs(120) + 1;
        expect(s.feverActive(afterMs)).toBe(false);
        expect(FEVER_MAX).toBe(100);
    });

    test('grade S requires ≥95% accuracy and zero misses', () => {
        const s = new ScoreState(120);
        for (let i = 0; i < 20; i++) s.register('PERFECT', i);
        expect(s.grade()).toBe('S');
        s.register('MISS', 100);
        expect(s.grade()).not.toBe('S');
    });
});

describe('Rhythm core — charts & sessions', () => {
    test('chart generation is deterministic for a seed', () => {
        const a = generateChart({ seed: 'abc', bpm: 120, lanes: 4, bars: 8, density: 0.5 });
        const b = generateChart({ seed: 'abc', bpm: 120, lanes: 4, bars: 8, density: 0.5 });
        const c = generateChart({ seed: 'abd', bpm: 120, lanes: 4, bars: 8, density: 0.5 });
        expect(a.notes.map(n => [n.time, n.lane])).toEqual(b.notes.map(n => [n.time, n.lane]));
        expect(JSON.stringify(a.notes)).not.toBe(JSON.stringify(c.notes));
        expect(a.notes.length).toBeGreaterThan(8);
        for (const n of a.notes) { expect(n.lane).toBeGreaterThanOrEqual(0); expect(n.lane).toBeLessThan(4); expect(n.time).toBeGreaterThanOrEqual(a.offset); }
    });

    test('mulberry32 is stable', () => {
        const r1 = mulberry32('seed'); const r2 = mulberry32('seed');
        expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()]);
    });

    test('session judges hits, auto-misses stale notes and ends', () => {
        const chart = { bpm: 120, lanes: 2, offset: 0, seed: 's', lengthMs: 2000, notes: [
            { id: 0, time: 500, lane: 0, type: 'tap' as const },
            { id: 1, time: 1000, lane: 1, type: 'tap' as const },
            { id: 2, time: 1500, lane: 0, type: 'tap' as const },
        ] };
        const s = new RhythmSession(chart);
        expect(s.hit(0, 100)).toBeNull();                 // nothing in window
        const h = s.hit(0, 520)!;                          // +20ms → PERFECT
        expect(h.type).toBe('hit');
        if (h.type === 'hit') { expect(h.judgement).toBe('PERFECT'); expect(h.deltaMs).toBe(20); }
        expect(s.hit(0, 1000)).toBeNull();                 // wrong lane for note 1
        const g = s.hit(1, 1100)!;                         // +100ms → GOOD
        if (g.type === 'hit') expect(g.judgement).toBe('GOOD');
        const ev = s.update(1500 + MISS_LATE_MS + 1);
        expect(ev.some(e => e.type === 'miss')).toBe(true);
        const end = s.update(2500);
        expect(end.some(e => e.type === 'end')).toBe(true);
        expect(s.ended).toBe(true);
        expect(s.score.counts).toEqual({ PERFECT: 1, GREAT: 0, GOOD: 1, MISS: 1 });
    });

    test('hold notes: full hold scores, early release is penalised', () => {
        const chart = { bpm: 120, lanes: 1, offset: 0, seed: 's', lengthMs: 4000, notes: [
            { id: 0, time: 500, lane: 0, type: 'hold' as const, duration: 1000 },
            { id: 1, time: 2000, lane: 0, type: 'hold' as const, duration: 1000 },
        ] };
        const s = new RhythmSession(chart);
        expect(s.hit(0, 500)!.type).toBe('hold-start');
        expect(s.isHolding(0)).toBe(true);
        s.update(800);
        const done = s.update(1500);
        const he = done.find(e => e.type === 'hold-end');
        expect(he && he.type === 'hold-end' && he.completed).toBe(true);
        expect(s.hit(0, 2000)!.type).toBe('hold-start');
        const rel = s.release(0, 2300)!;
        expect(rel.type === 'hold-end' && rel.completed).toBe(false);
        expect(s.score.counts.MISS).toBe(1);
    });

    test('session emits beats with bar numbers', () => {
        const chart = generateChart({ seed: 'b', bpm: 120, lanes: 4, bars: 2, density: 0.3, offset: 0 });
        const s = new RhythmSession(chart);
        const beats = s.update(beatMs(120) * 5 + 1).filter(e => e.type === 'beat');
        expect(beats.length).toBe(6);
        expect(beats[5].type === 'beat' && beats[5].bar).toBe(1);
    });

    test('conductor applies calibration and pause', () => {
        let now = 1000;
        const c = new Conductor(() => now);
        c.calibrationOffsetMs = 30;
        c.start();
        now = 1500;
        expect(c.songTime()).toBe(470);
        c.pause(); now = 2500; c.resume();
        now = 3000;
        expect(c.songTime()).toBe(970);
        expect(c.toSongTime(3100)).toBe(1070);
    });
});

// ═══════════════════════════════════════════════════════════════════

describe('DeFi primitives', () => {
    test('toWei is exact above float precision', () => {
        expect(toWei(100)).toBe(100n * QUAI_WEI);
        expect(toWei(0.000001)).toBe(10n ** 12n);
        expect(toWei(-1)).toBe(0n);
    });

    test('constant-product pool keeps k non-decreasing and charges fees', () => {
        const pool = new ConstantProductPool(toWei(1000), toWei(1000), 30n);
        const k0 = pool.k;
        const r = pool.swap('base', toWei(10));
        expect(r.fee).toBe(applyBps(toWei(10), 30n));
        expect(r.amountOut).toBeLessThan(toWei(10));
        expect(r.amountOut).toBeGreaterThan(toWei(9.8));
        expect(pool.k).toBeGreaterThanOrEqual(k0);
        expect(r.priceImpactBps).toBeGreaterThan(0n);
        expect(r.spotAfter).toBeLessThan(QUAI_WEI);
    });

    test('extra slippage only hurts the trader', () => {
        const a = new ConstantProductPool(toWei(1000), toWei(1000));
        const b = new ConstantProductPool(toWei(1000), toWei(1000));
        const clean = a.quote('base', toWei(5), 0n).amountOut;
        const sloppy = b.quote('base', toWei(5), 100n).amountOut;
        expect(sloppy).toBe(clean - applyBps(clean, 100n));
    });

    test('health factor math and liquidation', () => {
        const pos = new LendingPosition(toWei(100), toWei(60), QUAI_WEI, 8000n);
        expect(pos.healthFactorBps()).toBe((8000n * BPS) / 6000n); // 1.3333
        expect(pos.isLiquidatable()).toBe(false);
        pos.applyPriceShock(-3000); // −30%
        expect(pos.healthFactor()).toBeLessThan(1);
        expect(pos.isLiquidatable()).toBe(true);
        const seized = pos.liquidate(500n);
        expect(seized).toBeGreaterThan(0n);
        expect(pos.debt).toBe(0n);
        expect(pos.isLiquidatable()).toBe(false);
    });

    test('repay and interest move the health factor', () => {
        const pos = new LendingPosition(toWei(100), toWei(60), QUAI_WEI);
        const hf0 = pos.healthFactorBps();
        pos.accrueInterest(100n);
        expect(pos.healthFactorBps()).toBeLessThan(hf0);
        pos.repay(toWei(30));
        expect(pos.healthFactorBps()).toBeGreaterThan(hf0);
        const remaining = pos.debt;
        expect(pos.repay(toWei(1000))).toBe(remaining); // overpayment is clamped to the debt
        expect(pos.debt).toBe(0n);
    });

    test('staking compounds per beat and penalises early exit', () => {
        const v = new StakingVault(100n, 1000n); // 1%/beat, 10% penalty
        v.stake(toWei(100));
        v.compoundBeat();
        expect(v.staked).toBe(toWei(101));
        v.compoundBeat(2); // combo ×2 → 2%
        expect(v.staked).toBe(toWei(101) + applyBps(toWei(101), 200n));
        const out = v.unstake(true);
        expect(v.totalPenalties).toBeGreaterThan(0n);
        expect(out + v.totalPenalties).toBe(toWei(101) + applyBps(toWei(101), 200n));
        expect(StakingVault.projectedBps(100n, 2)).toBe(201n);
    });

    test('Quai hierarchy: 9 zones, 3 regions, merged beats every 9', () => {
        expect(QUAI_ZONES.length).toBe(9);
        expect(QUAI_REGIONS.length).toBe(3);
        expect(tiersAtBeat(0)).toEqual(['zone', 'region', 'prime']);
        expect(tiersAtBeat(1)).toEqual(['zone']);
        expect(tiersAtBeat(3)).toEqual(['zone', 'region']);
        expect(tiersAtBeat(9)).toEqual(['zone', 'region', 'prime']);
        expect(topTierAtBeat(6)).toBe('region');
        expect(mergedReward(['zone', 'region', 'prime'])).toBe(QUAI_WEI / 10n + QUAI_WEI / 2n + 2n * QUAI_WEI);
    });

    test('Qi ↔ Quai conversion applies spread and round-trips below par', () => {
        const c = new QiQuaiConverter(10n * QUAI_WEI, 200n);
        const qi = c.quaiToQi(toWei(1));
        expect(qi).toBe(toWei(10) - applyBps(toWei(10), 200n));
        const back = c.qiToQuai(qi);
        expect(back).toBeLessThan(toWei(1));
        expect(c.quaiToQi(toWei(1), 0n)).toBe(toWei(10));
    });
});

// ═══════════════════════════════════════════════════════════════════

describe('Mini-games — rules', () => {
    test('Burn Beat: burn share rises with combo and batches use the V2 split', () => {
        const g = new BurnBeat();
        g.reset();
        const chart = g.buildChart('x', 'normal');
        expect(chart.lanes).toBe(4);
        expect(Number(g.burnShareBps())).toBe(1000);
        let fb: ReturnType<typeof g.onEvent> = [];
        for (let i = 0; i < BURNBEAT_SHARES_PER_BATCH; i++) {
            fb = g.onEvent({ type: 'hit', note: { id: i, time: i * 100, lane: i % 4, type: 'tap', payload: { weight: 1 } }, judgement: 'PERFECT', deltaMs: 0, points: 100, songTime: i * 100 });
        }
        expect(g.batches.length).toBe(1);
        expect(fb.some(f => f.tone === 'epic')).toBe(true);
        const s = g.batches[0];
        expect(s.fee + s.payout + s.burnBuy + s.gasRefund).toBe(s.gross);
        expect(g.pendingWei).toBe(0n);
        expect(Number(g.burnShareBps())).toBeGreaterThan(1000);
        expect(g.summary().quaiDeltaWei).toBe(g.payoutWei);
        g.onEvent({ type: 'miss', note: { id: 99, time: 0, lane: 0, type: 'tap' }, songTime: 0 });
        expect(Number(g.burnShareBps())).toBe(1000);
    });

    test('Swap Tempo: PERFECT beats GOOD beats MISS on the same order', () => {
        const run = (j: 'PERFECT' | 'GOOD' | 'MISS') => {
            const g = new SwapTempo(); g.reset(); g.buildChart('s', 'normal');
            const note = { id: 0, time: 0, lane: 0, type: 'tap' as const, payload: { side: 'sell' as const, sizeBps: 1000, priceBps: 10000 } };
            if (j === 'MISS') g.onEvent({ type: 'miss', note, songTime: 0 });
            else g.onEvent({ type: 'hit', note, judgement: j, deltaMs: 0, points: 0, songTime: 0 });
            return g.portfolioValue();
        };
        const p = run('PERFECT'), good = run('GOOD'), miss = run('MISS');
        expect(p).toBeGreaterThan(good);
        expect(good).toBeGreaterThan(miss);
    });

    test('Swap Tempo chart puts sells in lanes 0–1 and buys in 2–3', () => {
        const g = new SwapTempo();
        const chart = g.buildChart('lanes', 'hard');
        for (const n of chart.notes) {
            if (n.payload!.side === 'sell') expect(n.lane).toBeLessThan(2); else expect(n.lane).toBeGreaterThanOrEqual(2);
        }
    });

    test('Yield Stairway: completed epoch pays, early exit penalises', () => {
        const g = new YieldStairway(); g.reset(); g.buildChart('y', 'normal');
        const note = { id: 1, time: 0, lane: 0, type: 'hold' as const, duration: 1000, payload: { amountWei: toWei(10) } };
        g.onEvent({ type: 'hold-start', note, judgement: 'PERFECT', deltaMs: 0, points: 0, songTime: 0 });
        expect(g.wallet).toBe(toWei(90));
        g.onEvent({ type: 'hold-tick', note, progress: 0.5, songTime: 500 });
        g.onEvent({ type: 'hold-end', note, completed: true, progress: 1, points: 0, songTime: 1000 });
        expect(g.wallet).toBeGreaterThan(toWei(100));
        expect(g.claimed).toBeGreaterThan(0n);
        const g2 = new YieldStairway(); g2.reset(); g2.buildChart('y', 'normal');
        g2.onEvent({ type: 'hold-start', note, judgement: 'PERFECT', deltaMs: 0, points: 0, songTime: 0 });
        g2.onEvent({ type: 'hold-end', note, completed: false, progress: 0.2, points: 0, songTime: 200 });
        expect(g2.wallet).toBeLessThan(toWei(100));
        expect(g2.penalties).toBeGreaterThan(0n);
        expect(g2.earlyExits).toBe(1);
    });

    test('Liquidation Dodge: ignoring shocks liquidates, reacting survives', () => {
        const g = new LiquidationDodge(); g.reset(); g.buildChart('l', 'normal');
        let beats = 0;
        const note = (i: number) => ({ id: i, time: i * 500, lane: 2, type: 'tap' as const, payload: { shockBps: -900 } });
        for (let i = 0; i < 40 && !g.isGameOver(); i++) { g.onEvent({ type: 'miss', note: note(i), songTime: i * 500 }); g.onEvent({ type: 'beat', beat: i, bar: 0, songTime: i * 500 }); beats++; }
        expect(g.isGameOver()).toBe(true);
        expect(g.seizedWei).toBeGreaterThan(0n);
        expect(g.summary().headline).toContain('Liquidated');

        const h = new LiquidationDodge(); h.reset(); h.buildChart('l', 'normal');
        for (let i = 0; i < 40; i++) { h.onEvent({ type: 'hit', note: note(i), judgement: 'PERFECT', deltaMs: 0, points: 0, songTime: i * 500 }); h.onEvent({ type: 'beat', beat: i, bar: 0, songTime: i * 500 }); }
        expect(h.isGameOver()).toBe(false);
        expect(h.position.healthFactor()).toBeGreaterThan(1);
    });

    test('Merge Pulse: prime beats carry all three tiers; hitting all three merges', () => {
        const g = new MergePulse(); g.reset();
        const chart = g.buildChart('m', 'normal');
        const primeNotes = chart.notes.filter(n => n.payload!.tier === 'prime');
        expect(primeNotes.length).toBeGreaterThan(0);
        for (const n of primeNotes) expect(n.payload!.beat % 9).toBe(0);
        const beat0 = chart.notes.filter(n => n.payload!.beat === 0 && n.payload!.tier !== 'convert');
        expect(beat0.map(n => n.payload!.tier).sort()).toEqual(['prime', 'region', 'zone']);
        let fb: ReturnType<typeof g.onEvent> = [];
        for (const n of beat0) fb = g.onEvent({ type: 'hit', note: n, judgement: 'PERFECT', deltaMs: 0, points: 0, songTime: n.time });
        expect(g.mergedBlocks).toBe(1);
        expect(fb.some(f => f.text.includes('MERGED'))).toBe(true);
        expect(g.quaiWei).toBeGreaterThan(mergedReward(['zone', 'region', 'prime']));
    });
});

// ═══════════════════════════════════════════════════════════════════

describe('Progression', () => {
    test('daily quests are seeded by day and persist', () => {
        const a = questsForDay('2026-11-05'); const b = questsForDay('2026-11-05'); const c = questsForDay('2026-11-06');
        expect(a.map(q => q.id)).toEqual(b.map(q => q.id));
        expect(a.length).toBe(3);
        expect(new Set(a.map(q => q.id)).size).toBe(3);
        expect(a.map(q => q.id)).not.toEqual(c.map(q => q.id));
    });

    test('XP curve grows and difficulties unlock by level', () => {
        expect(xpForLevel(2)).toBeGreaterThan(xpForLevel(1));
        expect(DIFFICULTY_UNLOCK_LEVEL.insane).toBeGreaterThan(DIFFICULTY_UNLOCK_LEVEL.hard);
        const p = new PlayerProgress(new MemStorage(), () => Date.UTC(2026, 10, 5));
        expect(p.isUnlocked('easy')).toBe(true);
        expect(p.isUnlocked('insane')).toBe(false);
    });

    test('streak extends on consecutive UTC days and resets after a gap', () => {
        const store = new MemStorage();
        let now = Date.UTC(2026, 10, 5, 12);
        const p = new PlayerProgress(store, () => now);
        const snap = { score: 1000, combo: 0, maxCombo: 5, multiplier: 1, fever: 0, feverActive: false, counts: { PERFECT: 5, GREAT: 0, GOOD: 0, MISS: 0 }, notesJudged: 5, accuracy: 1, grade: 'S' as const };
        const summary = { gameId: 'burn-beat', headline: 'x', bonusPoints: 0, quaiDeltaWei: 5n * QUAI_WEI, stats: {} };
        const o1 = p.recordRun({ snap, summary, difficulty: 'easy', seed: 's', finalScore: 1000 });
        expect(o1.streakDays).toBe(1);
        now += 86_400_000;
        const o2 = p.recordRun({ snap, summary, difficulty: 'easy', seed: 's', finalScore: 900 });
        expect(o2.streakDays).toBe(2);
        expect(o2.newBest).toBe(false);
        now += 3 * 86_400_000;
        const o3 = p.recordRun({ snap, summary, difficulty: 'easy', seed: 's', finalScore: 2000 });
        expect(o3.streakDays).toBe(1);
        expect(o3.newBest).toBe(true);
        // persisted
        const p2 = new PlayerProgress(store, () => now);
        expect(p2.data.totalRuns).toBe(3);
        expect(p2.data.lifetimeQuai['burn-beat']).toBe((15n * QUAI_WEI).toString());
    });
});

// ═══════════════════════════════════════════════════════════════════

describe('Input layouts', () => {
    test('every lane count has a key and gamepad layout', () => {
        for (const n of [1, 2, 3, 4]) {
            expect(KEY_LAYOUTS[n].length).toBe(n);
            expect(GAMEPAD_LAYOUTS[n].length).toBe(n);
            expect(keyLabelsForLanes(n).length).toBe(n);
        }
        expect(keyLabelsForLanes(4)).toEqual(['D', 'F', 'J', 'K']);
    });
});

// ═══════════════════════════════════════════════════════════════════

describe('RhythmArcade — headless full runs', () => {
    const GAMES = ['burn-beat', 'swap-tempo', 'yield-stairway', 'liquidation-dodge', 'merge-pulse'];

    test('lists five games with unique ids and colours', () => {
        const { arcade } = makeArcade();
        const games = arcade.listGames();
        expect(games.map(g => g.id).sort()).toEqual([...GAMES].sort());
        expect(new Set(games.map(g => g.color)).size).toBe(5);
    });

    for (const id of GAMES) {
        test(`${id}: perfect autoplay clears with grade S and records progress`, async () => {
            const { arcade, clock } = makeArcade();
            const events: string[] = [];
            arcade.on(e => events.push(e.type));
            const snap = await autoplay(arcade, id, { seed: 'perfect', clock });
            expect(snap.phase).toBe('results');
            expect(snap.score!.grade).toBe('S');
            expect(snap.score!.counts.MISS).toBe(0);
            expect(snap.results!.finalScore).toBeGreaterThan(0);
            expect(snap.results!.outcome.xpGained).toBeGreaterThan(0);
            expect(arcade.progress.data.totalRuns).toBe(1);
            expect(events).toContain('start'); expect(events).toContain('beat'); expect(events).toContain('end');
            if (id === 'swap-tempo') expect(snap.results!.summary.quaiDeltaWei).toBeGreaterThan(0n);
            if (id === 'liquidation-dodge') expect(snap.results!.summary.headline).toContain('Survived');
        });
    }

    test('late input is judged worse than on-time input', async () => {
        const a = makeArcade(); const b = makeArcade();
        const s1 = await autoplay(a.arcade, 'burn-beat', { seed: 'lat', clock: a.clock });
        const s2 = await autoplay(b.arcade, 'burn-beat', { seed: 'lat', clock: b.clock, offsetMs: 70 });
        expect(s2.score!.counts.PERFECT).toBeLessThan(s1.score!.counts.PERFECT);
        expect(s2.results!.finalScore).toBeLessThan(s1.results!.finalScore);
    });

    test('calibration offset compensates consistent lateness', async () => {
        const a = makeArcade();
        a.arcade.setCalibrationOffset(70);
        const s = await autoplay(a.arcade, 'burn-beat', { seed: 'lat', clock: a.clock, offsetMs: 70 });
        expect(s.score!.counts.PERFECT).toBe(s.score!.notesJudged);
    });

    test('missing every 3rd note drops the grade and resets combo', async () => {
        const { arcade, clock } = makeArcade();
        const s = await autoplay(arcade, 'merge-pulse', { seed: 'miss', clock, missEvery: 3 });
        expect(s.score!.counts.MISS).toBeGreaterThan(0);
        expect(s.score!.grade).not.toBe('S');
    });

    test('Liquidation Dodge ends early on liquidation when nobody plays', async () => {
        const { arcade, clock } = makeArcade();
        clock.t = 0;
        await arcade.start('liquidation-dodge', { difficulty: 'normal', seed: 'afk', silent: true });
        const len = arcade.chart!.lengthMs;
        while (arcade.phase !== 'results' && clock.t < len + 1000) { clock.t += 16; arcade.tick(clock.t); }
        expect(arcade.phase).toBe('results');
        expect(clock.t).toBeLessThan(len);
        expect(arcade.results!.summary.headline).toContain('Liquidated');
    });

    test('locked difficulty refuses to start; harder difficulty scores more for the same play', async () => {
        const { arcade, clock } = makeArcade();
        expect(await arcade.start('burn-beat', { difficulty: 'insane', seed: 'x', silent: true })).toBe(false);
        const easy = await autoplay(arcade, 'burn-beat', { difficulty: 'easy', seed: 'cmp', clock });
        const normal = await autoplay(arcade, 'burn-beat', { difficulty: 'normal', seed: 'cmp', clock });
        expect(normal.results!.finalScore).toBeGreaterThan(easy.results!.finalScore);
        expect(normal.bpm).toBeGreaterThan(easy.bpm);
    });

    test('same seed → identical chart; progress persists across arcade instances', async () => {
        const store = new MemStorage();
        const clock = { t: 0 };
        const a1 = new RhythmArcade(null, { storage: store, now: () => clock.t });
        await autoplay(a1, 'merge-pulse', { seed: 'repro', clock });
        const notes1 = a1.chart!.notes.map(n => `${n.time}:${n.lane}`);
        const a2 = new RhythmArcade(null, { storage: store, now: () => clock.t });
        expect(a2.progress.data.totalRuns).toBe(1);
        await autoplay(a2, 'merge-pulse', { seed: 'repro', clock });
        expect(a2.chart!.notes.map(n => `${n.time}:${n.lane}`)).toEqual(notes1);
        expect(a2.progress.data.totalRuns).toBe(2);
        expect(a2.progress.data.recent[0].seed).toBe('repro');
    });

    test('pause/resume keeps song time continuous', async () => {
        const { arcade, clock } = makeArcade();
        clock.t = 0;
        await arcade.start('burn-beat', { seed: 'p', silent: true });
        clock.t = 3000; arcade.tick(clock.t);
        expect(arcade.phase).toBe('playing');
        arcade.pause();
        expect(arcade.phase).toBe('paused');
        const tPaused = arcade.conductor.songTime(clock.t);
        clock.t = 9000; arcade.tick(clock.t);
        expect(arcade.conductor.songTime(clock.t)).toBe(tPaused);
        arcade.resume();
        clock.t = 9100;
        expect(arcade.conductor.songTime(clock.t)).toBe(tPaused + 100);
        arcade.stop();
        expect(arcade.phase).toBe('idle');
    });
});
