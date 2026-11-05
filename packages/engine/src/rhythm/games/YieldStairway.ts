/**
 * YIELD STAIRWAY — staking as hold notes.
 *
 * Every hold note is a staking epoch. Press to stake, *hold* to compound
 * (yield ticks every half beat, boosted by your combo multiplier), release
 * at the end to claim. Let go early and you pay a 10% early-unstake penalty.
 * Tap notes are "harvest" events that lock rewards into your wallet.
 *
 * Lesson: compounding, lock-ups, early-exit penalties — and why APR ≠ APY.
 */

import { RhythmMiniGame, DIFFICULTY_PROFILES } from '../game';
import type { Difficulty, GameFeedback, HudLine, MiniGameMeta, RunSummary } from '../game';
import { generateChart, comboMultiplier } from '../core';
import type { Chart, SessionEvent } from '../core';
import { StakingVault, toWei, applyBps } from '../defi';
import { formatQuai } from '@b3js/web3';

export interface StakePayload {
    /** Amount to stake for hold notes (wei). */
    amountWei: bigint;
}

export class YieldStairway extends RhythmMiniGame<StakePayload> {
    readonly meta: MiniGameMeta = {
        id: 'yield-stairway',
        title: 'Yield Stairway',
        tagline: 'Hold to compound. Release to claim.',
        lesson: 'Staking lock-ups and compounding: holding through the epoch beats bailing early.',
        color: '#22c55e',
        icon: '📈',
        lanes: 3,
        laneLabels: ['VAULT A', 'VAULT B', 'VAULT C'],
        endless: false,
    };

    public wallet = toWei(100);
    public claimed = 0n;
    public penalties = 0n;
    public epochs = 0;
    public earlyExits = 0;
    private vaults: Map<number, StakingVault> = new Map();
    private combo = 0;
    private glow = 0;

    buildChart(seed: string, difficulty: Difficulty): Chart<StakePayload> {
        this.difficulty = difficulty;
        const p = DIFFICULTY_PROFILES[difficulty];
        return generateChart<StakePayload>(
            {
                seed: `yield-stairway:${seed}`, bpm: p.bpm, lanes: 3, bars: p.bars,
                density: Math.min(0.55, p.density), subdivision: 1, holdChance: 0.6,
            },
            (n, rand) => ({ amountWei: n.type === 'hold' ? toWei(5 + Math.floor(rand() * 10)) : 0n }),
        );
    }

    onEvent(e: SessionEvent<StakePayload>): GameFeedback[] {
        const fb: GameFeedback[] = [];
        switch (e.type) {
            case 'hold-start': {
                const amt = e.note.payload?.amountWei ?? toWei(5);
                const stake = amt > this.wallet ? this.wallet : amt;
                if (stake <= 0n) { fb.push({ text: 'WALLET EMPTY', tone: 'bad', lane: e.note.lane }); break; }
                this.wallet -= stake;
                const v = new StakingVault(e.judgement === 'PERFECT' ? 40n : e.judgement === 'GREAT' ? 30n : 20n);
                v.stake(stake);
                this.vaults.set(e.note.id, v);
                this.combo++;
                fb.push({ text: `STAKED ${formatQuai(stake)}`, tone: 'good', lane: e.note.lane });
                break;
            }
            case 'hold-tick': {
                const v = this.vaults.get(e.note.id);
                if (!v) break;
                const y = v.compoundBeat(comboMultiplier(this.combo));
                this.glow = Math.min(1, this.glow + 0.05);
                fb.push({ text: `+${formatQuai(y)}`, tone: 'neutral', lane: e.note.lane });
                break;
            }
            case 'hold-end': {
                const v = this.vaults.get(e.note.id);
                if (!v) break;
                this.vaults.delete(e.note.id);
                this.epochs++;
                const out = v.unstake(!e.completed);
                this.wallet += out;
                this.claimed += v.rewards;
                if (e.completed) { this.combo++; fb.push({ text: `CLAIMED +${formatQuai(v.rewards)} 🎉`, tone: 'epic', lane: e.note.lane }); }
                else { this.combo = 0; this.earlyExits++; this.penalties += v.totalPenalties; fb.push({ text: `EARLY EXIT −${formatQuai(v.totalPenalties)}`, tone: 'bad', lane: e.note.lane }); }
                break;
            }
            case 'hit': {
                // Harvest: lock a slice of rewards in as bonus yield
                const bonus = applyBps(this.wallet, e.judgement === 'PERFECT' ? 50n : e.judgement === 'GREAT' ? 30n : 10n);
                this.wallet += bonus; this.claimed += bonus; this.combo++;
                fb.push({ text: `HARVEST +${formatQuai(bonus)}`, tone: e.judgement === 'PERFECT' ? 'good' : 'neutral', lane: e.note.lane });
                break;
            }
            case 'miss':
                this.combo = 0;
                this.glow = Math.max(0, this.glow - 0.3);
                fb.push({ text: 'EPOCH MISSED', tone: 'bad', lane: e.note.lane });
                break;
            case 'beat':
                this.glow = Math.max(0, this.glow - 0.015);
                break;
            case 'end':
                for (const [id, v] of this.vaults) { this.wallet += v.unstake(false); this.claimed += v.rewards; this.vaults.delete(id); }
                break;
        }
        return fb;
    }

    stakedTotal(): bigint { let s = 0n; for (const v of this.vaults.values()) s += v.staked; return s; }

    hud(): HudLine[] {
        return [
            { label: 'Wallet', value: `${formatQuai(this.wallet)} QUAI` },
            { label: 'Staked', value: `${formatQuai(this.stakedTotal())} QUAI`, bar: Math.min(1, Number(this.vaults.size) / 3) },
            { label: 'Claimed yield', value: `+${formatQuai(this.claimed)}`, tone: 'good' },
            { label: 'Penalties', value: `−${formatQuai(this.penalties)}`, tone: 'bad' },
            { label: 'Compound ×', value: `${comboMultiplier(this.combo)}`, tone: 'good' },
        ];
    }

    intensity(): number { return this.glow; }

    summary(): RunSummary {
        const net = this.claimed - this.penalties;
        return {
            gameId: this.meta.id,
            headline: `${this.epochs} epochs · +${formatQuai(this.claimed)} QUAI yield`,
            bonusPoints: Math.max(0, Math.round(Number(net / 10n ** 15n) / 10)),
            quaiDeltaWei: net,
            stats: {
                'Epochs completed': String(this.epochs - this.earlyExits),
                'Early exits': String(this.earlyExits),
                'Yield claimed': `${formatQuai(this.claimed)} QUAI`,
                'Penalties': `${formatQuai(this.penalties)} QUAI`,
            },
        };
    }

    reset(): void {
        this.wallet = toWei(100); this.claimed = 0n; this.penalties = 0n; this.epochs = 0; this.earlyExits = 0;
        this.vaults.clear(); this.combo = 0; this.glow = 0;
    }
}
