/**
 * MERGE PULSE — Quai Network merged mining as polyrhythm.
 *
 * Quai is a hierarchy: 9 Zone chains under 3 Regions under 1 Prime. One
 * proof-of-work solution can satisfy more than one tier's difficulty — a
 * "merged" block. Here each beat is a Zone block (lane 0), every 3rd beat
 * is also a Region block (lane 1) and every 9th a Prime block (lane 2).
 * Hit a Prime beat on all three lanes in the same window and you mine a
 * fully merged block worth zone + region + prime rewards × a merge bonus.
 * A 4th lane converts your QUAI into QI (energy-pegged token) at a spread
 * that tightens with timing.
 *
 * Lesson: Quai's multi-chain hierarchy, merged mining and the QUAI ↔ QI pair.
 */

import { RhythmMiniGame, DIFFICULTY_PROFILES } from '../game';
import type { Difficulty, GameFeedback, HudLine, MiniGameMeta, RunSummary } from '../game';
import { beatMs, mulberry32 } from '../core';
import type { Chart, Note, SessionEvent } from '../core';
import { tiersAtBeat, mergedReward, QUAI_TIER_REWARD_WEI, QiQuaiConverter, QUAI_ZONES, QUAI_REGIONS } from '../defi';
import type { QuaiTier } from '../defi';
import { formatQuai } from '@b3js/web3';

export interface BlockPayload {
    tier: QuaiTier | 'convert';
    beat: number;
    chainName: string;
}

export const MERGE_BONUS_BPS = 5000n; // +50% for a fully merged Prime block

export class MergePulse extends RhythmMiniGame<BlockPayload> {
    readonly meta: MiniGameMeta = {
        id: 'merge-pulse',
        title: 'Merge Pulse',
        tagline: 'Zone. Region. Prime. Merge them all.',
        lesson: "Quai's Prime → Region → Zone hierarchy, merged mining and QUAI ↔ QI conversion.",
        color: '#ff3333',
        icon: '⛓️',
        lanes: 4,
        laneLabels: ['ZONE', 'REGION', 'PRIME', 'QI'],
        endless: false,
    };

    public quaiWei = 0n;
    public qiWei = 0n;
    public blocks: Record<QuaiTier, number> = { zone: 0, region: 0, prime: 0 };
    public mergedBlocks = 0;
    public orphans = 0;
    public converter = new QiQuaiConverter();
    private pending = new Map<number, Set<QuaiTier>>(); // beat → tiers hit
    private pulse = 0;

    buildChart(seed: string, difficulty: Difficulty): Chart<BlockPayload> {
        this.difficulty = difficulty;
        const p = DIFFICULTY_PROFILES[difficulty];
        const rand = mulberry32(`merge-pulse:${seed}`);
        const offset = 2000;
        const bl = beatMs(p.bpm);
        const beats = p.bars * 4;
        const notes: Note<BlockPayload>[] = [];
        let id = 0;
        const zoneSkip = difficulty === 'easy' ? 0.5 : difficulty === 'normal' ? 0.3 : 0.1;
        for (let b = 0; b < beats; b++) {
            const tiers = tiersAtBeat(b);
            const time = offset + b * bl;
            for (const tier of tiers) {
                // Breathing room on plain zone beats — never on region/prime beats, so a merge is always possible.
                if (tier === 'zone' && tiers.length === 1 && rand() < zoneSkip) continue;
                const lane = tier === 'zone' ? 0 : tier === 'region' ? 1 : 2;
                const chainName = tier === 'zone' ? QUAI_ZONES[b % 9] : tier === 'region' ? QUAI_REGIONS[(b / 3) % 3 | 0] : 'Prime';
                notes.push({ id: id++, time, lane, type: 'tap', payload: { tier, beat: b, chainName } });
            }
            // Conversion opportunities on off-beats (harder difficulties → more)
            if (difficulty !== 'easy' && b % 2 === 1 && rand() < p.density * 0.5) {
                notes.push({ id: id++, time: time + bl / 2, lane: 3, type: 'tap', payload: { tier: 'convert', beat: b, chainName: 'QI' } });
            }
        }
        return { bpm: p.bpm, lanes: 4, offset, notes, lengthMs: offset + beats * bl + bl * 2, seed };
    }

    onEvent(e: SessionEvent<BlockPayload>): GameFeedback[] {
        const fb: GameFeedback[] = [];
        switch (e.type) {
            case 'hit':
            case 'hold-start': {
                const p = e.note.payload!;
                if (p.tier === 'convert') {
                    const spread = e.judgement === 'PERFECT' ? 10n : e.judgement === 'GREAT' ? 80n : 200n;
                    const amt = this.quaiWei / 4n;
                    if (amt <= 0n) { fb.push({ text: 'NO QUAI TO CONVERT', tone: 'neutral', lane: 3 }); break; }
                    const qi = this.converter.quaiToQi(amt, spread);
                    this.quaiWei -= amt; this.qiWei += qi;
                    fb.push({ text: `→ ${formatQuai(qi)} QI (${Number(spread) / 100}% spread)`, tone: e.judgement === 'PERFECT' ? 'good' : 'neutral', lane: 3 });
                    break;
                }
                const eff = this.efficiency(e.judgement);
                const reward = (QUAI_TIER_REWARD_WEI[p.tier] * BigInt(Math.round(eff * 100))) / 100n;
                this.quaiWei += reward;
                this.blocks[p.tier]++;
                this.pulse = Math.min(1, this.pulse + (p.tier === 'prime' ? 0.5 : p.tier === 'region' ? 0.2 : 0.08));
                fb.push({ text: `${p.chainName} +${formatQuai(reward)}`, tone: p.tier === 'prime' ? 'epic' : 'good', lane: e.note.lane });

                // Merge tracking
                const set = this.pending.get(p.beat) ?? new Set<QuaiTier>();
                set.add(p.tier);
                this.pending.set(p.beat, set);
                const expected = tiersAtBeat(p.beat);
                if (expected.length === 3 && set.size === 3) {
                    const bonus = (mergedReward(expected) * MERGE_BONUS_BPS) / 10000n;
                    this.quaiWei += bonus;
                    this.mergedBlocks++;
                    this.pulse = 1;
                    fb.push({ text: `⛓️ MERGED BLOCK +${formatQuai(bonus)} BONUS`, tone: 'epic' });
                }
                break;
            }
            case 'miss': {
                const p = e.note.payload!;
                if (p.tier !== 'convert') { this.orphans++; fb.push({ text: `${p.chainName} ORPHANED`, tone: 'bad', lane: e.note.lane }); }
                else fb.push({ text: 'RATE MOVED', tone: 'neutral', lane: 3 });
                break;
            }
            case 'beat':
                this.pulse = Math.max(0, this.pulse - 0.06);
                if (e.beat % 4 === 0) this.converter.drift(Math.round((Math.sin(e.beat / 7) * 40)));
                // GC merge tracking
                for (const b of [...this.pending.keys()]) if (b < e.beat - 2) this.pending.delete(b);
                break;
        }
        return fb;
    }

    hud(): HudLine[] {
        return [
            { label: 'QUAI mined', value: formatQuai(this.quaiWei), tone: 'good' },
            { label: 'QI', value: formatQuai(this.qiWei) },
            { label: 'Blocks Z/R/P', value: `${this.blocks.zone}/${this.blocks.region}/${this.blocks.prime}` },
            { label: 'Merged', value: String(this.mergedBlocks), tone: 'good', bar: Math.min(1, this.mergedBlocks / 8) },
            { label: 'Orphans', value: String(this.orphans), tone: 'bad' },
        ];
    }

    intensity(): number { return this.pulse; }

    summary(): RunSummary {
        const qiAsQuai = this.converter.qiToQuai(this.qiWei, 0n);
        return {
            gameId: this.meta.id,
            headline: `${this.mergedBlocks} merged blocks · ${formatQuai(this.quaiWei)} QUAI + ${formatQuai(this.qiWei)} QI`,
            bonusPoints: this.mergedBlocks * 300 + this.blocks.prime * 100 + this.blocks.region * 30 + this.blocks.zone * 5,
            quaiDeltaWei: this.quaiWei + qiAsQuai,
            stats: {
                'Zone blocks': String(this.blocks.zone),
                'Region blocks': String(this.blocks.region),
                'Prime blocks': String(this.blocks.prime),
                'Merged blocks': String(this.mergedBlocks),
                'Orphans': String(this.orphans),
                'QI held': `${formatQuai(this.qiWei)} QI`,
            },
        };
    }

    reset(): void {
        this.quaiWei = 0n; this.qiWei = 0n; this.blocks = { zone: 0, region: 0, prime: 0 };
        this.mergedBlocks = 0; this.orphans = 0; this.converter = new QiQuaiConverter(); this.pending.clear(); this.pulse = 0;
    }
}
