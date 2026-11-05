/**
 * XR stage layout — pure geometry, no Three.js, so it is unit-testable.
 *
 * The player stands at the origin facing −Z. Lane pads sit in a shallow arc
 * in front of them at chest height; notes travel down a "highway" toward
 * the pads. Everything is in metres.
 */

export interface PadSpec {
    lane: number;
    /** Pad centre in stage-local space. */
    x: number; y: number; z: number;
    /** Half-extents of the hit volume. */
    hx: number; hy: number; hz: number;
}

export interface StageLayout {
    pads: PadSpec[];
    /** Highway length (m) from spawn to pad. */
    highwayLength: number;
    /** Rise of the far end above pad height (m). */
    highwayRise: number;
    /** Note slab size. */
    noteW: number; noteH: number; noteD: number;
    hudPos: { x: number; y: number; z: number };
}

export interface LayoutOptions {
    lanes: number;
    /** Pad height — defaults to a comfortable standing drum height. */
    padHeight?: number;
    /** Distance from the player to the pads. */
    reach?: number;
    /** Centre-to-centre spacing between pads. */
    spacing?: number;
    /** Arc curvature (radians across the full pad row); 0 = straight. */
    arc?: number;
}

export function computeLayout(opts: LayoutOptions): StageLayout {
    const lanes = Math.max(1, opts.lanes);
    const padHeight = opts.padHeight ?? 1.0;
    const reach = opts.reach ?? 0.55;
    const spacing = opts.spacing ?? 0.24;
    const arc = opts.arc ?? 0.5;
    const pads: PadSpec[] = [];
    for (let i = 0; i < lanes; i++) {
        const t = lanes === 1 ? 0 : (i / (lanes - 1)) - 0.5;     // −0.5..0.5 across the row
        const angle = t * arc;                                    // shallow arc around the player
        pads.push({
            lane: i,
            x: arc === 0 ? t * spacing * (lanes - 1) : Math.sin(angle) * reach,
            y: padHeight,
            z: -Math.cos(angle) * reach,
            hx: spacing * 0.42, hy: 0.09, hz: spacing * 0.42,
        });
    }
    // Normalise the x spread to the requested spacing so pads stay reachable on any lane count.
    if (lanes > 1) {
        const x0 = pads[0].x;
        const span = pads[lanes - 1].x - x0;
        const want = spacing * (lanes - 1);
        if (span > 0) for (const p of pads) p.x = (p.x - x0) * (want / span) - want / 2;
    }
    return {
        pads,
        highwayLength: 5,
        highwayRise: 0.35,
        noteW: spacing * 0.8, noteH: 0.05, noteD: 0.12,
        hudPos: { x: 0, y: padHeight + 0.95, z: -reach - 1.6 },
    };
}

/** Lane whose hit volume contains the point, or −1. */
export function laneAtPoint(layout: StageLayout, x: number, y: number, z: number): number {
    let best = -1; let bestD = Infinity;
    for (const p of layout.pads) {
        if (Math.abs(x - p.x) <= p.hx && Math.abs(y - p.y) <= p.hy && Math.abs(z - p.z) <= p.hz) {
            const d = (x - p.x) ** 2 + (z - p.z) ** 2;
            if (d < bestD) { bestD = d; best = p.lane; }
        }
    }
    return best;
}

/** Position of a note along the highway for a normalised time t (1 = spawn, 0 = hit, <0 = past). */
export function notePosition(layout: StageLayout, pad: PadSpec, t: number): { x: number; y: number; z: number } {
    const tt = Math.max(-0.08, t);
    return { x: pad.x, y: pad.y + layout.highwayRise * tt + 0.03, z: pad.z - layout.highwayLength * tt };
}
