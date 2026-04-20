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

    constructor(private object: THREE.Object3D) {
        super();
    }

    async setTarget(pos: THREE.Vector3, engine: B3Engine) {
        this.targetPos.copy(pos);
        // Query async engine pathfinder
        const foundPath = await engine.requestPath(this.object.position, this.targetPos);
        if (foundPath) {
            this.path = foundPath;
            this.currentWaypointIndex = 0;
        }
    }

    execute(delta: number, b3obj: B3Object, engine: B3Engine) {
        if (this.path.length === 0 || this.currentWaypointIndex >= this.path.length) return;

        const waypoint = this.path[this.currentWaypointIndex];
        const dist = this.object.position.distanceTo(waypoint);

        if (dist < 0.2) {
            this.currentWaypointIndex++;
            return;
        }

        // Move toward waypoint
        const direction = NavMoveActuator._direction.copy(waypoint).sub(this.object.position).normalize();
        this.object.position.addScaledVector(direction, b3obj.effectiveSpeed);
        
        // Rotate toward movement
        const targetQuat = NavMoveActuator._targetQuat.setFromUnitVectors(NavMoveActuator._forwardLocal, direction);
        this.object.quaternion.slerp(targetQuat, 0.1);
    }

    update(delta: number, b3obj: B3Object, engine: B3Engine) { /* Passive */ }

    toJSON() {
        return {
            ...super.toJSON(),
            type: 'NavMoveActuator'
        };
    }
}
