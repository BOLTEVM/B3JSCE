import { Actuator, B3ObjectRef, B3EngineRef } from './logic/base';

/**
 * VehicleDriveActuator: Bridges nodal input to the VehicleManager for physics-based driving.
 */
export class VehicleDriveActuator extends Actuator {
    getTypeName() { return 'VehicleDriveActuator'; }
    constructor(
        public throttle: number = 0,
        public steering: number = 0,
        public brake: number = 0,
        public handbrake: number = 0
    ) {
        super();
    }

    execute(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef) {
        if (!this.enabled) return;
        if (!b3obj.isVehicle || !b3obj.vehicleId) return;
        engine.vehicles.applyInput(b3obj.vehicleId, {
            throttle: this.throttle,
            steering: this.steering,
            brake: this.brake,
            handbrake: this.handbrake
        });
    }

    update(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef) { /* Passive exec */ }

    toJSON() {
        return {
            ...super.toJSON(),
            type: 'VehicleDriveActuator',
            throttle: this.throttle,
            steering: this.steering,
            brake: this.brake,
            handbrake: this.handbrake
        };
    }

    static fromJSON(data: any): VehicleDriveActuator {
        const isLegacyForceShape = data.engineForce !== undefined;
        const node = new VehicleDriveActuator(
            data.throttle ?? (isLegacyForceShape ? data.engineForce / 1000 : 0),
            data.steering ?? 0,
            isLegacyForceShape ? (data.brake ?? 0) / 500 : (data.brake ?? 0),
            data.handbrake ?? 0
        );
        node.id = data.id;
        node.guiMetadata = data.guiMetadata;
        node.enabled = data.enabled;
        return node;
    }
}
