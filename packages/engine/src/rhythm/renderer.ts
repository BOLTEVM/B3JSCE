/**
 * @b3js/engine — Canvas renderer for the rhythm games
 *
 * A single DPR-aware 2D canvas laid over the viewport (or any container).
 * Lanes are vertical columns; notes fall from the top to a hit line near
 * the bottom, leaving a thumb-sized tap zone under it for touch. The
 * layout re-flows on resize/rotation so phones in portrait, tablets,
 * desktops and XR quad-layers all read the same way.
 */

import type { Chart, Note, RhythmSession, ScoreSnapshot, Judgement } from './core';
import { JUDGEMENT_WINDOWS_MS } from './core';
import type { HudLine, MiniGameMeta, RunSummary } from './game';
import type { RunOutcome } from './progression';

export type ArcadePhase = 'idle' | 'countdown' | 'playing' | 'paused' | 'results' | 'calibrating';

export interface FloatingText {
    text: string;
    tone: 'good' | 'bad' | 'neutral' | 'epic';
    lane?: number;
    bornAt: number; // wall ms
}

export interface LaneFlash { lane: number; judgement: Judgement; at: number }

export interface RenderState {
    phase: ArcadePhase;
    songTime: number;
    wallTime: number;
    chart: Chart<any> | null;
    session: RhythmSession<any> | null;
    meta: MiniGameMeta | null;
    score: ScoreSnapshot | null;
    hud: HudLine[];
    floating: FloatingText[];
    flashes: LaneFlash[];
    heldLanes: Set<number>;
    /** Approach time in ms (how long a note is visible before it hits). */
    approachMs: number;
    keyLabels: string[];
    difficulty: string;
    results?: { summary: RunSummary; outcome: RunOutcome; finalScore: number } | null;
    calibration?: { samples: number[]; beatsLeft: number; offsetMs: number } | null;
    lastBeatAt: number;
    bpm: number;
    tip?: string;
}

const TONE_COLORS = { good: '#4ade80', bad: '#f87171', neutral: '#e5e7eb', epic: '#fbbf24' } as const;
const JUDGE_COLORS: Record<Judgement, string> = { PERFECT: '#fbbf24', GREAT: '#4ade80', GOOD: '#60a5fa', MISS: '#f87171' };

export class CanvasRenderer {
    public readonly canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private w = 0; private h = 0; private dpr = 1;
    private ro: ResizeObserver | null = null;
    private laneX = 0; private laneW = 0; private hitY = 0; private topY = 0; private lanes = 4;

    constructor(private readonly container: HTMLElement) {
        this.canvas = document.createElement('canvas');
        Object.assign(this.canvas.style, {
            position: 'absolute', inset: '0', width: '100%', height: '100%', zIndex: '50',
            background: 'rgba(6, 8, 16, 0.92)', cursor: 'crosshair',
        } as Partial<CSSStyleDeclaration>);
        this.canvas.setAttribute('aria-label', 'B3JS Rhythm Arcade');
        this.canvas.setAttribute('role', 'application');
        this.ctx = this.canvas.getContext('2d')!;
        container.appendChild(this.canvas);
        this.resize();
        if (typeof ResizeObserver !== 'undefined') { this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(container); }
        else window.addEventListener('resize', this.resize);
        window.addEventListener('orientationchange', this.resize);
    }

    private resize = () => {
        const rect = this.container.getBoundingClientRect();
        this.dpr = Math.min(3, window.devicePixelRatio || 1);
        this.w = Math.max(1, rect.width); this.h = Math.max(1, rect.height);
        this.canvas.width = Math.round(this.w * this.dpr);
        this.canvas.height = Math.round(this.h * this.dpr);
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        this.layout(this.lanes);
    };

    private layout(lanes: number) {
        this.lanes = lanes;
        const portrait = this.h > this.w;
        const maxLaneW = portrait ? Math.min(110, this.w / lanes) : Math.min(140, (this.w * 0.5) / lanes);
        this.laneW = Math.max(44, Math.min(maxLaneW, (this.w - 32) / lanes));
        this.laneX = (this.w - this.laneW * lanes) / 2;
        // Leave a thumb zone on touch-ish layouts (portrait or short screens)
        const thumb = portrait ? Math.min(150, this.h * 0.16) : Math.min(90, this.h * 0.12);
        this.hitY = this.h - thumb - 24;
        this.topY = 56;
    }

    /** Map client coords → lane (anywhere in the column counts; tolerant for thumbs). */
    laneAt = (clientX: number, clientY: number): number => {
        const rect = this.canvas.getBoundingClientRect();
        const x = clientX - rect.left; const y = clientY - rect.top;
        if (y < this.topY * 0.5) return -1;
        const lane = Math.floor((x - this.laneX) / this.laneW);
        if (lane < 0 || lane >= this.lanes) {
            // Edge tolerance: snap to nearest lane if within half a lane
            if (x < this.laneX && x > this.laneX - this.laneW / 2) return 0;
            if (x >= this.laneX + this.laneW * this.lanes && x < this.laneX + this.laneW * (this.lanes + 0.5)) return this.lanes - 1;
            return -1;
        }
        return lane;
    };

    render(s: RenderState) {
        const ctx = this.ctx;
        const lanes = s.chart?.lanes ?? s.meta?.lanes ?? 4;
        if (lanes !== this.lanes) this.layout(lanes);
        ctx.clearRect(0, 0, this.w, this.h);

        const accent = s.meta?.color ?? '#ff3333';
        const beatLen = 60000 / (s.bpm || 120);
        const sinceBeat = Math.max(0, s.wallTime - s.lastBeatAt);
        const pulse = Math.max(0, 1 - sinceBeat / (beatLen * 0.6));

        // Background pulse + fever border
        const grad = ctx.createRadialGradient(this.w / 2, this.hitY, 10, this.w / 2, this.hitY, Math.max(this.w, this.h));
        grad.addColorStop(0, hexA(accent, 0.12 + pulse * 0.12));
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad; ctx.fillRect(0, 0, this.w, this.h);
        if (s.score?.feverActive) {
            ctx.save();
            ctx.lineWidth = 8 + pulse * 6;
            ctx.strokeStyle = `hsl(${(s.wallTime / 4) % 360}, 90%, 60%)`;
            ctx.strokeRect(4, 4, this.w - 8, this.h - 8);
            ctx.restore();
        }

        if (s.phase === 'idle') { this.drawIdle(s, accent); return; }
        if (s.phase === 'calibrating') { this.drawCalibration(s, accent); return; }

        this.drawLanes(s, accent, pulse);
        if (s.chart && s.session) this.drawNotes(s, accent);
        this.drawHitLine(s, accent, pulse);
        this.drawFlashes(s);
        this.drawHud(s, accent);
        this.drawFloating(s);

        if (s.phase === 'countdown') this.drawCountdown(s, accent);
        if (s.phase === 'paused') this.drawOverlayText('PAUSED', 'tap / press any lane to resume', accent);
        if (s.phase === 'results' && s.results) this.drawResults(s, accent);
    }

    // ── Pieces ─────────────────────────────────────────────────────
    private drawLanes(s: RenderState, accent: string, pulse: number) {
        const ctx = this.ctx;
        for (let i = 0; i < this.lanes; i++) {
            const x = this.laneX + i * this.laneW;
            const held = s.heldLanes.has(i);
            ctx.fillStyle = held ? hexA(accent, 0.22) : i % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)';
            ctx.fillRect(x, this.topY, this.laneW, this.h - this.topY);
            ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(x, this.topY); ctx.lineTo(x, this.h); ctx.stroke();

            // Tap zone + labels
            const zoneY = this.hitY + 14;
            ctx.fillStyle = held ? hexA(accent, 0.5) : hexA(accent, 0.18 + pulse * 0.08);
            roundRect(ctx, x + 4, zoneY, this.laneW - 8, this.h - zoneY - 8, 10); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.font = `bold ${Math.min(13, this.laneW / 5)}px system-ui, sans-serif`; ctx.textAlign = 'center';
            ctx.fillText(s.meta?.laneLabels[i] ?? '', x + this.laneW / 2, zoneY + 22);
            ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = `${Math.min(12, this.laneW / 5)}px system-ui, sans-serif`;
            ctx.fillText(s.keyLabels[i] ?? '', x + this.laneW / 2, zoneY + 40);
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.beginPath(); ctx.moveTo(this.laneX + this.laneW * this.lanes, this.topY); ctx.lineTo(this.laneX + this.laneW * this.lanes, this.h); ctx.stroke();
    }

    private noteY(noteTime: number, songTime: number, approach: number): number {
        const t = (noteTime - songTime) / approach; // 1 = just spawned, 0 = hit
        return this.hitY - t * (this.hitY - this.topY);
    }

    private drawNotes(s: RenderState, accent: string) {
        const ctx = this.ctx;
        const notes: Note<any>[] = s.session!.visibleNotes(s.songTime, s.approachMs);
        const nh = Math.max(12, Math.min(22, this.laneW * 0.22));
        for (const n of notes) {
            const x = this.laneX + n.lane * this.laneW + 6;
            const w = this.laneW - 12;
            const y = this.noteY(n.time, s.songTime, s.approachMs);
            const holding = s.session!.isHolding(n.id);
            if (n.type === 'hold' && n.duration) {
                const yEnd = this.noteY(n.time + n.duration, s.songTime, s.approachMs);
                const top = Math.max(this.topY, yEnd);
                const bottom = holding ? this.hitY : Math.min(this.hitY + 40, y);
                ctx.fillStyle = holding ? hexA('#4ade80', 0.75) : hexA(accent, 0.35);
                roundRect(ctx, x + w * 0.25, top, w * 0.5, Math.max(0, bottom - top), 8); ctx.fill();
                if (!holding) { ctx.fillStyle = accent; roundRect(ctx, x, y - nh / 2, w, nh, 6); ctx.fill(); }
                ctx.fillStyle = 'rgba(255,255,255,0.85)'; roundRect(ctx, x + 6, yEnd - nh / 3, w - 12, nh * 0.66, 5); ctx.fill();
            } else {
                const late = s.songTime - n.time;
                const alpha = late > 0 ? Math.max(0.2, 1 - late / 160) : 1;
                const weight = (n.payload as any)?.weight ?? ((n.payload as any)?.tier === 'prime' ? 3 : (n.payload as any)?.tier === 'region' ? 2 : 1);
                ctx.fillStyle = hexA(weight >= 3 ? '#fbbf24' : accent, alpha);
                roundRect(ctx, x, y - nh / 2, w, nh, 6); ctx.fill();
                ctx.fillStyle = `rgba(255,255,255,${0.9 * alpha})`;
                roundRect(ctx, x + w * 0.2, y - 2, w * 0.6, 4, 2); ctx.fill();
                if (Math.abs(n.time - s.songTime) < JUDGEMENT_WINDOWS_MS.GOOD) {
                    ctx.strokeStyle = `rgba(255,255,255,${0.5 * alpha})`; ctx.lineWidth = 2;
                    roundRect(ctx, x - 2, y - nh / 2 - 2, w + 4, nh + 4, 8); ctx.stroke();
                }
            }
        }
    }

    private drawHitLine(s: RenderState, accent: string, pulse: number) {
        const ctx = this.ctx;
        ctx.save();
        ctx.shadowColor = accent; ctx.shadowBlur = 12 + pulse * 20;
        ctx.strokeStyle = hexA('#ffffff', 0.85); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(this.laneX, this.hitY); ctx.lineTo(this.laneX + this.laneW * this.lanes, this.hitY); ctx.stroke();
        ctx.restore();
    }

    private drawFlashes(s: RenderState) {
        const ctx = this.ctx;
        for (const f of s.flashes) {
            const age = s.wallTime - f.at;
            if (age > 300) continue;
            const a = 1 - age / 300;
            const x = this.laneX + f.lane * this.laneW;
            ctx.fillStyle = hexA(JUDGE_COLORS[f.judgement], a * 0.45);
            ctx.fillRect(x, this.hitY - 60 * a, this.laneW, 60 * a + 10);
            ctx.fillStyle = hexA(JUDGE_COLORS[f.judgement], a);
            ctx.font = `bold ${Math.min(18, this.laneW / 4)}px system-ui, sans-serif`; ctx.textAlign = 'center';
            ctx.fillText(f.judgement, x + this.laneW / 2, this.hitY - 70 - age * 0.08);
        }
    }

    private drawHud(s: RenderState, accent: string) {
        const ctx = this.ctx;
        const sc = s.score;
        // Top bar: title · score · combo
        ctx.textAlign = 'left'; ctx.fillStyle = accent; ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.fillText(`${s.meta?.icon ?? ''} ${s.meta?.title ?? ''}  ·  ${s.difficulty.toUpperCase()}`, 14, 24);
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '11px system-ui, sans-serif';
        ctx.fillText(`${s.bpm} BPM`, 14, 42);
        if (sc) {
            ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.font = 'bold 22px system-ui, sans-serif';
            ctx.fillText(sc.score.toLocaleString(), this.w - 14, 30);
            ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.fillText(`${Math.round(sc.accuracy * 100)}%  ·  ${sc.grade}`, this.w - 14, 46);
            // Combo center
            if (sc.combo >= 3) {
                ctx.textAlign = 'center';
                const big = Math.min(64, 28 + sc.combo * 0.6);
                ctx.fillStyle = sc.feverActive ? `hsl(${(s.wallTime / 3) % 360},90%,65%)` : hexA('#ffffff', 0.9);
                ctx.font = `900 ${big}px system-ui, sans-serif`;
                ctx.fillText(String(sc.combo), this.w / 2, this.topY + (this.hitY - this.topY) * 0.42);
                ctx.font = 'bold 12px system-ui, sans-serif'; ctx.fillStyle = hexA(accent, 0.9);
                ctx.fillText(`COMBO  ×${sc.multiplier}`, this.w / 2, this.topY + (this.hitY - this.topY) * 0.42 + 18);
            }
            // Fever meter (left edge)
            const fx = 8, fy = this.topY + 10, fh = this.hitY - this.topY - 20, fw = 6;
            ctx.fillStyle = 'rgba(255,255,255,0.08)'; roundRect(ctx, fx, fy, fw, fh, 3); ctx.fill();
            const fill = sc.feverActive ? 1 : sc.fever / 100;
            ctx.fillStyle = sc.feverActive ? `hsl(${(s.wallTime / 3) % 360},90%,60%)` : '#fbbf24';
            roundRect(ctx, fx, fy + fh * (1 - fill), fw, fh * fill, 3); ctx.fill();
        }
        // DeFi HUD (right side on wide screens, under header on narrow)
        const narrow = this.w < 560;
        const hx = narrow ? 14 : this.laneX + this.laneW * this.lanes + 24;
        let hy = narrow ? 64 : this.topY + 10;
        const hw = narrow ? this.w - 28 : Math.min(260, this.w - hx - 14);
        if (!narrow || this.h > 520) {
            for (const line of s.hud) {
                ctx.textAlign = 'left'; ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.55)';
                ctx.fillText(line.label, hx, hy);
                ctx.textAlign = 'right'; ctx.font = 'bold 12px system-ui, sans-serif';
                ctx.fillStyle = line.tone === 'good' ? TONE_COLORS.good : line.tone === 'bad' ? TONE_COLORS.bad : '#fff';
                ctx.fillText(line.value, hx + hw, hy);
                if (line.bar !== undefined) {
                    ctx.fillStyle = 'rgba(255,255,255,0.1)'; roundRect(ctx, hx, hy + 5, hw, 4, 2); ctx.fill();
                    ctx.fillStyle = line.tone === 'bad' ? TONE_COLORS.bad : accent; roundRect(ctx, hx, hy + 5, hw * Math.max(0, Math.min(1, line.bar)), 4, 2); ctx.fill();
                    hy += 8;
                }
                hy += narrow ? 16 : 22;
                if (narrow && hy > this.topY + 90) break;
            }
        }
        if (s.tip && s.phase === 'playing') {
            ctx.textAlign = 'center'; ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.45)';
            ctx.fillText(s.tip, this.w / 2, this.h - 6);
        }
    }

    private drawFloating(s: RenderState) {
        const ctx = this.ctx;
        ctx.textAlign = 'center';
        for (const f of s.floating) {
            const age = s.wallTime - f.bornAt;
            const life = f.tone === 'epic' ? 1400 : 900;
            if (age > life) continue;
            const a = 1 - age / life;
            const x = f.lane !== undefined ? this.laneX + f.lane * this.laneW + this.laneW / 2 : this.w / 2;
            const y = (f.lane !== undefined ? this.hitY - 100 : this.topY + (this.hitY - this.topY) * 0.25) - age * 0.05;
            ctx.font = `${f.tone === 'epic' ? '900 18px' : 'bold 12px'} system-ui, sans-serif`;
            ctx.fillStyle = hexA(TONE_COLORS[f.tone], a);
            ctx.fillText(f.text, x, y);
        }
    }

    private drawCountdown(s: RenderState, accent: string) {
        const ctx = this.ctx;
        const left = Math.max(0, (s.chart?.offset ?? 2000) - s.songTime);
        const n = Math.ceil(left / 1000);
        ctx.textAlign = 'center'; ctx.fillStyle = hexA('#ffffff', 0.9); ctx.font = '900 72px system-ui, sans-serif';
        ctx.fillText(n > 0 ? String(n) : 'GO', this.w / 2, this.h / 2);
        ctx.font = '13px system-ui, sans-serif'; ctx.fillStyle = hexA(accent, 0.9);
        ctx.fillText(s.meta?.tagline ?? '', this.w / 2, this.h / 2 + 30);
    }

    private drawOverlayText(title: string, sub: string, accent: string) {
        const ctx = this.ctx;
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, this.w, this.h);
        ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = '900 40px system-ui, sans-serif';
        ctx.fillText(title, this.w / 2, this.h / 2);
        ctx.font = '13px system-ui, sans-serif'; ctx.fillStyle = hexA(accent, 0.9);
        ctx.fillText(sub, this.w / 2, this.h / 2 + 28);
    }

    private drawIdle(s: RenderState, accent: string) {
        this.drawOverlayText('RHYTHM ARCADE', 'pick a game in the Arcade tab', accent);
    }

    private drawCalibration(s: RenderState, accent: string) {
        const ctx = this.ctx;
        const c = s.calibration;
        const beatLen = 60000 / (s.bpm || 120);
        const phase = ((s.songTime % beatLen) + beatLen) % beatLen / beatLen;
        ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = '900 28px system-ui, sans-serif';
        ctx.fillText('CALIBRATION', this.w / 2, this.h * 0.25);
        ctx.font = '13px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText('Tap any lane exactly on each click', this.w / 2, this.h * 0.25 + 26);
        const r = 40 + (1 - phase) * 40;
        ctx.beginPath(); ctx.arc(this.w / 2, this.h / 2, r, 0, Math.PI * 2);
        ctx.strokeStyle = hexA(accent, 0.9); ctx.lineWidth = 6; ctx.stroke();
        if (c) {
            ctx.fillStyle = '#fff'; ctx.font = 'bold 16px system-ui, sans-serif';
            ctx.fillText(`${c.beatsLeft} beats left · offset ${c.offsetMs >= 0 ? '+' : ''}${c.offsetMs.toFixed(0)} ms`, this.w / 2, this.h * 0.7);
            ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.fillText(`${c.samples.length} samples`, this.w / 2, this.h * 0.7 + 20);
        }
    }

    private drawResults(s: RenderState, accent: string) {
        const ctx = this.ctx;
        const r = s.results!;
        ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(0, 0, this.w, this.h);
        const cx = this.w / 2;
        let y = Math.max(60, this.h * 0.14);
        ctx.textAlign = 'center';
        ctx.fillStyle = JUDGE_COLORS[s.score?.grade === 'S' ? 'PERFECT' : s.score?.grade === 'A' ? 'GREAT' : s.score?.grade === 'B' ? 'GOOD' : 'MISS'];
        ctx.font = '900 96px system-ui, sans-serif'; ctx.fillText(s.score?.grade ?? '-', cx, y + 70); y += 96;
        ctx.fillStyle = '#fff'; ctx.font = '900 30px system-ui, sans-serif'; ctx.fillText(r.finalScore.toLocaleString(), cx, y + 10); y += 36;
        ctx.font = '13px system-ui, sans-serif'; ctx.fillStyle = hexA(accent, 1); ctx.fillText(r.summary.headline, cx, y); y += 26;
        if (r.outcome.newBest) { ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 14px system-ui, sans-serif'; ctx.fillText('★ NEW BEST ★', cx, y); y += 22; }
        ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '12px system-ui, sans-serif';
        const sc = s.score;
        if (sc) { ctx.fillText(`PERFECT ${sc.counts.PERFECT} · GREAT ${sc.counts.GREAT} · GOOD ${sc.counts.GOOD} · MISS ${sc.counts.MISS} · MAX COMBO ${sc.maxCombo}`, cx, y); y += 20; }
        ctx.fillText(`+${r.outcome.xpGained} XP${r.outcome.leveledUp ? `  ·  LEVEL UP → ${r.outcome.level}` : ''}  ·  🔥 ${r.outcome.streakDays}-day streak`, cx, y); y += 26;
        for (const [k, v] of Object.entries(r.summary.stats)) { ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillText(`${k}: ${v}`, cx, y); y += 17; if (y > this.h - 110) break; }
        for (const q of r.outcome.questsCompleted) { ctx.fillStyle = '#4ade80'; ctx.fillText(`✓ Quest: ${q.text} (+${q.xp} XP)`, cx, y); y += 17; }
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '11px system-ui, sans-serif';
        ctx.fillText(s.meta?.lesson ?? '', cx, this.h - 64);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.fillText('TAP / press any lane to play again  ·  Esc to exit', cx, this.h - 36);
    }

    dispose() {
        this.ro?.disconnect();
        window.removeEventListener('resize', this.resize);
        window.removeEventListener('orientationchange', this.resize);
        this.canvas.remove();
    }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y); ctx.lineTo(x + w - rr, y); ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr); ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr); ctx.quadraticCurveTo(x, y, x + rr, y); ctx.closePath();
}

function hexA(hex: string, a: number): string {
    if (hex.startsWith('hsl') || hex.startsWith('rgb')) return hex;
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, a))})`;
}
