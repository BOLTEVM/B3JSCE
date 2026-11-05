/**
 * XRRhythmInput — controllers and hands as drum sticks.
 *
 * Two ways to hit a lane, both routed through the arcade's InputAdapter so
 * judgement is identical to keyboard/touch:
 *   1. Physical: a controller (or tracked index fingertip) enters a pad's
 *      hit volume → press; leaves → release. Feels like drumming.
 *   2. Pointed: hold the trigger while the controller ray points at a pad
 *      (accessibility / seated play).
 *
 * Also forwards judgement/feedback to the controllers' haptic actuators.
 */

import * as THREE from 'three';
import type { StageLayout } from './layout';
import { laneAtPoint } from './layout';

export interface XRInputTarget {
    press(lane: number, down: boolean, timeMs?: number): void;
}

export class XRRhythmInput {
    /** Lane each tracked tip is currently inside (−1 = none). */
    private tipLane: number[] = [-1, -1, -1, -1];
    /** Lane each controller is holding via trigger-point (−1 = none). */
    private pointLane: number[] = [-1, -1];
    private raycaster = new THREE.Raycaster();
    private tmpMat = new THREE.Matrix4();
    private tmpVec = new THREE.Vector3();
    private inv = new THREE.Matrix4();
    public enabled = false;
    /** Called when a trigger press hits nothing on the stage (menu selection). */
    public onFreeSelect: ((index: number, ray: THREE.Raycaster) => void) | null = null;
    public onGrip: ((index: number, down: boolean) => void) | null = null;
    private gripDown = [false, false];

    constructor(
        private readonly renderer: THREE.WebGLRenderer,
        private readonly stage: THREE.Object3D,
        private readonly getLayout: () => StageLayout,
        private readonly getPads: () => THREE.Mesh[],
        private readonly target: XRInputTarget,
        private readonly onHeld?: (lane: number, held: boolean) => void,
    ) {
        for (let i = 0; i < 2; i++) {
            const c = renderer.xr.getController(i);
            c.addEventListener('selectstart', () => this.onSelect(i, true));
            c.addEventListener('selectend', () => this.onSelect(i, false));
            c.addEventListener('squeezestart', () => { this.gripDown[i] = true; this.onGrip?.(i, true); });
            c.addEventListener('squeezeend', () => { this.gripDown[i] = false; this.onGrip?.(i, false); });
        }
    }

    bothGripsDown(): boolean { return this.gripDown[0] && this.gripDown[1]; }

    private ray(index: number): THREE.Raycaster {
        const c = this.renderer.xr.getController(index);
        this.tmpMat.identity().extractRotation(c.matrixWorld);
        this.raycaster.ray.origin.setFromMatrixPosition(c.matrixWorld);
        this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.tmpMat);
        return this.raycaster;
    }

    private onSelect(index: number, down: boolean) {
        if (!this.enabled) { if (down) this.onFreeSelect?.(index, this.ray(index)); return; }
        if (down) {
            const hits = this.ray(index).intersectObjects(this.getPads(), false);
            if (hits.length) {
                const lane = hits[0].object.userData.lane as number;
                this.pointLane[index] = lane;
                this.target.press(lane, true);
                this.onHeld?.(lane, true);
            } else {
                this.onFreeSelect?.(index, this.raycaster);
            }
        } else if (this.pointLane[index] >= 0) {
            const lane = this.pointLane[index];
            this.pointLane[index] = -1;
            this.target.press(lane, false);
            this.onHeld?.(lane, false);
        }
    }

    /** Per-frame: track controller + fingertip positions against pad volumes. */
    update() {
        if (!this.enabled) return;
        this.stage.updateMatrixWorld(true);
        this.inv.copy(this.stage.matrixWorld).invert();
        const layout = this.getLayout();
        for (let i = 0; i < 2; i++) {
            const c = this.renderer.xr.getController(i);
            this.check(i, c.getWorldPosition(this.tmpVec), layout);
            const hand: any = (this.renderer.xr as any).getHand?.(i);
            const tip = hand?.joints?.['index-finger-tip'];
            if (tip) this.check(2 + i, tip.getWorldPosition(this.tmpVec), layout);
        }
    }

    private check(slot: number, world: THREE.Vector3, layout: StageLayout) {
        const local = world.applyMatrix4(this.inv);
        const lane = laneAtPoint(layout, local.x, local.y, local.z);
        const prev = this.tipLane[slot];
        if (lane === prev) return;
        if (prev >= 0) { this.target.press(prev, false); this.onHeld?.(prev, false); }
        if (lane >= 0) { this.target.press(lane, true); this.onHeld?.(lane, true); }
        this.tipLane[slot] = lane;
    }

    /** Pulse the controller haptics (0..1 intensity, ms). */
    pulse(intensity: number, ms: number, hand: 'left' | 'right' | 'both' = 'both') {
        const session = this.renderer.xr.getSession();
        if (!session) return;
        for (const src of session.inputSources) {
            if (hand !== 'both' && src.handedness !== hand) continue;
            const act = (src.gamepad as any)?.hapticActuators?.[0];
            try { act?.pulse?.(intensity, ms); } catch { /* unsupported */ }
        }
    }

    releaseAll() {
        for (let s = 0; s < this.tipLane.length; s++) { if (this.tipLane[s] >= 0) { this.target.press(this.tipLane[s], false); this.onHeld?.(this.tipLane[s], false); } this.tipLane[s] = -1; }
        for (let i = 0; i < 2; i++) { if (this.pointLane[i] >= 0) { this.target.press(this.pointLane[i], false); this.onHeld?.(this.pointLane[i], false); } this.pointLane[i] = -1; }
    }
}
