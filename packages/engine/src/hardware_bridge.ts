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

/**
 * HardwareBridge: Orchestrates communication with the local hardware middleware (port 8081).
 * Specifically designed for low-latency Force Feedback (FFB) injection.
 */
export class HardwareBridge {
    private ffbUrl: string = '/api/hardware/ffb';
    private currentFFB: FFBState = {
        gain: 1.0,
        friction: 0.1,
        spring: 0.0,
        damper: 0.1,
        inertia: 0.2
    };

    private lastUpdate: number = 0;
    private updateInterval: number = 16; // ~60Hz FFB sync

    constructor(private engine: B3Engine) {}

    /**
     * Updates the FFB state based on vehicle physics.
     * Called every frame, but throttled to avoid flooding the bridge.
     */
    public update(delta: number) {
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
        this.currentFFB = { ...this.currentFFB, ...state };
    }

    private async sendFFB() {
        try {
            // Using fetch to talk to the local proxy defined in vite.config.ts
            // In a production sim-racing environment, this might use WebSockets for lower latency.
            await fetch(this.ffbUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.currentFFB)
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
            sineMagnitude: magnitude,
            sineFrequency: 50 // 50Hz rumble
        });
    }

    private async sendFFBInstant(state: FFBState) {
        fetch(this.ffbUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(state)
        }).catch(() => {});
    }
}
