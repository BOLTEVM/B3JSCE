import { Actuator, B3ObjectRef, B3EngineRef } from './base';
import { RacingHardwareRegistry, HardwareSchema } from './hardware_registry';

/**
 * RacingWheelActuator: Bridges high-fidelity racing hardware (MOZA, Thrustmaster) 
 * to the physical vehicle simulation.
 */
export class RacingWheelActuator extends Actuator {
    getTypeName() { return 'RacingWheelActuator'; }

    private selectedGamepadIndex: number = -1;
    private schema: HardwareSchema | null = null;

    constructor(
        public preferredDevicePattern: string = '.*',
        public sensitivity: number = 1.0,
        public autoDetect: boolean = true
    ) {
        super();
    }

    execute(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef) {
        if (!b3obj.isVehicle || !b3obj.vehicleId) return;

        const gamepads = navigator.getGamepads();
        
        // Find or re-verify gamepad
        if (this.selectedGamepadIndex === -1 || !gamepads[this.selectedGamepadIndex]) {
            this.findGamepad(gamepads);
        }

        const gamepad = gamepads[this.selectedGamepadIndex];
        if (!gamepad || !this.schema) return;

        // Extract raw values
        const rawSteer = gamepad.axes[this.schema.steering.index] || 0;
        const rawThrottle = gamepad.axes[this.schema.throttle.index] || 0;
        const rawBrake = gamepad.axes[this.schema.brake.index] || 0;

        // Normalize
        const steering = RacingHardwareRegistry.normalize(rawSteer, this.schema.steering) * this.sensitivity;
        
        // Pedals often need specific 0.0 -> 1.0 mapping from -1.0 -> 1.0 raw HID
        const throttle = this.normalizePedal(rawThrottle, this.schema.throttle);
        const brake = this.normalizePedal(rawBrake, this.schema.brake);

        // Apply to VehicleManager
        engine.vehicles.applyInput(b3obj.vehicleId, throttle * 1000, steering, brake * 500);
        
        // Prepare for FFB: We could emit an event here or call a bridge method
        // (Advanced FFB logic will be implemented in the HardwareBridge)
    }

    private findGamepad(gamepads: (Gamepad | null)[]) {
        for (let i = 0; i < gamepads.length; i++) {
            const gp = gamepads[i];
            if (gp && new RegExp(this.preferredDevicePattern, 'i').test(gp.id)) {
                const schema = RacingHardwareRegistry.findSchema(gp.id);
                if (schema) {
                    this.selectedGamepadIndex = i;
                    this.schema = schema;
                    console.log(`B3JS: Attached Racing Hardware - ${schema.name} (${gp.id})`);
                    break;
                }
            }
        }
    }

    private normalizePedal(raw: number, mapping: any): number {
        let val = RacingHardwareRegistry.normalize(raw, mapping);
        // Convert -1 to 1 range to 0 to 1 if necessary
        // Most professional wheels rest at -1 or 1 and go to the opposite
        // We'll assume standard 0-1 for now, but a sophisticated registry 
        // would define the 'resting' value.
        
        // Simplified normalization for common sim-racing pedals:
        // If raw is -1 to 1, we want 0 to 1.
        return (val + 1) / 2; 
    }

    update(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef) { /* Passive */ }

    toJSON() {
        return {
            ...super.toJSON(),
            type: 'RacingWheelActuator',
            preferredDevicePattern: this.preferredDevicePattern,
            sensitivity: this.sensitivity,
            autoDetect: this.autoDetect
        };
    }

    static fromJSON(data: any, b3obj?: B3ObjectRef): RacingWheelActuator {
        return new RacingWheelActuator(
            data.preferredDevicePattern,
            data.sensitivity,
            data.autoDetect
        );
    }
}
