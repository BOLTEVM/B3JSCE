import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { B3Engine, B3Object } from './index';
import { nanoid } from 'nanoid';

/**
 * VehicleManager: Orchestrates the physical simulation of RaycastVehicles.
 */
export class VehicleManager {
    private vehicles: Map<string, CANNON.RaycastVehicle> = new Map();

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

    public applyInput(id: string, engineForce: number, steering: number, brake: number) {
        const vehicle = this.vehicles.get(id);
        if (!vehicle) return;

        // Front wheel steering
        vehicle.setSteeringValue(steering, 0);
        vehicle.setSteeringValue(steering, 1);

        // Rear wheel drive
        vehicle.applyEngineForce(engineForce, 2);
        vehicle.applyEngineForce(engineForce, 3);

        // All wheel braking
        vehicle.setBrake(brake, 0);
        vehicle.setBrake(brake, 1);
        vehicle.setBrake(brake, 2);
        vehicle.setBrake(brake, 3);
    }
}
