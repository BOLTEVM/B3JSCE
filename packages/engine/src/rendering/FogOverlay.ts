import * as THREE from 'three';
import type { B3Engine } from '../index';

export class FogOverlay {
    private mesh: THREE.InstancedMesh;
    private radius: number = 20; // 20 cells around camera
    private dummy: THREE.Object3D;
    private color: THREE.Color;

    constructor(private engine: B3Engine) {
        const gridSize = this.engine.zk.config.gridResolution;
        
        // Use a flat plane for each cell
        const geometry = new THREE.PlaneGeometry(gridSize, gridSize);
        geometry.rotateX(-Math.PI / 2); // Lay flat on XZ plane
        
        // Basic transparent material with vertex colors
        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.8,
            depthWrite: false, // Don't occlude other transparent things
            blending: THREE.NormalBlending
        });

        const count = (this.radius * 2 + 1) ** 2;
        this.mesh = new THREE.InstancedMesh(geometry, material, count);
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.mesh.instanceColor?.setUsage(THREE.DynamicDrawUsage);
        
        this.dummy = new THREE.Object3D();
        this.color = new THREE.Color();

        // Add to engine scene
        this.engine.scene.add(this.mesh);
    }

    update(cameraPos: THREE.Vector3) {
        if (!this.engine.zk.config.fogOfWar) {
            this.mesh.visible = false;
            return;
        }
        
        this.mesh.visible = true;
        
        const zk = this.engine.zk;
        const gridSize = zk.config.gridResolution;
        
        // Find local player cell
        const localGridX = Math.floor(cameraPos.x / gridSize);
        const localGridZ = Math.floor(cameraPos.z / gridSize);

        // Fetch commitments and active zones
        const commitments = zk.commitmentStore?.getRemoteCommitments() || [];
        const activeZones = zk.activeZones || [];

        // Precompute committed cells for fast lookup
        const committedCells = new Set<string>();
        for (const c of commitments) {
            if (c.type === 'position' && c.publicSignals && c.publicSignals.length >= 2) {
                const cx = Number(c.publicSignals[0]);
                const cz = Number(c.publicSignals[1]);
                committedCells.add(`${cx},${cz}`);
            }
        }

        let instanceIdx = 0;
        
        // Iterate over a grid around the camera
        for (let x = -this.radius; x <= this.radius; x++) {
            for (let z = -this.radius; z <= this.radius; z++) {
                const cellX = localGridX + x;
                const cellZ = localGridZ + z;
                
                // Calculate world position of cell center
                const worldX = (cellX * gridSize) + (gridSize / 2);
                const worldZ = (cellZ * gridSize) + (gridSize / 2);
                
                this.dummy.position.set(worldX, 0.05, worldZ); // slightly above ground
                this.dummy.updateMatrix();
                this.mesh.setMatrixAt(instanceIdx, this.dummy.matrix);

                // Determine visibility/color based on ZK state
                let state: 'known' | 'committed' | 'unknown' = 'unknown';
                
                // 1. Is it the local cell or immediate neighbor? (Local reveal)
                if (Math.abs(x) <= 1 && Math.abs(z) <= 1) {
                    state = 'known';
                } else {
                    // 2. Is it within an active reveal zone?
                    const inZone = activeZones.some(zone => {
                        if (zone.policy !== 'reveal_all' && zone.policy !== 'inventory_only') return false;
                        const dx = worldX - zone.center.x;
                        const dz = worldZ - zone.center.z;
                        return Math.sqrt(dx*dx + dz*dz) <= zone.radius;
                    });
                    
                    if (inZone) {
                        state = 'known';
                    } else if (committedCells.has(`${cellX},${cellZ}`)) {
                        // 3. Is there a zero-knowledge commitment for this cell?
                        state = 'committed';
                    }
                }

                // Apply color and opacity (encoded in rgb for basic material, but opacity is uniform. 
                // Wait, instanced basic material ignores per-instance opacity in standard Three.js unless custom shader.
                // We'll simulate opacity by lerping to the background or just using distinct colors.)
                if (state === 'known') {
                    // Make it fully black but we can't do per-instance opacity easily without a custom shader.
                    // For now, let's just make it very dark or shift it out of view.
                    // Actually, if we scale it to 0, it becomes invisible!
                    this.dummy.scale.set(0,0,0);
                    this.dummy.updateMatrix();
                    this.mesh.setMatrixAt(instanceIdx, this.dummy.matrix);
                } else if (state === 'committed') {
                    this.dummy.scale.set(1,1,1);
                    this.dummy.updateMatrix();
                    this.mesh.setMatrixAt(instanceIdx, this.dummy.matrix);
                    this.color.setHex(0x00ffff); // Cyan
                    this.mesh.setColorAt(instanceIdx, this.color);
                } else {
                    this.dummy.scale.set(1,1,1);
                    this.dummy.updateMatrix();
                    this.mesh.setMatrixAt(instanceIdx, this.dummy.matrix);
                    this.color.setHex(0x111111); // Dark Fog
                    this.mesh.setColorAt(instanceIdx, this.color);
                }

                instanceIdx++;
            }
        }

        this.mesh.instanceMatrix.needsUpdate = true;
        if (this.mesh.instanceColor) {
            this.mesh.instanceColor.needsUpdate = true;
        }
    }

    dispose() {
        this.engine.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        (this.mesh.material as THREE.Material).dispose();
    }
}
