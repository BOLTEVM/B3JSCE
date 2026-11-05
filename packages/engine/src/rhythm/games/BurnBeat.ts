/**
 * BURN BEAT — QuaiAxe burn-mining rhythm.
 *
 * Every note is a mining share coming off your rig. Hit it on the beat and
 * the pool accepts it (PERFECT = full share value). Miss and the share is
 * stale. Every 16 accepted shares the furnace fires a burn batch using the
 * exact QuaiAxe V2 split (0.5% fee, ≤3% gas, burn/payout by your burn
 * share). Your combo *raises the burn share*: 10% at rest, up to 90% at
 * a 50+ combo — more $QAXE burned, bigger furnace flare, bigger score.
 *
 * Lesson: burn-mining converts hashrate into deflationary pressure; the
 * split is deterministic and auditable.
 */

import { RhythmMiniGame, DIFFICULTY_PROFILES } from '../game';
import type { Difficulty, GameFeedback, HudLine, MiniGameMeta, RunSummary } from '../game';
import { generateChart } from '../core';
import type { Chart, SessionEvent } from '../core';
import { quaiAxeSplit, QUAI_WEI, formatQuai, QUAIAXE_MIN_BURN_BPS } from '@b3js/web3';
import type { QuaiAxeSplit } from '@b3js/web3';

export interface SharePayload {
    /** Share difficulty weight 1..3 → reward multiplier. */
    weight: number;
}

export const BURNBEAT_SHARES_PER_BATCH = 16;
/** Estimated QUAI per weight-1 share (gameplay estimate, not pool truth). */
export const BURNBEAT_SHARE_WEI = QUAI_WEI / 4n;

export class BurnBeat extends RhythmMiniGame<SharePayload> {
    readonly meta: MiniGameMeta = {
        id: 'burn-beat',
        title: 'Burn Beat',
        tagline: 'Hash to the beat. Feed the furnace.',
        lesson: 'QuaiAxe burn-mining: shares → gross QUAI → fee / gas / burn / payout split.',
        color: '#ff7a1a',
        icon: '🔥',
        lanes: 4,
        laneLabels: ['RIG 1', 'RIG 2', 'RIG 3', 'RIG 4'],
        endless: false,
    };

    public pendingWei = 0n;
    public payoutWei = 0n;
    public burnedWei = 0n;
    public feeWei = 0n;
    public gasWei = 0n;
    public accepted = 0;
    public stale = 0;
    public batches: QuaiAxeSplit[] = [];
    public furnaceHeat = 0;
    private combo = 0;
    private sinceBatch = 0;

    buildChart(seed: string, difficulty: Difficulty): Chart<SharePayload> {
        this.difficulty = difficulty;
        const p = DIFFICULTY_PROFILES[difficulty];
        return generateChart<SharePayload>(
            { seed: `burn-beat:${seed}`, bpm: p.bpm, lanes: 4, bars: p.bars, density: p.density, subdivision: p.subdivision },
            (_n, rand) => ({ weight: rand() < 0.12 ? 3 : rand() < 0.4 ? 2 : 1 }),
        );
    }

    /** Burn share rises with combo: 10% → 90%. */
    burnShareBps(): bigint {
        const t = Math.min(1, this.combo / 50);
        return QUAIAXE_MIN_BURN_BPS + BigInt(Math.round(t * 8000));
    }

    onEvent(e: SessionEvent<SharePayload>): GameFeedback[] {
        const fb: GameFeedback[] = [];
        switch (e.type) {
            case 'hit':
            case 'hold-start': {
                const w = BigInt(e.note.payload?.weight ?? 1);
                const eff = this.efficiency(e.judgement);
                const wei = (BURNBEAT_SHARE_WEI * w * BigInt(Math.round(eff * 100))) / 100n;
                this.pendingWei += wei;
                this.accepted++;
                this.combo++;
                this.sinceBatch++;
                fb.push({ text: `+${formatQuai(wei)} QUAI`, tone: e.judgement === 'PERFECT' ? 'good' : 'neutral', lane: e.note.lane });
                if (this.sinceBatch >= BURNBEAT_SHARES_PER_BATCH) fb.push(...this.burn());
                break;
            }
            case 'hold-end':
                if (e.completed) { this.pendingWei += BURNBEAT_SHARE_WEI; fb.push({ text: 'SUSTAINED HASH +0.25', tone: 'good', lane: e.note.lane }); }
                else { this.combo = 0; fb.push({ text: 'RIG STALLED', tone: 'bad', lane: e.note.lane }); }
                break;
            case 'miss':
                this.stale++;
                this.combo = 0;
                fb.push({ text: 'STALE SHARE', tone: 'bad', lane: e.note.lane });
                break;
            case 'beat':
                this.furnaceHeat = Math.max(0, this.furnaceHeat - 0.02);
                break;
            case 'end':
                if (this.pendingWei > 0n) fb.push(...this.burn());
                break;
        }
        return fb;
    }

    private burn(): GameFeedback[] {
        if (this.pendingWei <= 0n) return [];
        const split = quaiAxeSplit(this.pendingWei, this.burnShareBps());
        this.batches.push(split);
        this.payoutWei += split.payout;
        this.burnedWei += split.burnBuy;
        this.feeWei += split.fee;
        this.gasWei += split.gasRefund;
        this.pendingWei = 0n;
        this.sinceBatch = 0;
        this.furnaceHeat = Math.min(1, this.furnaceHeat + 0.35);
        return [{ text: `🔥 BURN ${formatQuai(split.burnBuy)} · PAYOUT ${formatQuai(split.payout)}`, tone: 'epic' }];
    }

    hud(): HudLine[] {
        return [
            { label: 'Pending', value: `${formatQuai(this.pendingWei)} QUAI`, bar: this.sinceBatch / BURNBEAT_SHARES_PER_BATCH },
            { label: 'Burn share', value: `${Number(this.burnShareBps()) / 100}%`, bar: Number(this.burnShareBps()) / 10000, tone: 'good' },
            { label: 'Payout', value: `${formatQuai(this.payoutWei)} QUAI` },
            { label: '$QAXE burned', value: `${formatQuai(this.burnedWei)} QUAI`, tone: 'good' },
            { label: 'Furnace', value: `${Math.round(this.furnaceHeat * 100)}°`, bar: this.furnaceHeat },
        ];
    }

    intensity(): number { return this.furnaceHeat; }

    summary(): RunSummary {
        const bonus = Math.round(Number(this.burnedWei / 10n ** 14n) / 10); // 1 pt per 0.001 burned
        return {
            gameId: this.meta.id,
            headline: `${this.batches.length} burn batches · ${formatQuai(this.burnedWei)} QUAI of $QAXE burned`,
            bonusPoints: bonus,
            quaiDeltaWei: this.payoutWei,
            stats: {
                'Shares accepted': String(this.accepted),
                'Stale shares': String(this.stale),
                'Payout': `${formatQuai(this.payoutWei)} QUAI`,
                'Burned': `${formatQuai(this.burnedWei)} QUAI`,
                'Fees + gas': `${formatQuai(this.feeWei + this.gasWei)} QUAI`,
            },
        };
    }

    reset(): void {
        this.pendingWei = 0n; this.payoutWei = 0n; this.burnedWei = 0n; this.feeWei = 0n; this.gasWei = 0n;
        this.accepted = 0; this.stale = 0; this.batches = []; this.furnaceHeat = 0; this.combo = 0; this.sinceBatch = 0;
    }
}
