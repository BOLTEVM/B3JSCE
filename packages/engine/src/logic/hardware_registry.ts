export interface AxisMapping {
    index: number;
    inverted: boolean;
    deadzone: number;
    range: [number, number]; // [min, max] for normalization
    rest?: number;
    pressed?: number;
    curve?: number;
}

export interface HardwareSchema {
    id: string;
    version: number;
    idPattern: RegExp;
    name: string;
    vendorId?: string;
    productId?: string;
    steeringLock?: number;
    steering: AxisMapping;
    throttle: AxisMapping;
    brake: AxisMapping;
    clutch?: AxisMapping;
    handbrake?: AxisMapping;
    buttons?: Record<string, number>;
    defaultFFB?: {
        gain?: number;
        friction?: number;
        spring?: number;
        damper?: number;
        inertia?: number;
    };
}

export class RacingHardwareRegistry {
    private static schemas: HardwareSchema[] = [
        {
            id: 'moza-r-series',
            version: 1,
            name: 'MOZA R-Series',
            idPattern: /MOZA/i,
            steeringLock: 900,
            steering: { index: 0, inverted: false, deadzone: 0.01, range: [-1, 1] },
            throttle: { index: 1, inverted: false, deadzone: 0.05, range: [-1, 1] }, // Standard MOZA pedals combined
            brake: { index: 2, inverted: false, deadzone: 0.05, range: [-1, 1] },
            defaultFFB: { gain: 0.8, friction: 0.08, damper: 0.12, inertia: 0.18 }
        },
        {
            id: 'thrustmaster-t300',
            version: 1,
            name: 'Thrustmaster T300',
            idPattern: /T300|Thrustmaster/i,
            steeringLock: 1080,
            steering: { index: 0, inverted: false, deadzone: 0.01, range: [-1, 1] },
            throttle: { index: 1, inverted: true, deadzone: 0.05, range: [-1, 1] },
            brake: { index: 2, inverted: true, deadzone: 0.05, range: [-1, 1] },
            defaultFFB: { gain: 0.75, friction: 0.1, damper: 0.15, inertia: 0.2 }
        },
        {
            id: 'standard-gamepad',
            version: 1,
            name: 'Standard Gamepad (Fallback)',
            idPattern: /.*/,
            steeringLock: 180,
            steering: { index: 0, inverted: false, deadzone: 0.1, range: [-1, 1] },
            throttle: { index: 1, inverted: false, deadzone: 0.1, range: [-1, 1] },
            brake: { index: 2, inverted: false, deadzone: 0.1, range: [-1, 1] },
        }
    ];

    static findSchema(gamepadId: string): HardwareSchema | undefined {
        return this.schemas.find(s => s.idPattern.test(gamepadId));
    }

    static registerSchema(schema: HardwareSchema) {
        this.schemas.unshift(schema); // Add to front to allow overrides
    }

    static getSchemas(): readonly HardwareSchema[] {
        return this.schemas;
    }

    static normalize(value: number, mapping: AxisMapping): number {
        let val = value;
        
        // Apply deadzone
        if (Math.abs(val) < mapping.deadzone) return 0;

        // Invert if needed
        if (mapping.inverted) val = -val;

        // Normalize to 0-1 for pedals (if range is -1 to 1)
        // Note: Steering usually stays -1 to 1.
        // We'll handle specific normalization in the actuator based on target (EngineForce vs Steering)
        
        return this.applyCurve(this.clamp(val, -1, 1), mapping.curve);
    }

    static normalizePedal(value: number, mapping: AxisMapping): number {
        if (mapping.rest !== undefined && mapping.pressed !== undefined && mapping.rest !== mapping.pressed) {
            const normalized = (value - mapping.rest) / (mapping.pressed - mapping.rest);
            const inverted = mapping.inverted ? 1 - normalized : normalized;
            return this.applyCurve(this.clamp(inverted, 0, 1), mapping.curve);
        }

        return this.clamp((this.normalize(value, mapping) + 1) / 2, 0, 1);
    }

    private static applyCurve(value: number, curve: number = 1): number {
        if (curve === 1) return value;
        const sign = Math.sign(value);
        return sign * Math.pow(Math.abs(value), curve);
    }

    private static clamp(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, value));
    }
}
