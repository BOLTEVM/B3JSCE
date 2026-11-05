/**
 * SWAP TEMPO — AMM swaps on the beat.
 *
 * You start with 100 QUAI and 0 qUSD against a live x·y=k pool. Notes are
 * swap orders: left lanes SELL QUAI, right lanes BUY QUAI. A PERFECT hit
 * executes at the pool's true price; GREAT/GOOD add extra slippage; a MISS
 * is a sandwich attack that costs you 2% of that order. The pool drifts to
 * the groove, so timing *is* arbitrage. Score = portfolio value growth.
 *
 * Lesson: constant-product pricing, price impact, slippage, MEV.
 */

import { RhythmMiniGame, DIFFICULTY_PROFILES } from '../game';
import type { Difficulty, GameFeedback, HudLine, MiniGameMeta, RunSummary } from '../game';
import { generateChart, mulberry32 } from '../core';
import type { Chart, SessionEvent, Judgement } from '../core';
import { ConstantProductPool, toWei, fromWei, applyBps, QUAI_WEI } from '../defi';
import { formatQuai } from '@b3js/web3';

export interface SwapPayload {
    side: 'sell' | 'buy';
    /** Fraction (bps) of the relevant balance to swap. */
    sizeBps: number;
    /** Market price when this note arrives, in bps of the opening price (10000 = par). */
    priceBps: number;
}

export const SWAPTEMPO_SLIPPAGE_BPS: Readonly<Record<Judgement, bigint>> = { PERFECT: 0n, GREAT: 25n, GOOD: 80n, MISS: 200n };
/** A PERFECT hit front-runs the drift: price improvement in bps (your MEV). */
export const SWAPTEMPO_PERFECT_EDGE_BPS = 80n;

export class SwapTempo extends RhythmMiniGame<SwapPayload> {
    readonly meta: MiniGameMeta = {
        id: 'swap-tempo',
        title: 'Swap Tempo',
        tagline: 'Trade the groove. Beat the slippage.',
        lesson: 'Constant-product AMMs: x·y=k, price impact and why bad timing is MEV.',
        color: '#3b82f6',
        icon: '🔁',
        lanes: 4,
        laneLabels: ['SELL', 'SELL', 'BUY', 'BUY'],
        endless: false,
    };

    public pool = new ConstantProductPool(toWei(100_000), toWei(100_000));
    public quai = toWei(100);
    public qusd = 0n;
    public startValue = toWei(100);
    public swaps = 0;
    public sandwiched = 0;
    public slippagePaid = 0n;
    public edgeCaptured = 0n;
    private heat = 0;

    buildChart(seed: string, difficulty: Difficulty): Chart<SwapPayload> {
        this.difficulty = difficulty;
        const p = DIFFICULTY_PROFILES[difficulty];
        const wave = mulberry32(`swap-wave:${seed}`);
        const phase = wave() * Math.PI * 2;
        const chart = generateChart<SwapPayload>(
            { seed: `swap-tempo:${seed}`, bpm: p.bpm, lanes: 4, bars: p.bars, density: p.density, subdivision: p.subdivision },
            (n, rand) => {
                // The pool price oscillates with the song. Orders are placed on the
                // profitable side of the wave: SELL on the way up, BUY on the way down.
                const t = n.time / 1000;
                const osc = Math.sin(t * 0.6 + phase);
                const side: 'sell' | 'buy' = osc >= 0 ? 'sell' : 'buy';
                return {
                    side,
                    sizeBps: 500 + Math.floor(rand() * 1500), // 5%–20% of balance
                    priceBps: Math.round(10000 + osc * 1500 + (rand() - 0.5) * 120), // ±15% wave + noise
                };
            },
        );
        // Lanes 0–1 are SELL lanes, 2–3 BUY lanes — move each note to its side.
        for (const n of chart.notes) {
            const parity = n.lane % 2;
            n.lane = n.payload!.side === 'sell' ? parity : 2 + parity;
        }
        return chart;
    }

    portfolioValue(): bigint {
        // Mark QUAI at the pool's spot price (quote per base).
        return this.qusd + (this.quai * this.pool.spotPrice()) / QUAI_WEI;
    }

    onEvent(e: SessionEvent<SwapPayload>): GameFeedback[] {
        const fb: GameFeedback[] = [];
        // External arbitrageurs re-peg the pool to the market wave before each order.
        const drift = (p?: SwapPayload) => { if (p) { this.pool.reserveQuote = (this.pool.reserveBase * BigInt(p.priceBps)) / 10000n; } };
        switch (e.type) {
            case 'hit':
            case 'hold-start': {
                const p = e.note.payload!;
                drift(p);
                const slip = SWAPTEMPO_SLIPPAGE_BPS[e.judgement];
                fb.push(this.execute(p, slip, e.note.lane, e.judgement === 'PERFECT' ? SWAPTEMPO_PERFECT_EDGE_BPS : 0n));
                break;
            }
            case 'hold-end':
                if (e.completed) { fb.push({ text: 'LIMIT FILLED', tone: 'good', lane: e.note.lane }); }
                break;
            case 'miss': {
                const p = e.note.payload!;
                drift(p);
                // Sandwich: 2% of the order size vanishes to a bot.
                const bal = p.side === 'sell' ? this.quai : this.qusd;
                const size = applyBps(bal, p.sizeBps);
                const loss = applyBps(size, 200n);
                if (p.side === 'sell') this.quai -= loss; else this.qusd -= loss;
                this.sandwiched++;
                this.heat = Math.max(0, this.heat - 0.2);
                fb.push({ text: `SANDWICHED −${p.side === 'sell' ? formatQuai(loss) + ' QUAI' : formatQuai(loss) + ' qUSD'}`, tone: 'bad', lane: e.note.lane });
                break;
            }
            case 'beat':
                this.heat = Math.max(0, this.heat - 0.01);
                break;
        }
        return fb;
    }

    private execute(p: SwapPayload, extraSlippage: bigint, lane: number, edgeBps: bigint = 0n): GameFeedback {
        if (p.side === 'sell') {
            const amountIn = applyBps(this.quai, p.sizeBps);
            if (amountIn <= 0n) return { text: 'NO QUAI', tone: 'neutral', lane };
            const ideal = this.pool.quote('base', amountIn, 0n).amountOut;
            const r = this.pool.swap('base', amountIn, extraSlippage);
            const edge = applyBps(r.amountOut, edgeBps);
            this.quai -= amountIn; this.qusd += r.amountOut + edge;
            this.edgeCaptured += edge;
            this.slippagePaid += ideal - r.amountOut;
            this.swaps++;
            this.heat = Math.min(1, this.heat + 0.08);
            return { text: `SOLD ${formatQuai(amountIn)} → ${formatQuai(r.amountOut)} qUSD`, tone: extraSlippage === 0n ? 'good' : 'neutral', lane };
        }
        const amountIn = applyBps(this.qusd, p.sizeBps);
        if (amountIn <= 0n) return { text: 'NO qUSD', tone: 'neutral', lane };
        const ideal = this.pool.quote('quote', amountIn, 0n).amountOut;
        const r = this.pool.swap('quote', amountIn, extraSlippage);
        const edge = applyBps(r.amountOut, edgeBps);
        this.qusd -= amountIn; this.quai += r.amountOut + edge;
        this.edgeCaptured += edge;
        this.slippagePaid += ideal - r.amountOut;
        this.swaps++;
        this.heat = Math.min(1, this.heat + 0.08);
        return { text: `BOUGHT ${formatQuai(r.amountOut)} QUAI`, tone: extraSlippage === 0n ? 'good' : 'neutral', lane };
    }

    hud(): HudLine[] {
        const pv = this.portfolioValue();
        const pnl = pv - this.startValue;
        return [
            { label: 'QUAI', value: formatQuai(this.quai) },
            { label: 'qUSD', value: formatQuai(this.qusd) },
            { label: 'Spot', value: `${fromWei(this.pool.spotPrice()).toFixed(4)} qUSD` },
            { label: 'PnL', value: `${pnl >= 0n ? '+' : '-'}${formatQuai(pnl < 0n ? -pnl : pnl)}`, tone: pnl >= 0n ? 'good' : 'bad' },
            { label: 'Edge captured', value: `+${formatQuai(this.edgeCaptured)}`, tone: 'good' },
            { label: 'Slippage paid', value: `−${formatQuai(this.slippagePaid)}`, tone: 'bad' },
        ];
    }

    intensity(): number { return this.heat; }

    summary(): RunSummary {
        const pv = this.portfolioValue();
        const pnl = pv - this.startValue;
        const pnlPts = Math.round(fromWei(pnl) * 50);
        return {
            gameId: this.meta.id,
            headline: `${this.swaps} swaps · PnL ${pnl >= 0n ? '+' : '-'}${formatQuai(pnl < 0n ? -pnl : pnl)} qUSD`,
            bonusPoints: Math.max(0, pnlPts),
            quaiDeltaWei: pnl,
            stats: {
                'Swaps': String(this.swaps),
                'Sandwiched': String(this.sandwiched),
                'Edge captured': `${formatQuai(this.edgeCaptured)}`,
                'Slippage paid': `${formatQuai(this.slippagePaid)}`,
                'Final value': `${formatQuai(pv)} qUSD`,
            },
        };
    }

    reset(): void {
        this.pool = new ConstantProductPool(toWei(100_000), toWei(100_000));
        this.quai = toWei(100); this.qusd = 0n; this.startValue = toWei(100);
        this.swaps = 0; this.sandwiched = 0; this.slippagePaid = 0n; this.edgeCaptured = 0n; this.heat = 0;
    }
}
