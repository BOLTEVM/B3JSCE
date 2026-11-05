/**
 * @b3js/engine — Rhythm input adapter
 *
 * One event stream for every platform:
 *   keyboard  — D F J K (4 lanes) / D Space K (3 lanes), arrows as alternates
 *   touch     — pointer events over the lane columns, multi-touch safe
 *   mouse     — same path as touch
 *   gamepad   — polled each frame (d-pad / face buttons / shoulders)
 *   XR / custom — `press(lane, down, timestamp)` is public so anything
 *                 (XR controllers, MIDI, logic bricks) can inject hits.
 *
 * Timestamps are high-resolution wall-clock ms (performance.now domain),
 * taken from the event itself where possible for sub-frame accuracy.
 */

export interface LaneInputEvent {
    lane: number;
    down: boolean;
    /** performance.now()-domain timestamp. */
    timeMs: number;
    source: 'keyboard' | 'pointer' | 'gamepad' | 'custom';
}

export type LaneInputListener = (e: LaneInputEvent) => void;

export const KEY_LAYOUTS: Readonly<Record<number, string[][]>> = {
    1: [['Space', 'KeyF', 'KeyJ', 'ArrowDown']],
    2: [['KeyF', 'ArrowLeft'], ['KeyJ', 'ArrowRight']],
    3: [['KeyD', 'ArrowLeft'], ['Space', 'ArrowDown', 'KeyF', 'KeyJ'], ['KeyK', 'ArrowRight']],
    4: [['KeyD', 'ArrowLeft'], ['KeyF', 'ArrowDown'], ['KeyJ', 'ArrowUp'], ['KeyK', 'ArrowRight']],
};

/** Standard-mapping gamepad button indices per lane. */
export const GAMEPAD_LAYOUTS: Readonly<Record<number, number[][]>> = {
    1: [[0, 1, 2, 3, 12, 13, 14, 15]],
    2: [[14, 4, 6, 2], [15, 5, 7, 0]],
    3: [[14, 4, 6], [13, 0, 2], [15, 5, 7]],
    4: [[14, 4], [13, 6], [0, 7], [1, 5]],
};

export function keyLabelsForLanes(lanes: number): string[] {
    const layout = KEY_LAYOUTS[lanes] ?? KEY_LAYOUTS[4];
    return layout.map(keys => keys[0].replace('Key', '').replace('Arrow', '').replace('Space', '␣'));
}

export class InputAdapter {
    private listeners = new Set<LaneInputListener>();
    private target: HTMLElement | null = null;
    private laneCount = 4;
    private activePointers = new Map<number, number>(); // pointerId → lane
    private keyDown = new Set<string>();
    private padState: boolean[][] = [];
    private cleanup: Array<() => void> = [];
    /** Set by the renderer: maps a client x/y to a lane (or −1). */
    public laneAt: (x: number, y: number) => number = () => -1;

    public enabled = true;

    onInput(fn: LaneInputListener): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }

    private emit(e: LaneInputEvent) { if (!this.enabled) return; for (const l of this.listeners) l(e); }

    /** Programmatic / XR / MIDI entry point. */
    press(lane: number, down: boolean, timeMs: number = nowMs(), source: LaneInputEvent['source'] = 'custom') {
        if (lane < 0 || lane >= this.laneCount) return;
        this.emit({ lane, down, timeMs, source });
    }

    attach(target: HTMLElement, laneCount: number) {
        this.detach();
        this.target = target;
        this.laneCount = laneCount;
        if (typeof window === 'undefined') return;

        const layout = KEY_LAYOUTS[laneCount] ?? KEY_LAYOUTS[4];
        const keyToLane = new Map<string, number>();
        layout.forEach((keys, lane) => keys.forEach(k => keyToLane.set(k, lane)));

        const onKeyDown = (ev: KeyboardEvent) => {
            if (ev.repeat) return;
            const lane = keyToLane.get(ev.code);
            if (lane === undefined) return;
            if (isTypingTarget(ev.target)) return;
            ev.preventDefault();
            this.keyDown.add(ev.code);
            this.emit({ lane, down: true, timeMs: eventTime(ev), source: 'keyboard' });
        };
        const onKeyUp = (ev: KeyboardEvent) => {
            const lane = keyToLane.get(ev.code);
            if (lane === undefined) return;
            this.keyDown.delete(ev.code);
            this.emit({ lane, down: false, timeMs: eventTime(ev), source: 'keyboard' });
        };
        window.addEventListener('keydown', onKeyDown, { capture: true });
        window.addEventListener('keyup', onKeyUp, { capture: true });
        this.cleanup.push(() => { window.removeEventListener('keydown', onKeyDown, { capture: true } as any); window.removeEventListener('keyup', onKeyUp, { capture: true } as any); });

        // Pointer (touch + mouse + pen) — multi-touch via pointerId
        target.style.touchAction = 'none';
        (target.style as any).webkitUserSelect = 'none';
        target.style.userSelect = 'none';
        const onDown = (ev: PointerEvent) => {
            const lane = this.laneAt(ev.clientX, ev.clientY);
            if (lane < 0) return;
            ev.preventDefault();
            try { target.setPointerCapture(ev.pointerId); } catch { /* unsupported */ }
            this.activePointers.set(ev.pointerId, lane);
            this.emit({ lane, down: true, timeMs: eventTime(ev), source: 'pointer' });
        };
        const onUp = (ev: PointerEvent) => {
            const lane = this.activePointers.get(ev.pointerId);
            if (lane === undefined) return;
            this.activePointers.delete(ev.pointerId);
            this.emit({ lane, down: false, timeMs: eventTime(ev), source: 'pointer' });
        };
        target.addEventListener('pointerdown', onDown);
        target.addEventListener('pointerup', onUp);
        target.addEventListener('pointercancel', onUp);
        target.addEventListener('contextmenu', prevent);
        this.cleanup.push(() => {
            target.removeEventListener('pointerdown', onDown);
            target.removeEventListener('pointerup', onUp);
            target.removeEventListener('pointercancel', onUp);
            target.removeEventListener('contextmenu', prevent);
        });

        this.padState = [];
    }

    /** Poll gamepads — call once per frame. */
    pollGamepads(timeMs: number = nowMs()) {
        if (typeof navigator === 'undefined' || typeof (navigator as any).getGamepads !== 'function') return;
        const pads = (navigator as any).getGamepads() as (Gamepad | null)[];
        const layout = GAMEPAD_LAYOUTS[this.laneCount] ?? GAMEPAD_LAYOUTS[4];
        for (let p = 0; p < pads.length; p++) {
            const pad = pads[p];
            if (!pad) continue;
            if (!this.padState[p]) this.padState[p] = new Array(this.laneCount).fill(false);
            for (let lane = 0; lane < this.laneCount; lane++) {
                const pressed = layout[lane].some(b => pad.buttons[b]?.pressed);
                if (pressed !== this.padState[p][lane]) {
                    this.padState[p][lane] = pressed;
                    this.emit({ lane, down: pressed, timeMs, source: 'gamepad' });
                }
            }
        }
    }

    releaseAll(timeMs: number = nowMs()) {
        for (const lane of new Set(this.activePointers.values())) this.emit({ lane, down: false, timeMs, source: 'pointer' });
        this.activePointers.clear();
        this.keyDown.clear();
    }

    detach() {
        for (const c of this.cleanup) c();
        this.cleanup = [];
        this.activePointers.clear();
        this.keyDown.clear();
        this.padState = [];
        this.target = null;
    }
}

function prevent(e: Event) { e.preventDefault(); }

function isTypingTarget(t: EventTarget | null): boolean {
    const el = t as HTMLElement | null;
    if (!el || !el.tagName) return false;
    const tag = el.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || (el as any).isContentEditable === true;
}

export function nowMs(): number { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }

/** Prefer the event's own high-res timestamp when it is in the performance domain. */
function eventTime(ev: Event): number {
    const t = (ev as any).timeStamp;
    if (typeof t === 'number' && t > 0 && t < 1e12) return t; // performance.now domain
    return nowMs();
}
