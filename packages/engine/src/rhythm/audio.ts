/**
 * @b3js/engine — BeatSynth
 *
 * Fully procedural WebAudio drum machine + SFX. No samples to download, so
 * the games work offline and on first load on any device. The scheduler
 * uses the AudioContext clock with a lookahead, keyed off song time, so
 * audio and judgement never drift apart.
 */

import type { Judgement } from './core';

export class BeatSynth {
    private ctx: AudioContext | null = null;
    private master: GainNode | null = null;
    private noise: AudioBuffer | null = null;
    private scheduledBeat = -1;
    /** Wall-clock (performance.now) at which song time was 0. */
    private songZeroWallMs = 0;
    private bpm = 120;
    private offsetMs = 0;
    public volume = 0.6;
    public muted = false;

    get ready(): boolean { return !!this.ctx; }

    async init(): Promise<boolean> {
        if (this.ctx) { if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {}); return true; }
        const AC: typeof AudioContext | undefined = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
        if (!AC) return false;
        try {
            this.ctx = new AC({ latencyHint: 'interactive' } as any);
            this.master = this.ctx.createGain();
            this.master.gain.value = this.volume;
            this.master.connect(this.ctx.destination);
            const len = this.ctx.sampleRate * 0.5;
            this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
            const d = this.noise.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
            if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {});
            return true;
        } catch { this.ctx = null; return false; }
    }

    /** Estimated output latency (ms) so judgement can compensate. */
    outputLatencyMs(): number {
        if (!this.ctx) return 0;
        const l = (this.ctx as any).outputLatency ?? this.ctx.baseLatency ?? 0;
        return l * 1000;
    }

    setVolume(v: number) { this.volume = Math.max(0, Math.min(1, v)); if (this.master) this.master.gain.value = this.muted ? 0 : this.volume; }
    setMuted(m: boolean) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : this.volume; }

    /** Begin a track: song time 0 is at `songZeroWallMs` (performance.now domain). */
    startTrack(bpm: number, offsetMs: number, songZeroWallMs: number) {
        this.bpm = bpm; this.offsetMs = offsetMs; this.songZeroWallMs = songZeroWallMs; this.scheduledBeat = -1;
    }

    stopTrack() { this.scheduledBeat = Number.MAX_SAFE_INTEGER; }

    /** Call every frame with the current song time; schedules ~250ms ahead. */
    schedule(songTimeMs: number, nowWallMs: number) {
        if (!this.ctx || this.muted) return;
        const beatLen = 60000 / this.bpm;
        const horizon = songTimeMs + 250;
        let beat = Math.max(this.scheduledBeat + 1, Math.floor((songTimeMs - this.offsetMs) / beatLen));
        if (beat < -8) beat = -8; // count-in clicks during the lead-in
        for (; this.offsetMs + beat * beatLen <= horizon; beat++) {
            if (beat <= this.scheduledBeat) continue;
            const songT = this.offsetMs + beat * beatLen;
            const wall = this.songZeroWallMs + songT;
            const when = this.ctx.currentTime + Math.max(0, (wall - nowWallMs) / 1000);
            if (beat < 0) { this.click(when, 0.4); }
            else {
                this.kick(when);
                if (beat % 2 === 1) this.snare(when, 0.35);
                this.hat(when, 0.18);
                this.hat(when + beatLen / 2000, 0.1);
                if (beat % 8 === 0) this.bass(when, beatLen / 1000);
            }
            this.scheduledBeat = beat;
        }
    }

    // ── SFX ──────────────────────────────────────────────────────
    playJudgement(j: Judgement, lane = 0) {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const base = 440 * Math.pow(2, lane / 12);
        if (j === 'PERFECT') { this.tone(t, base * 2, 0.08, 'triangle', 0.25); this.tone(t + 0.03, base * 3, 0.1, 'sine', 0.15); }
        else if (j === 'GREAT') this.tone(t, base * 1.5, 0.08, 'triangle', 0.2);
        else if (j === 'GOOD') this.tone(t, base, 0.07, 'square', 0.1);
        else { this.tone(t, 110, 0.18, 'sawtooth', 0.12, 55); }
    }

    playFever() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        [523, 659, 784, 1046].forEach((f, i) => this.tone(t + i * 0.06, f, 0.25, 'triangle', 0.22));
    }

    playEpic() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        [392, 494, 587, 784].forEach((f, i) => this.tone(t + i * 0.05, f, 0.3, 'sine', 0.2));
        this.hat(t, 0.3);
    }

    playFail() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        this.tone(t, 220, 0.5, 'sawtooth', 0.2, 60);
        this.tone(t + 0.1, 165, 0.6, 'square', 0.15, 50);
    }

    // ── Instruments ───────────────────────────────────────────────
    private click(when: number, gain: number) { this.tone(when, 1500, 0.03, 'square', gain * 0.3); }

    private kick(when: number) {
        if (!this.ctx || !this.master) return;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(150, when);
        o.frequency.exponentialRampToValueAtTime(40, when + 0.12);
        g.gain.setValueAtTime(0.9, when);
        g.gain.exponentialRampToValueAtTime(0.001, when + 0.25);
        o.connect(g).connect(this.master);
        o.start(when); o.stop(when + 0.3);
    }

    private snare(when: number, gain: number) {
        if (!this.ctx || !this.master || !this.noise) return;
        const s = this.ctx.createBufferSource();
        s.buffer = this.noise;
        const f = this.ctx.createBiquadFilter();
        f.type = 'highpass'; f.frequency.value = 1200;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(gain, when);
        g.gain.exponentialRampToValueAtTime(0.001, when + 0.15);
        s.connect(f).connect(g).connect(this.master);
        s.start(when); s.stop(when + 0.2);
    }

    private hat(when: number, gain: number) {
        if (!this.ctx || !this.master || !this.noise) return;
        const s = this.ctx.createBufferSource();
        s.buffer = this.noise;
        const f = this.ctx.createBiquadFilter();
        f.type = 'highpass'; f.frequency.value = 6000;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(gain, when);
        g.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
        s.connect(f).connect(g).connect(this.master);
        s.start(when); s.stop(when + 0.06);
    }

    private bass(when: number, dur: number) {
        this.tone(when, 55, dur * 0.9, 'sawtooth', 0.12, 55, 300);
    }

    private tone(when: number, freq: number, dur: number, type: OscillatorType, gain: number, glideTo?: number, lowpass?: number) {
        if (!this.ctx || !this.master) return;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, when);
        if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, when + dur);
        g.gain.setValueAtTime(gain, when);
        g.gain.exponentialRampToValueAtTime(0.001, when + dur);
        let node: AudioNode = o;
        if (lowpass) { const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lowpass; o.connect(f); node = f; }
        node.connect(g).connect(this.master);
        o.start(when); o.stop(when + dur + 0.02);
    }

    dispose() { try { this.ctx?.close(); } catch { /* noop */ } this.ctx = null; this.master = null; }
}
