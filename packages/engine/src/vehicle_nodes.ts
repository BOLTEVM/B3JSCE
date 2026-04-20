import { Actuator, B3Object, B3Engine } from './index';

/**
 * VehicleDriveActuator: Bridges nodal input to the VehicleManager for physics-based driving.
 */
export class VehicleDriveActuator extends Actuator {
    getTypeName() { return 'VehicleDriveActuator'; }
    constructor(
        public engineForce: number = 0,
        public steering: number = 0,
        public brake: number = 0
    ) {
        super();
    }

    execute(delta: number, b3obj: B3Object, engine: B3Engine) {
        if (!b3obj.isVehicle || !b3obj.vehicleId) return;
        engine.vehicles.applyInput(b3obj.vehicleId, this.engineForce, this.steering, this.brake);
    }

    update(delta: number, b3obj: B3Object, engine: B3Engine) { /* Passive exec */ }

    toJSON() {
        return {
            ...super.toJSON(),
            type: 'VehicleDriveActuator',
            engineForce: this.engineForce,
            steering: this.steering,
            brake: this.brake
        };
    }
}
