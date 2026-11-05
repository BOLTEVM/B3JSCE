/**
 * @b3js/engine — Rhythm DeFi primitives
 *
 * Small, auditable DeFi models the rhythm games are built on. Every
 * monetary quantity is a **bigint in wei** (18 decimals) — no floats near
 * money. Percentages are basis points (1 bps = 0.01%).
 *
 * Models:
 *   ConstantProductPool  — Uniswap-v2 style x·y=k AMM (Swap Tempo)
 *   LendingPosition      — collateral/debt with a health factor (Liquidation Dodge)
 *   StakingVault         — per-beat compounding (Yield Stairway)
 *   QuaiHierarchy        — Quai Network's Prime → Region → Zone block cadence
 *                          and the Qi ↔ Quai conversion idea (Merge Pulse)
 *
 * The Quai constants are gameplay abstractions of the public network
 * design (1 Prime, 3 Regions, 9 Zones, merged mining, dual QUAI/QI tokens);
 * they are tuned for feel, not for parity with mainnet parameters.
 */

import { QUAI_WEI, BPS } from '@b3js/web3';

export { QUAI_WEI, BPS };

/** Float QUAI → wei without float64 precision loss above 2^53. */
export function toWei(amount: number, decimals = 18): bigint {
    if (!Number.isFinite(amount) || amount < 0) return 0n;
    const micro = BigInt(Math.round(amount * 1e6));
    return micro * 10n ** BigInt(decimals - 6);
}

/** wei → float (display / scoring only). */
export function fromWei(wei: bigint, decimals = 18): number {
    return Number(wei) / 10 ** decimals;
}

/** Scale `value` by `bps` basis points. */
export function applyBps(value: bigint, bps: bigint | number): bigint {
    return (value * BigInt(bps)) / BPS;
}

/** Fixed-point ratio a/b scaled by 1e4 (so 1.0 = 10000). */
export function ratioBps(a: bigint, b: bigint): bigint {
    if (b === 0n) return a === 0n ? BPS : BPS * 1000n; // "infinite"
    return (a * BPS) / b;
}

// ═══════════════════════════════════════════════════════════════════
//  Constant-product AMM
// ═══════════════════════════════════════════════════════════════════

export interface SwapResult {
    amountIn: bigint;
    amountOut: bigint;
    /** Fee taken from amountIn (wei of the input token). */
    fee: bigint;
    /** Execution price impact vs. spot, in bps. */
    priceImpactBps: bigint;
    /** New spot price (quote per base, 1e18 scale). */
    spotAfter: bigint;
}

/**
 * x·y = k pool. `reserveBase` is the asset being traded (e.g. QUAI),
 * `reserveQuote` the pricing asset (e.g. a stablecoin).
 */
export class ConstantProductPool {
    constructor(
        public reserveBase: bigint,
        public reserveQuote: bigint,
        /** LP fee in bps (30 = 0.30%). */
        public readonly feeBps: bigint = 30n,
    ) {
        if (reserveBase <= 0n || reserveQuote <= 0n) throw new Error('ConstantProductPool: reserves must be > 0');
    }

    get k(): bigint { return this.reserveBase * this.reserveQuote; }

    /** Spot price of 1 base in quote, 1e18-scaled. */
    spotPrice(): bigint { return (this.reserveQuote * QUAI_WEI) / this.reserveBase; }

    /** Quote an output amount for selling `amountIn` of `side`. */
    quote(side: 'base' | 'quote', amountIn: bigint, extraSlippageBps: bigint = 0n): SwapResult {
        if (amountIn <= 0n) throw new Error('ConstantProductPool: amountIn must be > 0');
        const [rIn, rOut] = side === 'base' ? [this.reserveBase, this.reserveQuote] : [this.reserveQuote, this.reserveBase];
        const fee = applyBps(amountIn, this.feeBps);
        const inAfterFee = amountIn - fee;
        let amountOut = (rOut * inAfterFee) / (rIn + inAfterFee);
        // Gameplay hook: a sloppy hit executes worse than the pool math says.
        if (extraSlippageBps > 0n) amountOut -= applyBps(amountOut, extraSlippageBps);

        const spotBefore = (rOut * QUAI_WEI) / rIn;
        const execPrice = (amountOut * QUAI_WEI) / amountIn;
        const impact = spotBefore > 0n ? ((spotBefore - execPrice) * BPS) / spotBefore : 0n;
        const newIn = rIn + amountIn;
        const newOut = rOut - amountOut;
        const spotAfter = side === 'base' ? (newOut * QUAI_WEI) / newIn : (newIn * QUAI_WEI) / newOut;
        return { amountIn, amountOut, fee, priceImpactBps: impact < 0n ? 0n : impact, spotAfter };
    }

    /** Execute a swap, mutating reserves. */
    swap(side: 'base' | 'quote', amountIn: bigint, extraSlippageBps: bigint = 0n): SwapResult {
        const r = this.quote(side, amountIn, extraSlippageBps);
        if (side === 'base') { this.reserveBase += amountIn; this.reserveQuote -= r.amountOut; }
        else { this.reserveQuote += amountIn; this.reserveBase -= r.amountOut; }
        return r;
    }

    /** Add liquidity proportionally; returns LP share in bps of the pool. */
    addLiquidity(base: bigint, quote: bigint): bigint {
        const shareBps = ratioBps(base, this.reserveBase + base);
        this.reserveBase += base;
        this.reserveQuote += quote;
        return shareBps;
    }
}

// ═══════════════════════════════════════════════════════════════════
//  Lending position & health factor
// ═══════════════════════════════════════════════════════════════════

export class LendingPosition {
    constructor(
        /** Collateral in base units (e.g. QUAI wei). */
        public collateral: bigint,
        /** Debt in quote units (wei). */
        public debt: bigint,
        /** Collateral price in quote, 1e18 scale. */
        public price: bigint,
        /** Liquidation threshold, bps of collateral value (8000 = 80%). */
        public readonly liquidationThresholdBps: bigint = 8000n,
    ) {}

    collateralValue(): bigint { return (this.collateral * this.price) / QUAI_WEI; }

    /** Health factor ×1e4 (10000 = 1.0). <10000 → liquidatable. */
    healthFactorBps(): bigint {
        if (this.debt === 0n) return BPS * 100n;
        const adjusted = applyBps(this.collateralValue(), this.liquidationThresholdBps);
        return (adjusted * BPS) / this.debt;
    }

    healthFactor(): number { return Number(this.healthFactorBps()) / 1e4; }

    isLiquidatable(): boolean { return this.healthFactorBps() < BPS; }

    /** Move the oracle price by signed bps (−500 = −5%). */
    applyPriceShock(bps: bigint | number): bigint {
        const b = BigInt(bps);
        this.price = this.price + (this.price * b) / BPS;
        if (this.price < 1n) this.price = 1n;
        return this.price;
    }

    addCollateral(amount: bigint) { this.collateral += amount; }

    /** Repay debt; returns the amount actually repaid. */
    repay(amount: bigint): bigint {
        const paid = amount > this.debt ? this.debt : amount;
        this.debt -= paid;
        return paid;
    }

    /** Accrue interest on the debt (bps per period). */
    accrueInterest(bps: bigint | number) { this.debt += applyBps(this.debt, bps); }

    /**
     * Liquidate: seize collateral worth debt × (1 + penalty). Returns seized.
     */
    liquidate(penaltyBps: bigint = 500n): bigint {
        if (!this.isLiquidatable()) return 0n;
        const owed = this.debt + applyBps(this.debt, penaltyBps);
        let seize = (owed * QUAI_WEI) / this.price;
        if (seize > this.collateral) seize = this.collateral;
        this.collateral -= seize;
        this.debt = 0n;
        return seize;
    }
}

// ═══════════════════════════════════════════════════════════════════
//  Staking vault — per-beat compounding
// ═══════════════════════════════════════════════════════════════════

export class StakingVault {
    public staked: bigint = 0n;
    public rewards: bigint = 0n;
    public totalPenalties: bigint = 0n;

    constructor(
        /** Reward rate per beat, in bps (e.g. 25 = 0.25%/beat). */
        public rateBpsPerBeat: bigint = 25n,
        /** Early-unstake penalty, bps of principal. */
        public earlyPenaltyBps: bigint = 1000n,
    ) {}

    stake(amount: bigint) { this.staked += amount; }

    /** Compound one beat: rewards are auto-restaked. Returns the yield. */
    compoundBeat(multiplier: number = 1): bigint {
        const rate = BigInt(Math.round(Number(this.rateBpsPerBeat) * Math.max(0, multiplier)));
        const y = applyBps(this.staked, rate);
        this.staked += y;
        this.rewards += y;
        return y;
    }

    /** Unstake everything. `early` applies the penalty. Returns net payout. */
    unstake(early: boolean): bigint {
        let out = this.staked;
        if (early) {
            const pen = applyBps(out, this.earlyPenaltyBps);
            out -= pen;
            this.totalPenalties += pen;
        }
        this.staked = 0n;
        return out;
    }

    /** Effective APR-ish figure for display: bps/beat × beats. */
    static projectedBps(rateBpsPerBeat: bigint, beats: number): bigint {
        // (1 + r)^n − 1 via bigint fixed-point to avoid float drift
        let acc = BPS;
        for (let i = 0; i < beats; i++) acc = acc + (acc * rateBpsPerBeat) / BPS;
        return acc - BPS;
    }
}

// ═══════════════════════════════════════════════════════════════════
//  Quai Network hierarchy — Prime / Region / Zone
// ═══════════════════════════════════════════════════════════════════

export type QuaiTier = 'zone' | 'region' | 'prime';

/** Quai's public topology: 1 Prime, 3 Regions, 9 Zones. */
export const QUAI_REGIONS = ['Cyprus', 'Paxos', 'Hydra'] as const;
export const QUAI_ZONES = [
    'Cyprus-1', 'Cyprus-2', 'Cyprus-3',
    'Paxos-1', 'Paxos-2', 'Paxos-3',
    'Hydra-1', 'Hydra-2', 'Hydra-3',
] as const;

/**
 * Block cadence in beats per block for each tier. Zones are fastest;
 * a Region block coincides with every 3rd Zone block and a Prime block with
 * every 3rd Region block — mirroring merged mining, where one PoW solution
 * can satisfy multiple tiers' difficulty targets.
 */
export const QUAI_TIER_PERIOD_BEATS: Readonly<Record<QuaiTier, number>> = { zone: 1, region: 3, prime: 9 };

/** Stylised block rewards per tier (wei). Higher tiers are rarer → richer. */
export const QUAI_TIER_REWARD_WEI: Readonly<Record<QuaiTier, bigint>> = {
    zone: QUAI_WEI / 10n,        // 0.1 QUAI
    region: QUAI_WEI / 2n,       // 0.5 QUAI
    prime: 2n * QUAI_WEI,        // 2.0 QUAI
};

/** Which tiers a beat index belongs to (a Prime beat is also Region + Zone). */
export function tiersAtBeat(beat: number): QuaiTier[] {
    const tiers: QuaiTier[] = ['zone'];
    if (beat % QUAI_TIER_PERIOD_BEATS.region === 0) tiers.push('region');
    if (beat % QUAI_TIER_PERIOD_BEATS.prime === 0) tiers.push('prime');
    return tiers;
}

/** Highest tier a beat can "merge" up to. */
export function topTierAtBeat(beat: number): QuaiTier {
    const t = tiersAtBeat(beat);
    return t[t.length - 1];
}

/** Total reward for a merged block hitting all `tiers` at once. */
export function mergedReward(tiers: QuaiTier[]): bigint {
    return tiers.reduce((acc, t) => acc + QUAI_TIER_REWARD_WEI[t], 0n);
}

/**
 * Qi ↔ Quai conversion (stylised). Quai's design pairs QUAI (store of value)
 * with QI (energy-pegged unit); conversion is rate-based with a spread. We
 * model a mid rate (1e18-scaled QI per QUAI) and a spread in bps that the
 * player's timing can tighten.
 */
export class QiQuaiConverter {
    constructor(
        /** QI per QUAI, 1e18 scale. */
        public midRate: bigint = 10n * QUAI_WEI,
        /** Base spread in bps; perfect timing removes most of it. */
        public readonly baseSpreadBps: bigint = 200n,
    ) {}

    quaiToQi(quaiWei: bigint, spreadBps: bigint = this.baseSpreadBps): bigint {
        const gross = (quaiWei * this.midRate) / QUAI_WEI;
        return gross - applyBps(gross, spreadBps);
    }

    qiToQuai(qiWei: bigint, spreadBps: bigint = this.baseSpreadBps): bigint {
        const gross = (qiWei * QUAI_WEI) / this.midRate;
        return gross - applyBps(gross, spreadBps);
    }

    /** Drift the rate by signed bps to simulate difficulty/energy changes. */
    drift(bps: bigint | number) {
        this.midRate += (this.midRate * BigInt(bps)) / BPS;
        if (this.midRate < 1n) this.midRate = 1n;
    }
}
