/**
 * XRArcade — the WebXR mini-game arcade for Quai DeFi.
 *
 * Owns the in-headset stage (XRRhythmStage), the drum-pad input
 * (XRRhythmInput) and a floating game-picker: five cards, one per game,
 * plus difficulty chips. Point + trigger a card to start; the stage
 * recentres in front of the player; pads light up; results float on the
 * HUD; hit any pad to go again. Grip pauses, both grips exit to the picker.
 *
 * Works outside a headset too: the stage is a 3D visualiser for runs
 * played with keyboard/touch, and the cards can be clicked with the mouse
 * through the engine's normal selection (they are B3Objects).
 */

import * as THREE from 'three';
import type { RhythmArcade } from '../arcade';
import type { ArcadeEvent } from '../arcade';
import type { Difficulty, MiniGameMeta } from '../game';
import { XRRhythmStage } from './XRRhythmStage';
import { XRRhythmInput } from './XRRhythmInput';

const DIFFS: Difficulty[] = ['easy', 'normal', 'hard', 'insane'];

export class XRArcade {
    public readonly group = new THREE.Group();
    public stage: XRRhythmStage | null = null;
    public input: XRRhythmInput | null = null;
    public difficulty: Difficulty = 'normal';
    private cards: THREE.Mesh[] = [];
    private chips: THREE.Mesh[] = [];
    private mounted = false;
    private unsub: (() => void) | null = null;
    private stageAttached = false;
    private cardCanvases = new Map<THREE.Mesh, { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture }>();

    constructor(private readonly arcade: RhythmArcade, private readonly engine: any) {
        this.group.name = 'XR Arcade';
    }

    get active(): boolean { return this.mounted && this.arcade.phase !== 'idle' && this.stageAttached; }
    /** True while the XR arcade should own controller input (locomotion off). */
    capturesInput(): boolean { return this.active && this.isPresenting(); }
    isPresenting(): boolean { return !!this.engine?.renderer?.xr?.isPresenting; }

    /** Build the picker + stage and add them to the scene at `position`. */
    mount(position = new THREE.Vector3(0, 0, 0), yaw = 0) {
        if (this.mounted) this.unmount();
        if (typeof document === 'undefined') return;
        this.mounted = true;
        this.group.position.copy(position);
        this.group.rotation.y = yaw;
        this.engine.scene.add(this.group);

        this.stage = new XRRhythmStage(4);
        this.group.add(this.stage.group);
        this.buildPicker();

        if (this.engine?.renderer) {
            this.input = new XRRhythmInput(
                this.engine.renderer, this.stage.group,
                () => this.stage!.layout, () => this.stage!.padMeshes,
                { press: (lane, down, t) => this.arcade.press(lane, down, t) },
                (lane, held) => this.stage?.setHeld(lane, held),
            );
            this.input.onFreeSelect = (_i, ray) => this.pickWithRay(ray);
            this.input.onGrip = (_i, down) => {
                if (!down) return;
                if (this.input!.bothGripsDown()) { this.arcade.stop(); return; }
                if (this.arcade.phase === 'playing') this.arcade.pause();
                else if (this.arcade.phase === 'paused') this.arcade.resume();
            };
        }

        this.unsub = this.arcade.on(e => this.onArcadeEvent(e));
        this.refreshPicker();
    }

    unmount() {
        this.unsub?.(); this.unsub = null;
        this.detachStage();
        this.stage?.dispose(); this.stage = null;
        this.input = null;
        for (const c of this.cards) this.disposeCard(c);
        for (const c of this.chips) this.disposeCard(c);
        this.cards = []; this.chips = [];
        this.group.parent?.remove(this.group);
        this.mounted = false;
    }

    /** Start a game on the XR stage (recentred in front of the player). */
    async start(gameId: string, difficulty: Difficulty = this.difficulty): Promise<boolean> {
        if (!this.mounted || !this.stage) return false;
        this.difficulty = difficulty;
        this.recenter();
        this.attachStage();
        // In a headset the 2D canvas is useless (and steals pointer focus); keep it on flat screens.
        const ok = await this.arcade.start(gameId, { difficulty, canvas: !this.isPresenting() });
        if (!ok) this.detachStage();
        return ok;
    }

    /** Move the stage so the pads are in front of where the player is looking. */
    recenter() {
        if (!this.stage || !this.engine?.camera) return;
        const cam: THREE.Camera = this.engine.camera;
        const pos = new THREE.Vector3(); cam.getWorldPosition(pos);
        const dir = new THREE.Vector3(); cam.getWorldDirection(dir); dir.y = 0;
        if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1); else dir.normalize();
        const yaw = Math.atan2(-dir.x, -dir.z);
        // Stage origin = player's floor position; pads at pad height in local space.
        const local = this.group.worldToLocal(new THREE.Vector3(pos.x, this.group.position.y, pos.z));
        this.stage.group.position.copy(local);
        this.stage.group.rotation.y = yaw - this.group.rotation.y;
        // Pads at the player's own chest height (standing or seated)
        const padHeight = Math.max(0.6, Math.min(1.4, pos.y - this.group.position.y - 0.55));
        this.stage.setPadHeight(padHeight);
    }

    update() {
        if (!this.mounted) return;
        this.input?.update();
        // Gentle idle animation on the picker
        const t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
        this.cards.forEach((c, i) => { c.position.y = c.userData.baseY + Math.sin(t * 1.3 + i) * 0.02; });
    }

    private attachStage() {
        if (!this.stage || this.stageAttached) return;
        this.arcade.attachView(this.stage);
        if (this.input) this.input.enabled = true;
        this.stageAttached = true;
        this.setPickerVisible(false);
    }

    private detachStage() {
        if (!this.stage || !this.stageAttached) return;
        this.input?.releaseAll();
        if (this.input) this.input.enabled = false;
        this.arcade.detachView(this.stage);
        this.stageAttached = false;
        this.setPickerVisible(true);
    }

    private onArcadeEvent(e: ArcadeEvent) {
        if (e.type === 'judgement') {
            const i = e.judgement === 'PERFECT' ? 0.8 : e.judgement === 'GREAT' ? 0.5 : e.judgement === 'GOOD' ? 0.3 : 1.0;
            this.input?.pulse(i, e.judgement === 'MISS' ? 120 : 40, e.lane < 2 ? 'left' : 'right');
        } else if (e.type === 'fever') {
            this.input?.pulse(1, 300);
        } else if (e.type === 'feedback' && e.feedback.tone === 'epic') {
            this.input?.pulse(0.9, 150);
        } else if (e.type === 'end') {
            this.input?.pulse(0.7, 250);
            this.refreshPicker();
        } else if (e.type === 'phase' && e.phase === 'idle') {
            this.detachStage();
            this.refreshPicker();
        }
    }

    // ── Picker ────────────────────────────────────────────────────
    private buildPicker() {
        const games: MiniGameMeta[] = this.arcade.listGames();
        const n = games.length;
        games.forEach((g, i) => {
            const t = n === 1 ? 0 : i / (n - 1) - 0.5;
            const angle = t * 1.4;
            const r = 2.2;
            const mesh = this.makeCard(0.9, 0.55);
            mesh.position.set(Math.sin(angle) * r, 1.5, -Math.cos(angle) * r);
            mesh.lookAt(0, 1.5, 0);
            mesh.userData = { gameId: g.id, baseY: 1.5, kind: 'card' };
            this.group.add(mesh);
            this.cards.push(mesh);
        });
        DIFFS.forEach((d, i) => {
            const mesh = this.makeCard(0.34, 0.14);
            mesh.position.set((i - 1.5) * 0.4, 0.95, -1.9);
            mesh.lookAt(0, 1.0, 0);
            mesh.userData = { difficulty: d, baseY: 0.95, kind: 'chip' };
            this.group.add(mesh);
            this.chips.push(mesh);
        });
    }

    private makeCard(w: number, h: number): THREE.Mesh {
        const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = Math.round(512 * h / w);
        const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }));
        this.cardCanvases.set(mesh, { canvas, tex });
        return mesh;
    }

    private disposeCard(mesh: THREE.Mesh) {
        const c = this.cardCanvases.get(mesh);
        c?.tex.dispose();
        mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose();
        mesh.parent?.remove(mesh);
        this.cardCanvases.delete(mesh);
    }

    /** Repaint cards (bests, lock state) — cheap enough to do on every end/idle. */
    refreshPicker() {
        const games = this.arcade.listGames();
        this.cards.forEach((mesh, i) => {
            const g = games[i]; if (!g) return;
            const { canvas, tex } = this.cardCanvases.get(mesh)!;
            const ctx = canvas.getContext('2d')!; const W = canvas.width, H = canvas.height;
            ctx.clearRect(0, 0, W, H);
            ctx.fillStyle = 'rgba(8, 6, 20, 0.92)'; ctx.fillRect(0, 0, W, H);
            ctx.strokeStyle = g.color; ctx.lineWidth = 10; ctx.strokeRect(5, 5, W - 10, H - 10);
            ctx.fillStyle = g.color; ctx.font = 'bold 46px system-ui, sans-serif'; ctx.fillText(`${g.icon} ${g.title}`, 28, 70);
            ctx.fillStyle = '#ddd'; ctx.font = '26px system-ui, sans-serif'; ctx.fillText(g.tagline, 28, 115);
            ctx.fillStyle = '#999'; ctx.font = '22px system-ui, sans-serif';
            wrapText(ctx, g.lesson, 28, 160, W - 56, 28, 3);
            const best = this.arcade.progress.best(g.id, this.difficulty);
            ctx.fillStyle = '#fff'; ctx.font = 'bold 24px system-ui, sans-serif';
            ctx.fillText(best ? `BEST ${best.score.toLocaleString()} · ${best.grade}` : 'NO RUNS YET', 28, H - 30);
            ctx.textAlign = 'right'; ctx.fillStyle = g.color; ctx.fillText('TRIGGER TO PLAY ▶', W - 28, H - 30); ctx.textAlign = 'left';
            tex.needsUpdate = true;
        });
        this.chips.forEach((mesh, i) => {
            const d = DIFFS[i];
            const { canvas, tex } = this.cardCanvases.get(mesh)!;
            const ctx = canvas.getContext('2d')!; const W = canvas.width, H = canvas.height;
            const unlocked = this.arcade.progress.isUnlocked(d);
            const sel = this.difficulty === d;
            ctx.clearRect(0, 0, W, H);
            ctx.fillStyle = sel ? '#ff3333' : 'rgba(8, 6, 20, 0.92)'; ctx.fillRect(0, 0, W, H);
            ctx.strokeStyle = unlocked ? '#ff3333' : '#444'; ctx.lineWidth = 8; ctx.strokeRect(4, 4, W - 8, H - 8);
            ctx.fillStyle = sel ? '#000' : unlocked ? '#fff' : '#666'; ctx.font = 'bold 60px system-ui, sans-serif'; ctx.textAlign = 'center';
            ctx.fillText(`${d.toUpperCase()}${unlocked ? '' : ' 🔒'}`, W / 2, H / 2 + 22); ctx.textAlign = 'left';
            tex.needsUpdate = true;
        });
    }

    private setPickerVisible(v: boolean) { for (const c of this.cards) c.visible = v; for (const c of this.chips) c.visible = v; }

    /** Trigger pressed with nothing on the stage under the ray: pick a card/chip. */
    pickWithRay(ray: THREE.Raycaster): boolean {
        if (this.arcade.phase !== 'idle') return false;
        const hits = ray.intersectObjects([...this.cards, ...this.chips], false);
        if (!hits.length) return false;
        const u = hits[0].object.userData;
        if (u.kind === 'chip') {
            if (this.arcade.progress.isUnlocked(u.difficulty)) { this.difficulty = u.difficulty; this.refreshPicker(); this.input?.pulse(0.4, 40); }
            else this.input?.pulse(1, 120);
            return true;
        }
        if (u.kind === 'card') { void this.start(u.gameId, this.difficulty); return true; }
        return false;
    }

    /** Flat-screen fallback: pick by a mouse/pointer ray from the engine camera. */
    pickAtNdc(x: number, y: number): boolean {
        const ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2(x, y), this.engine.camera);
        return this.pickWithRay(ray);
    }
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, maxLines: number) {
    let line = ''; let lines = 0;
    for (const word of text.split(' ')) {
        const t = line ? `${line} ${word}` : word;
        if (ctx.measureText(t).width > maxW) { ctx.fillText(line, x, y); y += lh; line = word; if (++lines >= maxLines - 1) break; } else line = t;
    }
    if (line) ctx.fillText(line, x, y);
}
