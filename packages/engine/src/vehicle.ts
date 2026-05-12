import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { B3Engine, B3Object } from './index';
import { nanoid } from 'nanoid';

/**
 * VehicleManager: Orchestrates the physical simulation of RaycastVehicles.
 */
export interface VehicleInputCommand {
    throttle?: number;
    brake?: number;
    clutch?: number;
    steering?: number;
    handbrake?: number;
    gear?: number;
}

export interface VehicleTuning {
    maxEngineForce: number;
    maxBrakeForce: number;
    maxSteeringValue: number;
    maxHandbrakeForce: number;
}

export class VehicleManager {
    private vehicles: Map<string, CANNON.RaycastVehicle> = new Map();
    private tuning: VehicleTuning = {
        maxEngineForce: 1000,
        maxBrakeForce: 500,
        maxSteeringValue: 1,
        maxHandbrakeForce: 750
    };

    constructor(private engine: B3Engine) {}

    public createVehicle(chassis: B3Object) {
        if (!chassis.body) return null;

        const vehicle = new CANNON.RaycastVehicle({
            chassisBody: chassis.body,
            indexRightAxis: 0,
            indexUpAxis: 1,
            indexForwardAxis: 2
        });

        const wheelOptions = {
            radius: 0.5,
            directionLocal: new CANNON.Vec3(0, -1, 0),
            suspensionStiffness: 30,
            suspensionRestLength: 0.3,
            frictionSlip: 1.4,
            dampingRelaxation: 2.3,
            dampingCompression: 4.4,
            maxSuspensionForce: 100000,
            rollInfluence: 0.01,
            axleLocal: new CANNON.Vec3(-1, 0, 0),
            chassisConnectionPointLocal: new CANNON.Vec3(1, 1, 0),
            maxSuspensionTravel: 0.3,
            customSlidingRotationalSpeed: -30,
            useCustomSlidingRotationalSpeed: true
        };

        // Add 4 default wheels
        vehicle.addWheel({ ...wheelOptions, chassisConnectionPointLocal: new CANNON.Vec3(1, 0, 1) });
        vehicle.addWheel({ ...wheelOptions, chassisConnectionPointLocal: new CANNON.Vec3(-1, 0, 1) });
        vehicle.addWheel({ ...wheelOptions, chassisConnectionPointLocal: new CANNON.Vec3(1, 0, -1) });
        vehicle.addWheel({ ...wheelOptions, chassisConnectionPointLocal: new CANNON.Vec3(-1, 0, -1) });

        vehicle.addToWorld(this.engine.world);

        const id = nanoid();
        this.vehicles.set(id, vehicle);
        chassis.vehicleId = id;

        return vehicle;
    }

    public update() {
        // Core physics update is handled by Cannon.
        // We just need to ensure visual wheels match if we implement visual wheels later.
    }

    public setTuning(tuning: Partial<VehicleTuning>) {
        this.tuning = { ...this.tuning, ...tuning };
    }

    public applyInput(id: string, command: VehicleInputCommand): void;
    public applyInput(id: string, engineForce: number, steering: number, brake: number): void;
    public applyInput(id: string, commandOrEngineForce: VehicleInputCommand | number, steering: number = 0, brake: number = 0) {
        const vehicle = this.vehicles.get(id);
        if (!vehicle) return;

        const command = typeof commandOrEngineForce === 'number'
            ? {
                engineForce: commandOrEngineForce,
                steering,
                brake
            }
            : {
                engineForce: this.clamp01(commandOrEngineForce.throttle ?? 0) * this.tuning.maxEngineForce,
                steering: this.clamp(commandOrEngineForce.steering ?? 0, -1, 1) * this.tuning.maxSteeringValue,
                brake: this.clamp01(commandOrEngineForce.brake ?? 0) * this.tuning.maxBrakeForce,
                handbrake: this.clamp01(commandOrEngineForce.handbrake ?? 0) * this.tuning.maxHandbrakeForce
            };

        // Front wheel steering
        vehicle.setSteeringValue(command.steering, 0);
        vehicle.setSteeringValue(command.steering, 1);

        // Rear wheel drive
        vehicle.applyEngineForce(command.engineForce, 2);
        vehicle.applyEngineForce(command.engineForce, 3);

        // All wheel braking
        const frontBrake = command.brake;
        const rearBrake = Math.max(command.brake, command.handbrake ?? 0);
        vehicle.setBrake(frontBrake, 0);
        vehicle.setBrake(frontBrake, 1);
        vehicle.setBrake(rearBrake, 2);
        vehicle.setBrake(rearBrake, 3);
    }

    private clamp01(value: number) {
        return this.clamp(value, 0, 1);
    }

    private clamp(value: number, min: number, max: number) {
        return Math.max(min, Math.min(max, value));
    }
}
