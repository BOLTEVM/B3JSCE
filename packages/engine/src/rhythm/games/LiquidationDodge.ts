/**
 * LIQUIDATION DODGE — endless survival against a lending oracle.
 *
 * You hold a leveraged QUAI position. Every note is an incoming oracle
 * price shock. Hit it on the beat to react: left lanes ADD COLLATERAL,
 * right lanes REPAY DEBT. Interest accrues every beat, shocks get nastier
 * the longer you survive, and the moment your health factor drops below
 * 1.0 the liquidator takes your collateral. Survive as long as you can.
 *
 * Lesson: health factor = (collateral × threshold) / debt; volatility and
 * interest both eat it; reacting late is the same as not reacting.
 */

import { RhythmMiniGame, DIFFICULTY_PROFILES } from '../game';
import type { Difficulty, GameFeedback, HudLine, MiniGameMeta, RunSummary } from '../game';
import { generateChart } from '../core';
import type { Chart, SessionEvent } from '../core';
import { LendingPosition, toWei, fromWei, applyBps, QUAI_WEI } from '../defi';
import { formatQuai } from '@b3js/web3';

export interface ShockPayload {
    /** Signed price move in bps applied if the note is missed (and halved if hit). */
    shockBps: number;
}

export class LiquidationDodge extends RhythmMiniGame<ShockPayload> {
    readonly meta: MiniGameMeta = {
        id: 'liquidation-dodge',
        title: 'Liquidation Dodge',
        tagline: 'Keep your health factor above 1.0. Forever.',
        lesson: 'Lending health factors: collateral × threshold ÷ debt. Volatility + interest = liquidation.',
        color: '#ef4444',
        icon: '🛡️',
        lanes: 4,
        laneLabels: ['+COLL', '+COLL', 'REPAY', 'REPAY'],
        endless: true,
    };

    public position = new LendingPosition(toWei(100), toWei(60), QUAI_WEI, 8000n);
    public reserve = toWei(40);
    public beatsSurvived = 0;
    public shocksAbsorbed = 0;
    public shocksTaken = 0;
    public liquidated = false;
    public seizedWei = 0n;
    public lowestHf = 99;

    buildChart(seed: string, difficulty: Difficulty): Chart<ShockPayload> {
        this.difficulty = difficulty;
        const p = DIFFICULTY_PROFILES[difficulty];
        // Endless: long chart; the arcade ends the run on liquidation.
        return generateChart<ShockPayload>(
            { seed: `liquidation-dodge:${seed}`, bpm: p.bpm, lanes: 4, bars: p.bars * 4, density: p.density, subdivision: Math.min(2, p.subdivision) },
            (n, rand) => {
                // Shocks escalate with time; mostly down (that's what kills you).
                const t = Math.min(1, n.time / 90_000);
                const mag = 120 + t * 480 + rand() * 120;
                const down = rand() < 0.72;
                return { shockBps: Math.round(down ? -mag : mag * 0.6) };
            },
        );
    }

    isGameOver(): boolean { return this.liquidated; }

    onEvent(e: SessionEvent<ShockPayload>): GameFeedback[] {
        const fb: GameFeedback[] = [];
        if (this.liquidated) return fb;
        switch (e.type) {
            case 'hit':
            case 'hold-start': {
                const p = e.note.payload!;
                const eff = this.efficiency(e.judgement);
                // Reacting absorbs most of the shock
                const residual = Math.round(p.shockBps * (1 - eff) * 0.5);
                this.position.applyPriceShock(residual);
                if (e.note.lane < 2) {
                    const add = applyBps(this.reserve, 1500n);
                    this.reserve -= add; this.position.addCollateral(add);
                    fb.push({ text: `+${formatQuai(add)} COLLATERAL`, tone: 'good', lane: e.note.lane });
                } else {
                    const pay = applyBps(this.position.debt, e.judgement === 'PERFECT' ? 800n : e.judgement === 'GREAT' ? 500n : 250n);
                    const paid = this.position.repay(pay);
                    fb.push({ text: `REPAID ${formatQuai(paid)}`, tone: 'good', lane: e.note.lane });
                }
                this.shocksAbsorbed++;
                break;
            }
            case 'miss': {
                const p = e.note.payload!;
                this.position.applyPriceShock(p.shockBps);
                this.shocksTaken++;
                fb.push({ text: `ORACLE ${p.shockBps > 0 ? '+' : ''}${(p.shockBps / 100).toFixed(1)}%`, tone: 'bad', lane: e.note.lane });
                break;
            }
            case 'beat': {
                this.beatsSurvived++;
                this.position.accrueInterest(8n); // 0.08% / beat
                break;
            }
        }
        const hf = this.position.healthFactor();
        if (hf < this.lowestHf) this.lowestHf = hf;
        if (this.position.isLiquidatable()) {
            this.seizedWei = this.position.liquidate(500n);
            this.liquidated = true;
            fb.push({ text: `💀 LIQUIDATED — ${formatQuai(this.seizedWei)} QUAI seized`, tone: 'bad' });
        } else if (hf < 1.15 && (e.type === 'hit' || e.type === 'miss')) {
            fb.push({ text: 'DANGER ZONE', tone: 'bad' });
        }
        return fb;
    }

    hud(): HudLine[] {
        const hf = this.position.healthFactor();
        const bar = Math.max(0, Math.min(1, (hf - 1) / 1.5));
        return [
            { label: 'Health factor', value: hf > 50 ? '∞' : hf.toFixed(3), bar, tone: hf < 1.2 ? 'bad' : hf < 1.5 ? 'neutral' : 'good' },
            { label: 'Collateral', value: `${formatQuai(this.position.collateral)} QUAI` },
            { label: 'Debt', value: `${formatQuai(this.position.debt)} qUSD`, tone: 'bad' },
            { label: 'Oracle', value: `${fromWei(this.position.price).toFixed(4)} qUSD` },
            { label: 'Reserve', value: `${formatQuai(this.reserve)} QUAI` },
        ];
    }

    intensity(): number {
        const hf = this.position.healthFactor();
        return Math.max(0, Math.min(1, 1 - (hf - 1) / 0.8));
    }

    summary(): RunSummary {
        const equity = this.position.collateralValue() - this.position.debt + (this.reserve * this.position.price) / QUAI_WEI;
        const start = toWei(100) - toWei(60) + toWei(40);
        return {
            gameId: this.meta.id,
            headline: this.liquidated ? `Liquidated after ${this.beatsSurvived} beats` : `Survived ${this.beatsSurvived} beats`,
            bonusPoints: this.beatsSurvived * 10 + this.shocksAbsorbed * 20,
            quaiDeltaWei: equity - start,
            stats: {
                'Beats survived': String(this.beatsSurvived),
                'Shocks absorbed': String(this.shocksAbsorbed),
                'Shocks taken': String(this.shocksTaken),
                'Lowest HF': this.lowestHf.toFixed(3),
                'Seized': `${formatQuai(this.seizedWei)} QUAI`,
            },
        };
    }

    reset(): void {
        this.position = new LendingPosition(toWei(100), toWei(60), QUAI_WEI, 8000n);
        this.reserve = toWei(40); this.beatsSurvived = 0; this.shocksAbsorbed = 0; this.shocksTaken = 0;
        this.liquidated = false; this.seizedWei = 0n; this.lowestHf = 99;
    }
}
