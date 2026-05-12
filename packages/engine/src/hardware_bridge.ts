import { B3Engine } from './index';

export interface FFBState {
    gain: number;       // 0.0 to 1.0 (Master multiplier)
    friction: number;   // 0.0 to 1.0 (Resistance to movement)
    spring: number;     // 0.0 to 1.0 (Return to center force)
    damper: number;     // 0.0 to 1.0 (Viscosity/Fluid resistance)
    inertia: number;    // 0.0 to 1.0 (Weight of the wheel)
    sineMagnitude?: number; // For vibration effects
    sineFrequency?: number;
}

type BridgeMessage =
    | { type: 'hello'; protocol: number; client: string; timestamp: number }
    | { type: 'ffb.set'; seq: number; state: FFBState; timestamp: number }
    | { type: 'ffb.stop'; seq: number; timestamp: number };

/**
 * HardwareBridge: Orchestrates communication with the local hardware middleware (port 8081).
 * Specifically designed for low-latency Force Feedback (FFB) injection.
 */
export class HardwareBridge {
    private static readonly PROTOCOL_VERSION = 1;

    private ffbUrl: string = '/api/hardware/ffb';
    private wsUrl: string = this.resolveWsUrl();
    private socket: WebSocket | null = null;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private reconnectDelay: number = 1000;
    private seq: number = 0;

    private currentFFB: FFBState = {
        gain: 1.0,
        friction: 0.1,
        spring: 0.0,
        damper: 0.1,
        inertia: 0.2
    };

    private lastUpdate: number = 0;
    private updateInterval: number = 16; // ~60Hz FFB sync

    constructor(private engine: B3Engine) {
        this.connect();

        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', this.handleVisibilityChange);
        }

        if (typeof window !== 'undefined') {
            window.addEventListener('beforeunload', this.handleBeforeUnload);
        }
    }

    /**
     * Updates the FFB state based on vehicle physics.
     * Called every frame, but throttled to avoid flooding the bridge.
     */
    public update(delta: number) {
        if (typeof performance === 'undefined') return;

        const now = performance.now();
        if (now - this.lastUpdate < this.updateInterval) return;
        this.lastUpdate = now;

        // In a real scenario, we'd calculate FFB based on:
        // 1. Vehicle speed (increases friction/inertia)
        // 2. Slip angle (reduces spring force)
        // 3. Surface type (adds sine noise)
        
        this.sendFFB();
    }

    public setFFB(state: Partial<FFBState>) {
        this.currentFFB = this.clampFFB({ ...this.currentFFB, ...state });
    }

    public stopAll() {
        this.currentFFB = this.clampFFB({
            gain: 0,
            friction: 0,
            spring: 0,
            damper: 0,
            inertia: 0,
            sineMagnitude: 0,
            sineFrequency: 0
        });
        this.sendMessage({ type: 'ffb.stop', seq: ++this.seq, timestamp: Date.now() });
        this.sendFFBHttp(this.currentFFB);
    }

    public dispose() {
        this.stopAll();
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
        this.socket?.close();
        this.socket = null;

        if (typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        }

        if (typeof window !== 'undefined') {
            window.removeEventListener('beforeunload', this.handleBeforeUnload);
        }
    }

    private connect() {
        if (typeof WebSocket === 'undefined') return;
        if (this.socket && this.socket.readyState !== WebSocket.CLOSED) return;

        try {
            this.socket = new WebSocket(this.wsUrl);
            this.socket.onopen = () => {
                this.reconnectDelay = 1000;
                this.sendMessage({
                    type: 'hello',
                    protocol: HardwareBridge.PROTOCOL_VERSION,
                    client: 'b3js-engine',
                    timestamp: Date.now()
                });
            };
            this.socket.onclose = () => this.scheduleReconnect();
            this.socket.onerror = () => {
                this.socket?.close();
            };
        } catch {
            this.scheduleReconnect();
        }
    }

    private scheduleReconnect() {
        if (this.reconnectTimer) return;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
            this.reconnectDelay = Math.min(this.reconnectDelay * 2, 10000);
        }, this.reconnectDelay);
    }

    private sendFFB() {
        const state = this.clampFFB(this.currentFFB);
        const sent = this.sendMessage({
            type: 'ffb.set',
            seq: ++this.seq,
            state,
            timestamp: Date.now()
        });

        if (!sent) this.sendFFBHttp(state);
    }

    private async sendFFBHttp(state: FFBState) {
        try {
            await fetch(this.ffbUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(state)
            });
        } catch (e) {
            // Silent fail if bridge is not running to avoid console flooding
        }
    }

    /**
     * High-speed burst for collision impact or "rumble strips"
     */
    public triggerImpact(magnitude: number) {
        this.sendFFBInstant({
            ...this.currentFFB,
            sineMagnitude: this.clamp01(magnitude),
            sineFrequency: 50 // 50Hz rumble
        });
    }

    private sendFFBInstant(state: FFBState) {
        const safeState = this.clampFFB(state);
        const sent = this.sendMessage({
            type: 'ffb.set',
            seq: ++this.seq,
            state: safeState,
            timestamp: Date.now()
        });

        if (sent) return;

        fetch(this.ffbUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(safeState)
        }).catch(() => {});
    }

    private sendMessage(message: BridgeMessage) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
        this.socket.send(JSON.stringify(message));
        return true;
    }

    private resolveWsUrl() {
        if (typeof window === 'undefined') return 'ws://localhost:8081/api/hardware/ws';
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${window.location.host}/api/hardware/ws`;
    }

    private clampFFB(state: FFBState): FFBState {
        return {
            gain: this.clamp01(state.gain),
            friction: this.clamp01(state.friction),
            spring: this.clamp01(state.spring),
            damper: this.clamp01(state.damper),
            inertia: this.clamp01(state.inertia),
            sineMagnitude: state.sineMagnitude === undefined ? undefined : this.clamp01(state.sineMagnitude),
            sineFrequency: state.sineFrequency === undefined ? undefined : Math.max(0, Math.min(250, state.sineFrequency))
        };
    }

    private clamp01(value: number) {
        return Math.max(0, Math.min(1, value));
    }

    private handleVisibilityChange = () => {
        if (document.hidden) this.stopAll();
    };

    private handleBeforeUnload = () => {
        this.stopAll();
    };
}
