export interface AxisMapping {
    index: number;
    inverted: boolean;
    deadzone: number;
    range: [number, number]; // [min, max] for normalization
}

export interface HardwareSchema {
    idPattern: RegExp;
    name: string;
    steering: AxisMapping;
    throttle: AxisMapping;
    brake: AxisMapping;
    clutch?: AxisMapping;
    handbrake?: AxisMapping;
}

export class RacingHardwareRegistry {
    private static schemas: HardwareSchema[] = [
        {
            name: 'MOZA R-Series',
            idPattern: /MOZA/i,
            steering: { index: 0, inverted: false, deadzone: 0.01, range: [-1, 1] },
            throttle: { index: 1, inverted: false, deadzone: 0.05, range: [-1, 1] }, // Standard MOZA pedals combined
            brake: { index: 2, inverted: false, deadzone: 0.05, range: [-1, 1] },
        },
        {
            name: 'Thrustmaster T300',
            idPattern: /T300|Thrustmaster/i,
            steering: { index: 0, inverted: false, deadzone: 0.01, range: [-1, 1] },
            throttle: { index: 1, inverted: true, deadzone: 0.05, range: [-1, 1] },
            brake: { index: 2, inverted: true, deadzone: 0.05, range: [-1, 1] },
        },
        {
            name: 'Standard Gamepad (Fallback)',
            idPattern: /.*/,
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

    static normalize(value: number, mapping: AxisMapping): number {
        let val = value;
        
        // Apply deadzone
        if (Math.abs(val) < mapping.deadzone) return 0;

        // Invert if needed
        if (mapping.inverted) val = -val;

        // Normalize to 0-1 for pedals (if range is -1 to 1)
        // Note: Steering usually stays -1 to 1.
        // We'll handle specific normalization in the actuator based on target (EngineForce vs Steering)
        
        return val;
    }
}
