import * as THREE from 'three';
import { Sensor, Actuator, B3Object, B3Engine } from './index';

/**
 * SightSensor: Detects other actors within a vision cone.
 * Filters by Team ID to differentiate between friends and foes.
 */
export class SightSensor extends Sensor {
    public detectedObject: B3Object | null = null;
    
    private static _toOther = new THREE.Vector3();
    private static _forward = new THREE.Vector3();
    private static _forwardLocal = new THREE.Vector3(0, 0, -1);

    getTypeName() { return 'SightSensor'; }

    constructor(
        public fov: number = 45, 
        public range: number = 20,
        public targetTeamId: number = 2 // Targeted team (defaults to Enemy)
    ) {
        super();
    }

    update(delta: number, b3obj: B3Object, engine: B3Engine) {
        this.detectedObject = null;
        let nearestDist = this.range;

        engine.objects.forEach(other => {
            if (other === b3obj || !other.isActor || other.teamId !== this.targetTeamId) return;

            const dist = b3obj.object.position.distanceTo(other.object.position);
            if (dist < nearestDist) {
                // FOV Check
                const toOther = SightSensor._toOther.copy(other.object.position).sub(b3obj.object.position).normalize();
                const forward = SightSensor._forward.copy(SightSensor._forwardLocal).applyQuaternion(b3obj.object.quaternion);
                const angle = forward.angleTo(toOther) * (180 / Math.PI);

                if (angle < this.fov / 2) {
                    this.detectedObject = other;
                    nearestDist = dist;
                    this.positive = true;
                }
            }
        });

        if (!this.detectedObject) this.positive = false;
    }

    toJSON() {
        return {
            ...super.toJSON(),
            type: 'SightSensor',
            fov: this.fov,
            range: this.range,
            targetTeamId: this.targetTeamId
        };
    }

    static fromJSON(data: any): SightSensor {
        const node = new SightSensor(data.fov, data.range, data.targetTeamId);
        if (data.id) node.id = data.id;
        return node;
    }
}

/**
 * NavMoveActuator: Intelligent movement using the engine's NavMesh pathfinder.
 */
export class NavMoveActuator extends Actuator {
    private path: THREE.Vector3[] = [];
    private currentWaypointIndex: number = 0;
    private targetPos: THREE.Vector3 = new THREE.Vector3();

    private static _direction = new THREE.Vector3();
    private static _targetQuat = new THREE.Quaternion();
    private static _forwardLocal = new THREE.Vector3(0, 0, -1);

    getTypeName() { return 'NavMoveActuator'; }

    constructor() {
        super();
    }

    async setTarget(pos: THREE.Vector3, b3obj: B3Object, engine: B3Engine) {
        this.targetPos.copy(pos);
        // Query async engine pathfinder
        const foundPath = await engine.requestPath(b3obj.object.position, this.targetPos);
        if (foundPath) {
            this.path = foundPath;
            this.currentWaypointIndex = 0;
        }
    }

    execute(delta: number, b3obj: B3Object, engine: B3Engine) {
        if (this.path.length === 0 || this.currentWaypointIndex >= this.path.length) return;

        const waypoint = this.path[this.currentWaypointIndex];
        const dist = b3obj.object.position.distanceTo(waypoint);

        if (dist < 0.2) {
            this.currentWaypointIndex++;
            return;
        }

        // Move toward waypoint
        const direction = NavMoveActuator._direction.copy(waypoint).sub(b3obj.object.position).normalize();
        b3obj.object.position.addScaledVector(direction, b3obj.effectiveSpeed);
        
        // Rotate toward movement
        const targetQuat = NavMoveActuator._targetQuat.setFromUnitVectors(NavMoveActuator._forwardLocal, direction);
        b3obj.object.quaternion.slerp(targetQuat, 0.1);
    }

    update(delta: number, b3obj: B3Object, engine: B3Engine) { /* Passive */ }

    toJSON() {
        return {
            ...super.toJSON(),
            type: 'NavMoveActuator'
        };
    }

    static fromJSON(data: any): NavMoveActuator {
        const node = new NavMoveActuator();
        if (data.id) node.id = data.id;
        return node;
    }
}

/**
 * BoneLookAtActuator: Dynamically rotates a specific bone to look at a target B3Object.
 * Useful for procedural head tracking or weapon aiming.
 */
export class BoneLookAtActuator extends Actuator {
    public targetObject: B3Object | null = null;
    
    private static _targetPos = new THREE.Vector3();
    private static _bonePos = new THREE.Vector3();

    getTypeName() { return 'BoneLookAtActuator'; }

    constructor(public boneName: string = "") {
        super();
    }

    execute(delta: number, b3obj: B3Object, engine: B3Engine) {
        if (!this.targetObject || !this.boneName) return;

        const bone = b3obj.getBone(this.boneName);
        if (!bone) return;

        // Calculate world positions
        this.targetObject.object.getWorldPosition(BoneLookAtActuator._targetPos);
        bone.getWorldPosition(BoneLookAtActuator._bonePos);
        
        // Use lookAt
        bone.lookAt(BoneLookAtActuator._targetPos);
    }

    update(delta: number, b3obj: B3Object, engine: B3Engine) { /* Passive */ }

    toJSON() {
        return {
            ...super.toJSON(),
            type: 'BoneLookAtActuator',
            boneName: this.boneName
        };
    }

    static fromJSON(data: any): BoneLookAtActuator {
        const node = new BoneLookAtActuator(data.boneName);
        if (data.id) node.id = data.id;
        return node;
    }
}

/**
 * BoneTransformActuator: Procedurally rotates or translates a specific bone.
 */
export class BoneTransformActuator extends Actuator {
    getTypeName() { return 'BoneTransformActuator'; }

    constructor(
        public boneName: string = "",
        public rotationOffset: THREE.Euler = new THREE.Euler(),
        public positionOffset: THREE.Vector3 = new THREE.Vector3()
    ) {
        super();
    }

    execute(delta: number, b3obj: B3Object, engine: B3Engine) {
        if (!this.boneName) return;

        const bone = b3obj.getBone(this.boneName);
        if (!bone) return;

        bone.rotation.x += this.rotationOffset.x * delta;
        bone.rotation.y += this.rotationOffset.y * delta;
        bone.rotation.z += this.rotationOffset.z * delta;

        bone.position.addScaledVector(this.positionOffset, delta);
    }

    update(delta: number, b3obj: B3Object, engine: B3Engine) { /* Passive */ }

    toJSON() {
        return {
            ...super.toJSON(),
            type: 'BoneTransformActuator',
            boneName: this.boneName,
            rotationOffset: this.rotationOffset.toArray(),
            positionOffset: this.positionOffset.toArray()
        };
    }

    static fromJSON(data: any): BoneTransformActuator {
        const rot = new THREE.Euler().fromArray(data.rotationOffset || [0,0,0]);
        const pos = new THREE.Vector3().fromArray(data.positionOffset || [0,0,0]);
        const node = new BoneTransformActuator(data.boneName, rot, pos);
        if (data.id) node.id = data.id;
        return node;
    }
}
