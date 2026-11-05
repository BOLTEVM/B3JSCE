/**
 * XRRhythmStage — the in-headset view of a rhythm run.
 *
 * Implements ArcadeView: given the arcade's RenderState each frame it moves
 * pooled note slabs down four glowing highways toward physical drum pads,
 * flashes pads on judgement, floats feedback sprites, and paints the HUD
 * (score, combo, FEVER, the game's DeFi lines) and the results card onto a
 * canvas-textured panel. Pure presentation: input lives in XRRhythmInput.
 */

import * as THREE from 'three';
import type { ArcadeView } from '../view';
import type { RenderState, FloatingText } from '../renderer';
import type { Note } from '../core';
import { computeLayout, notePosition } from './layout';
import type { StageLayout, PadSpec } from './layout';

const POOL = 48;
const SPRITES = 8;

export class XRRhythmStage implements ArcadeView {
    public readonly group = new THREE.Group();
    public layout: StageLayout;
    private lanes = 4;
    private pads: THREE.Mesh[] = [];
    private padMats: THREE.MeshStandardMaterial[] = [];
    private highways: THREE.Mesh[] = [];
    private notePool: THREE.Mesh[] = [];
    private noteMats: THREE.MeshStandardMaterial[] = [];
    private sprites: { sprite: THREE.Sprite; canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; text: string }[] = [];
    private hudCanvas: HTMLCanvasElement;
    private hudCtx: CanvasRenderingContext2D;
    private hudTex: THREE.CanvasTexture;
    private hudMesh: THREE.Mesh;
    private hudLastDraw = 0;
    private hitBar: THREE.Mesh;
    private accent = new THREE.Color('#ff3333');
    private flashUntil: number[] = [];
    private feverRing: THREE.Mesh;

    constructor(lanes = 4) {
        this.layout = computeLayout({ lanes });
        this.lanes = lanes;
        this.group.name = 'XR Rhythm Stage';

        // HUD panel
        this.hudCanvas = document.createElement('canvas');
        this.hudCanvas.width = 1024; this.hudCanvas.height = 512;
        this.hudCtx = this.hudCanvas.getContext('2d')!;
        this.hudTex = new THREE.CanvasTexture(this.hudCanvas);
        this.hudTex.colorSpace = THREE.SRGBColorSpace;
        this.hudMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshBasicMaterial({ map: this.hudTex, transparent: true, side: THREE.DoubleSide }));
        this.group.add(this.hudMesh);

        this.hitBar = new THREE.Mesh(new THREE.BoxGeometry(1, 0.01, 0.02), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        this.group.add(this.hitBar);

        this.feverRing = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.02, 8, 48), new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0 }));
        this.feverRing.rotation.x = Math.PI / 2;
        this.group.add(this.feverRing);

        for (let i = 0; i < POOL; i++) {
            const m = new THREE.MeshStandardMaterial({ color: 0xff3333, emissive: 0xff3333, emissiveIntensity: 1.2, transparent: true });
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), m);
            mesh.visible = false;
            this.notePool.push(mesh); this.noteMats.push(m);
            this.group.add(mesh);
        }
        for (let i = 0; i < SPRITES; i++) {
            const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 64;
            const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
            sprite.scale.set(0.4, 0.1, 1); sprite.visible = false;
            this.sprites.push({ sprite, canvas, tex, text: '' });
            this.group.add(sprite);
        }
        this.build(lanes);
    }

    private padHeight = 1.0;

    /** Re-layout for a new pad height (standing vs seated). */
    setPadHeight(h: number) { this.padHeight = h; this.build(this.lanes); }

    /** Rebuild pads/highways for a lane count. */
    build(lanes: number) {
        this.lanes = lanes;
        this.layout = computeLayout({ lanes, padHeight: this.padHeight });
        for (const p of this.pads) { this.group.remove(p); p.geometry.dispose(); }
        for (const h of this.highways) { this.group.remove(h); h.geometry.dispose(); (h.material as THREE.Material).dispose(); }
        this.pads = []; this.padMats = []; this.highways = []; this.flashUntil = new Array(lanes).fill(0);
        for (const pad of this.layout.pads) {
            const mat = new THREE.MeshStandardMaterial({ color: 0x14121f, emissive: this.accent, emissiveIntensity: 0.35, metalness: 0.5, roughness: 0.4 });
            const mesh = new THREE.Mesh(new THREE.CylinderGeometry(pad.hx, pad.hx * 1.05, pad.hy * 2, 24), mat);
            mesh.position.set(pad.x, pad.y, pad.z);
            mesh.userData.lane = pad.lane;
            this.group.add(mesh);
            this.pads.push(mesh); this.padMats.push(mat);

            const far = notePosition(this.layout, pad, 1);
            const len = Math.hypot(far.z - pad.z, far.y - pad.y);
            const hw = new THREE.Mesh(new THREE.PlaneGeometry(pad.hx * 1.6, len), new THREE.MeshBasicMaterial({ color: this.accent, transparent: true, opacity: 0.12, side: THREE.DoubleSide }));
            hw.position.set(pad.x, (pad.y + far.y) / 2 + 0.02, (pad.z + far.z) / 2);
            hw.rotation.x = -Math.PI / 2 + Math.atan2(far.y - pad.y, pad.z - far.z);
            this.group.add(hw);
            this.highways.push(hw);
        }
        const first = this.layout.pads[0], last = this.layout.pads[lanes - 1];
        this.hitBar.scale.x = Math.max(0.3, last.x - first.x + first.hx * 2.4);
        this.hitBar.position.set((first.x + last.x) / 2, first.y + 0.1, first.z);
        this.feverRing.position.set(0, first.y - 0.2, first.z);
        const h = this.layout.hudPos;
        this.hudMesh.position.set(h.x, h.y, h.z);
    }

    /** Pad meshes (for raycast selection). */
    get padMeshes(): THREE.Mesh[] { return this.pads; }

    setAccent(color: string) {
        this.accent.set(color);
        for (const m of this.padMats) m.emissive.copy(this.accent);
        for (const h of this.highways) (h.material as THREE.MeshBasicMaterial).color.copy(this.accent);
    }

    /** Visual press feedback (independent of judgement). */
    setHeld(lane: number, held: boolean) {
        const m = this.padMats[lane];
        if (m) m.emissiveIntensity = held ? 1.4 : 0.35;
    }

    render(s: RenderState) {
        const lanes = s.chart?.lanes ?? s.meta?.lanes ?? this.lanes;
        if (lanes !== this.lanes) this.build(lanes);
        if (s.meta && s.meta.color !== `#${this.accent.getHexString()}`) this.setAccent(s.meta.color);

        const beatLen = 60000 / (s.bpm || 120);
        const pulse = Math.max(0, 1 - (s.wallTime - s.lastBeatAt) / (beatLen * 0.6));
        (this.hitBar.material as THREE.MeshBasicMaterial).color.setScalar(0.6 + pulse * 0.4);
        const fever = !!s.score?.feverActive;
        (this.feverRing.material as THREE.MeshBasicMaterial).opacity = fever ? 0.5 + pulse * 0.5 : 0;
        if (fever) (this.feverRing.material as THREE.MeshBasicMaterial).color.setHSL(((s.wallTime / 4) % 360) / 360, 0.9, 0.6);

        // Judgement flashes
        for (const f of s.flashes) {
            if (s.wallTime - f.at < 16) this.flashUntil[f.lane] = s.wallTime + 220;
        }
        for (let i = 0; i < this.lanes; i++) {
            const m = this.padMats[i];
            if (!m) continue;
            const flashing = s.wallTime < this.flashUntil[i];
            if (flashing) m.emissiveIntensity = 2.2;
            else if (!s.heldLanes.has(i)) m.emissiveIntensity = 0.35 + pulse * 0.2;
        }

        // Notes
        let used = 0;
        if (s.session && s.chart && (s.phase === 'playing' || s.phase === 'countdown' || s.phase === 'paused')) {
            const notes: Note<any>[] = s.session.visibleNotes(s.songTime, s.approachMs);
            for (const n of notes) {
                if (used >= POOL) break;
                const pad = this.layout.pads[n.lane];
                if (!pad) continue;
                const t = (n.time - s.songTime) / s.approachMs;
                const mesh = this.notePool[used]; const mat = this.noteMats[used]; used++;
                const holding = s.session.isHolding(n.id);
                const weight = n.payload?.weight ?? (n.payload?.tier === 'prime' ? 3 : n.payload?.tier === 'region' ? 2 : 1);
                mat.color.set(weight >= 3 ? '#fbbf24' : s.meta?.color ?? '#ff3333');
                mat.emissive.copy(mat.color);
                if (n.type === 'hold' && n.duration) {
                    const tEnd = (n.time + n.duration - s.songTime) / s.approachMs;
                    const a = notePosition(this.layout, pad, holding ? 0 : Math.max(0, t));
                    const b = notePosition(this.layout, pad, Math.max(0, tEnd));
                    mesh.position.set(pad.x, (a.y + b.y) / 2, (a.z + b.z) / 2);
                    mesh.scale.set(this.layout.noteW * 0.5, this.layout.noteH, Math.max(0.02, Math.hypot(b.z - a.z, b.y - a.y)));
                    mesh.rotation.x = Math.atan2(b.y - a.y, a.z - b.z);
                    mat.opacity = holding ? 0.95 : 0.6;
                    mat.emissiveIntensity = holding ? 2.5 : 1;
                } else {
                    const p = notePosition(this.layout, pad, t);
                    mesh.position.set(p.x, p.y, p.z);
                    mesh.scale.set(this.layout.noteW, this.layout.noteH * (1 + pulse * 0.4), this.layout.noteD);
                    mesh.rotation.x = 0;
                    const late = s.songTime - n.time;
                    mat.opacity = late > 0 ? Math.max(0.15, 1 - late / 160) : Math.min(1, 0.35 + (1 - t) * 0.8);
                    mat.emissiveIntensity = Math.abs(t) < 0.06 ? 2.5 : 1.2;
                }
                mesh.visible = true;
            }
        }
        for (let i = used; i < POOL; i++) this.notePool[i].visible = false;

        // Floating text sprites (lane-anchored or centre)
        const recent = s.floating.slice(-SPRITES);
        for (let i = 0; i < SPRITES; i++) {
            const slot = this.sprites[i];
            const f: FloatingText | undefined = recent[i];
            if (!f) { slot.sprite.visible = false; continue; }
            const age = s.wallTime - f.bornAt; const life = f.tone === 'epic' ? 1400 : 900;
            if (age > life) { slot.sprite.visible = false; continue; }
            if (slot.text !== f.text) { this.paintSprite(slot, f); slot.text = f.text; }
            const pad: PadSpec = this.layout.pads[f.lane ?? Math.floor(this.lanes / 2)] ?? this.layout.pads[0];
            slot.sprite.position.set(f.lane !== undefined ? pad.x : 0, pad.y + 0.25 + age * 0.0003, pad.z - (f.lane !== undefined ? 0.1 : 0.6));
            slot.sprite.scale.set(f.tone === 'epic' ? 0.9 : 0.45, f.tone === 'epic' ? 0.22 : 0.11, 1);
            (slot.sprite.material as THREE.SpriteMaterial).opacity = 1 - age / life;
            slot.sprite.visible = true;
        }

        // HUD at ~12 Hz (canvas uploads are the expensive part)
        if (s.wallTime - this.hudLastDraw > 80 || s.phase === 'results' || s.phase === 'idle') {
            this.hudLastDraw = s.wallTime;
            this.paintHud(s);
        }
    }

    private paintSprite(slot: { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture }, f: FloatingText) {
        const ctx = slot.canvas.getContext('2d')!;
        ctx.clearRect(0, 0, 256, 64);
        ctx.font = `${f.tone === 'epic' ? '900 30px' : 'bold 26px'} system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeText(f.text, 128, 32);
        ctx.fillStyle = f.tone === 'good' ? '#4ade80' : f.tone === 'bad' ? '#f87171' : f.tone === 'epic' ? '#fbbf24' : '#e5e7eb';
        ctx.fillText(f.text, 128, 32);
        slot.tex.needsUpdate = true;
    }

    private paintHud(s: RenderState) {
        const ctx = this.hudCtx; const W = 1024, H = 512;
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(6, 8, 16, 0.86)';
        roundRect(ctx, 0, 0, W, H, 28); ctx.fill();
        ctx.strokeStyle = s.meta?.color ?? '#ff3333'; ctx.lineWidth = 8; roundRect(ctx, 4, 4, W - 8, H - 8, 26); ctx.stroke();
        const accent = s.meta?.color ?? '#ff3333';

        if (s.phase === 'idle') {
            ctx.fillStyle = '#fff'; ctx.font = '900 64px system-ui, sans-serif'; ctx.textAlign = 'center';
            ctx.fillText('XR RHYTHM ARCADE', W / 2, 150);
            ctx.font = '30px system-ui, sans-serif'; ctx.fillStyle = accent;
            ctx.fillText('Point at a game card and pull the trigger', W / 2, 230);
            ctx.fillStyle = '#aaa'; ctx.font = '26px system-ui, sans-serif';
            ctx.fillText('Hit the pads with your controllers or hands', W / 2, 280);
            ctx.fillText('Grip = pause · Both grips = exit', W / 2, 320);
            this.hudTex.needsUpdate = true; return;
        }

        if (s.phase === 'results' && s.results) {
            const r = s.results; const g = s.score?.grade ?? '-';
            ctx.textAlign = 'center';
            ctx.fillStyle = g === 'S' ? '#fbbf24' : g === 'A' ? '#4ade80' : g === 'B' ? '#60a5fa' : '#f87171';
            ctx.font = '900 150px system-ui, sans-serif'; ctx.fillText(g, 150, 190);
            ctx.fillStyle = '#fff'; ctx.font = '900 56px system-ui, sans-serif'; ctx.textAlign = 'left';
            ctx.fillText(r.finalScore.toLocaleString(), 300, 110);
            ctx.fillStyle = accent; ctx.font = '28px system-ui, sans-serif';
            wrap(ctx, r.summary.headline, 300, 160, 680, 34);
            ctx.fillStyle = r.outcome.newBest ? '#fbbf24' : '#aaa'; ctx.font = 'bold 26px system-ui, sans-serif';
            ctx.fillText(`${r.outcome.newBest ? '★ NEW BEST  ' : ''}+${r.outcome.xpGained} XP${r.outcome.leveledUp ? `  · LEVEL ${r.outcome.level}` : ''}  · 🔥 ${r.outcome.streakDays}d streak`, 300, 240);
            let y = 300; ctx.fillStyle = '#ccc'; ctx.font = '24px system-ui, sans-serif';
            for (const [k, v] of Object.entries(r.summary.stats)) { ctx.fillText(`${k}: ${v}`, 60, y); y += 30; if (y > 440) break; }
            ctx.fillStyle = '#fff'; ctx.font = 'bold 26px system-ui, sans-serif'; ctx.textAlign = 'center';
            ctx.fillText('Hit any pad to play again · both grips to exit', W / 2, 480);
            this.hudTex.needsUpdate = true; return;
        }

        // Playing / countdown / paused
        ctx.textAlign = 'left'; ctx.fillStyle = accent; ctx.font = 'bold 34px system-ui, sans-serif';
        ctx.fillText(`${s.meta?.icon ?? ''} ${s.meta?.title ?? ''} · ${s.difficulty.toUpperCase()} · ${s.bpm} BPM`, 40, 60);
        const sc = s.score;
        if (sc) {
            ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.font = '900 64px system-ui, sans-serif';
            ctx.fillText(sc.score.toLocaleString(), W - 40, 80);
            ctx.font = '26px system-ui, sans-serif'; ctx.fillStyle = '#aaa';
            ctx.fillText(`${Math.round(sc.accuracy * 100)}% · ${sc.grade}`, W - 40, 115);
            ctx.textAlign = 'left'; ctx.fillStyle = sc.feverActive ? '#fbbf24' : '#fff'; ctx.font = '900 72px system-ui, sans-serif';
            ctx.fillText(`${sc.combo}`, 40, 150);
            ctx.font = 'bold 24px system-ui, sans-serif'; ctx.fillStyle = accent;
            ctx.fillText(`COMBO ×${sc.multiplier}${sc.feverActive ? '  🔥 FEVER' : ''}`, 40, 185);
            // Fever bar
            ctx.fillStyle = 'rgba(255,255,255,0.1)'; roundRect(ctx, 40, 200, 400, 14, 7); ctx.fill();
            ctx.fillStyle = sc.feverActive ? '#fbbf24' : '#ffcc66'; roundRect(ctx, 40, 200, 400 * (sc.feverActive ? 1 : sc.fever / 100), 14, 7); ctx.fill();
        }
        let y = 250;
        for (const line of s.hud.slice(0, 5)) {
            ctx.textAlign = 'left'; ctx.fillStyle = '#999'; ctx.font = '24px system-ui, sans-serif'; ctx.fillText(line.label, 40, y);
            ctx.textAlign = 'right'; ctx.fillStyle = line.tone === 'good' ? '#4ade80' : line.tone === 'bad' ? '#f87171' : '#fff'; ctx.font = 'bold 26px system-ui, sans-serif';
            ctx.fillText(line.value, W - 40, y);
            if (line.bar !== undefined) {
                ctx.fillStyle = 'rgba(255,255,255,0.1)'; roundRect(ctx, 40, y + 10, W - 80, 8, 4); ctx.fill();
                ctx.fillStyle = line.tone === 'bad' ? '#f87171' : accent; roundRect(ctx, 40, y + 10, (W - 80) * Math.max(0, Math.min(1, line.bar)), 8, 4); ctx.fill();
                y += 14;
            }
            y += 42;
        }
        if (s.phase === 'countdown') {
            const left = Math.max(0, (s.chart?.offset ?? 2000) - s.songTime);
            ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = '900 120px system-ui, sans-serif';
            ctx.fillText(left > 0 ? String(Math.ceil(left / 1000)) : 'GO', W / 2, H / 2 + 40);
        }
        if (s.phase === 'paused') {
            ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = '900 80px system-ui, sans-serif';
            ctx.fillText('PAUSED', W / 2, H / 2 + 30);
            ctx.font = '26px system-ui, sans-serif'; ctx.fillStyle = accent; ctx.fillText('hit a pad to resume', W / 2, H / 2 + 75);
        }
        this.hudTex.needsUpdate = true;
    }

    dispose() {
        this.group.parent?.remove(this.group);
        this.group.traverse(o => {
            const m = o as THREE.Mesh;
            if (m.geometry) m.geometry.dispose();
            const mat = (m as any).material as THREE.Material | undefined;
            if (mat) { const map = (mat as any).map; if (map) map.dispose(); mat.dispose(); }
        });
    }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + rr, y); ctx.lineTo(x + w - rr, y); ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr); ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h); ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr); ctx.lineTo(x, y + rr); ctx.quadraticCurveTo(x, y, x + rr, y); ctx.closePath();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number) {
    let line = '';
    for (const word of text.split(' ')) {
        const t = line ? `${line} ${word}` : word;
        if (ctx.measureText(t).width > maxW) { ctx.fillText(line, x, y); y += lh; line = word; } else line = t;
    }
    if (line) ctx.fillText(line, x, y);
}
