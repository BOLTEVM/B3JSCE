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
    private appliedSchemaId: string | null = null;

    constructor(
        public preferredDevicePattern: string = '.*',
        public sensitivity: number = 1.0,
        public autoDetect: boolean = true
    ) {
        super();
    }

    execute(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef) {
        if (!this.enabled) return;
        if (!b3obj.isVehicle || !b3obj.vehicleId) return;
        if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;

        const gamepads = navigator.getGamepads();
        
        // Find or re-verify gamepad
        if (this.autoDetect && (this.selectedGamepadIndex === -1 || !gamepads[this.selectedGamepadIndex])) {
            this.findGamepad(gamepads);
        }

        const gamepad = gamepads[this.selectedGamepadIndex];
        if (!gamepad || !this.schema) return;
        if (this.schema.defaultFFB && this.appliedSchemaId !== this.schema.id) {
            engine.bridge?.setFFB(this.schema.defaultFFB);
            this.appliedSchemaId = this.schema.id;
        }

        // Extract raw values
        const rawSteer = gamepad.axes[this.schema.steering.index] || 0;
        const rawThrottle = gamepad.axes[this.schema.throttle.index] || 0;
        const rawBrake = gamepad.axes[this.schema.brake.index] || 0;

        // Normalize
        const steering = RacingHardwareRegistry.normalize(rawSteer, this.schema.steering) * this.sensitivity;
        
        // Pedals often need specific 0.0 -> 1.0 mapping from -1.0 -> 1.0 raw HID
        const throttle = RacingHardwareRegistry.normalizePedal(rawThrottle, this.schema.throttle);
        const brake = RacingHardwareRegistry.normalizePedal(rawBrake, this.schema.brake);

        // Apply to VehicleManager
        engine.vehicles.applyInput(b3obj.vehicleId, {
            throttle,
            steering,
            brake
        });
        
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

    update(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef) {
        this.execute(delta, b3obj, engine);
    }

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
        const node = new RacingWheelActuator(
            data.preferredDevicePattern ?? '.*',
            data.sensitivity ?? 1.0,
            data.autoDetect ?? true
        );
        node.id = data.id;
        node.guiMetadata = data.guiMetadata;
        node.enabled = data.enabled;
        return node;
    }
}
