import * as THREE from 'three';
import { B3Engine, B3Object } from '../index';
import { TelemetryData } from './RoboticsManager';

/**
 * DigitalTwinSystem: Synchronizes virtual model bones/joints with incoming robotic telemetry.
 */
export class DigitalTwinSystem {
    private targetObject: B3Object | null = null;
    private boneMap: Map<string, THREE.Bone> = new Map();

    constructor(private engine: B3Engine) {}

    public attach(obj: B3Object) {
        this.targetObject = obj;
        this.boneMap.clear();

        // Discover bones in the object hierarchy
        obj.object.traverse((child) => {
            if (child instanceof THREE.Bone) {
                this.boneMap.set(child.name, child);
            }
        });

        console.log(`B3JS Robotics: Digital Twin attached to ${obj.name}. Found ${this.boneMap.size} bones.`);
    }

    public update(telemetry: TelemetryData) {
        if (!this.targetObject || this.boneMap.size === 0) return;

        // Map telemetry joint states to bone rotations
        // Note: Unitree typically sends joint state in radians
        telemetry.jointStates.forEach((value, jointName) => {
            const bone = this.boneMap.get(jointName);
            if (bone) {
                // Simplified mapping: most quadrupeds rotate along one axis per joint
                // In a production URDF loader, we'd use the axis specified in the URDF.
                bone.rotation.z = value; // Placeholder axis
            }
        });
    }

    public detach() {
        this.targetObject = null;
        this.boneMap.clear();
    }
}
