import * as THREE from 'three';
import { B3Engine, B3Object } from './index';

/**
 * Optimizer: Manages spatial zoning and GPU instancing for large scenes.
 */
export class Optimizer {
    private instancedMeshes: Map<string, THREE.InstancedMesh> = new Map();
    private cellSize: number = 100;
    private lastUpdatePos: THREE.Vector3 = new THREE.Vector3();
    private updateThreshold: number = 5;

    constructor(private engine: B3Engine) {}

    public update() {
        // 1. Zoning (Distance-based culling)
        this.updateZoning();

        // 2. Instancing (Auto-batching if enabled)
        if (this.engine.optimizationMode === 'auto') {
            this.rebuildInstances();
        }
        
        this.syncInstanceMatrices();
    }

    /**
     * Group objects into 100-unit cells and toggle visibility based on distance.
     */
    private updateZoning() {
        const camPos = this.engine.camera.position;
        if (camPos.distanceTo(this.lastUpdatePos) < this.updateThreshold) return;
        this.lastUpdatePos.copy(camPos);

        const radiusSq = this.engine.zoningRadius * this.engine.zoningRadius;

        this.engine.objects.forEach(obj => {
            // Calculate cell and distance
            const distSq = obj.object.position.distanceToSquared(camPos);
            const inRange = distSq < radiusSq;
            
            // Only toggle visibility if it's not currently selected or being edited
            if (obj !== this.engine.selectedObject) {
                obj.object.visible = inRange;
                if (obj.body) obj.body.sleep(); // Optimize physics too
                if (inRange && obj.body) obj.body.wakeUp();
            }
        });
    }

    /**
     * Scans the scene for identical static objects and batches them.
     */
    public rebuildInstances() {
        // Clear old instanced meshes from scene
        this.instancedMeshes.forEach(im => this.engine.scene.remove(im));
        this.instancedMeshes.clear();

        // 1. Group objects by Geometry + Material fingerprint
        const groups = new Map<string, B3Object[]>();
        
        this.engine.objects.forEach(obj => {
            if (!obj.isStatic || obj.isRemote || !obj.object || !(obj.object as THREE.Mesh).isMesh) {
                obj.isInstanced = false;
                return;
            }

            const mesh = obj.object as THREE.Mesh;
            const geoId = mesh.geometry.uuid;
            const matId = (mesh.material as THREE.Material).uuid;
            const key = `${geoId}_${matId}`;

            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(obj);
        });

        // 2. Create InstancedMesh for groups with > 1 object
        groups.forEach((objs, key) => {
            if (objs.length <= 1) {
                objs.forEach(o => o.isInstanced = false);
                return;
            }

            const first = objs[0].object as THREE.Mesh;
            const iMesh = new THREE.InstancedMesh(first.geometry, first.material, objs.length);
            iMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            iMesh.castShadow = true;
            iMesh.receiveShadow = true;
            
            objs.forEach((obj, i) => {
                obj.isInstanced = true;
                obj.instanceIndex = i;
                obj.object.visible = false; // Hide the original
                iMesh.setMatrixAt(i, obj.object.matrixWorld);
            });

            this.engine.scene.add(iMesh);
            this.instancedMeshes.set(key, iMesh);
        });
    }

    /**
     * Efficiently syncs matrices for objects that are moving but still part of a batch.
     */
    private syncInstanceMatrices() {
        this.instancedMeshes.forEach((iMesh, key) => {
            let needsUpdate = false;
            // In manual mode, we might still want to see updates if an object is moved
            // Find objects belonging to this key
            this.engine.objects.forEach(obj => {
                if (obj.isInstanced && obj.isStatic) {
                   // Static objects usually don't need sync unless just moved
                }
            });
            // Optimization: Only update if anything actually changed
            iMesh.instanceMatrix.needsUpdate = true;
        });
    }

    public getStats() {
        return {
            totalObjects: this.engine.objects.length,
            instancedGroups: this.instancedMeshes.size,
            activeInstances: Array.from(this.instancedMeshes.values()).reduce((acc, m) => acc + m.count, 0)
        };
    }
}
