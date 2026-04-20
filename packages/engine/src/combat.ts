import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { B3Engine, B3Object } from './index';

/**
 * CombatManager: Manages weapon firing, projectile life cycles, and damage resolution.
 */
export class CombatManager {
    // Shared resources to avoid per-projectile GPU allocations
    private static readonly projectileGeo = new THREE.SphereGeometry(0.1, 8, 8);
    private static readonly projectileMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });

    constructor(private engine: B3Engine) {}

    public fireWeapon(weapon: B3Object) {
        const now = Date.now();
        if (now - weapon.lastFireTime < weapon.fireRate * 1000) return;

        // Ammo Check Logic
        const owner = weapon.parent || weapon;
        const ammoType = weapon.metadata?.ammoType || 'Standard';
        const ammoItem = owner.inventory.findItemByAmmoType(ammoType);

        if (weapon.isActor || weapon.parent) { // Only enforce for actors/children
            if (!ammoItem || ammoItem.quantity <= 0) {
                console.warn(`Combat: No ammo for ${weapon.name} (Type: ${ammoType})`);
                return;
            }
            owner.inventory.removeItem(ammoItem.id!, 1);
        }

        weapon.lastFireTime = now;

        if (weapon.weaponMode === 'physical') {
            this.firePhysical(weapon);
        } else {
            this.fireHitscan(weapon);
        }
    }

    private firePhysical(weapon: B3Object) {
        // 1. Create Projectile — reuse shared geometry/material
        const mesh = new THREE.Mesh(CombatManager.projectileGeo, CombatManager.projectileMat);
        
        const bullet = new B3Object(mesh);
        bullet.name = `Projectile_${weapon.name}`;
        bullet.type = "Projectile";
        
        const body = new CANNON.Body({
            mass: 0.1,
            shape: new CANNON.Sphere(0.1)
        });
        
        // Spawn at muzzle position (forward offset)
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(weapon.object.quaternion);
        const spawnPos = weapon.object.position.clone().add(forward.multiplyScalar(1));
        
        body.position.copy(spawnPos as any);
        bullet.body = body;
        
        this.engine.addObject(bullet);

        // Apply Impulse
        const impulse = forward.clone().multiplyScalar(weapon.projectileForce);
        body.applyImpulse(impulse as any);

        // Collision logic
        body.addEventListener('collide', (e: any) => {
            const targetBody = e.body;
            const targetObj = this.engine.objects.find(o => o.body === targetBody);
            
            if (targetObj && targetObj.isActor) {
                targetObj.health -= weapon.damage;
                console.log(`Combat: Hit ${targetObj.name}! Health: ${targetObj.health}`);
            }
            
            // Cleanup
            setTimeout(() => this.engine.removeObject(bullet.id), 0);
        });

        // Auto-cleanup after 5 seconds to prevent leak
        setTimeout(() => this.engine.removeObject(bullet.id), 5000);
    }

    private fireHitscan(weapon: B3Object) {
        const raycaster = new THREE.Raycaster();
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(weapon.object.quaternion);
        
        raycaster.set(weapon.object.position, forward);
        
        // Visual Trace
        const lineGeo = new THREE.BufferGeometry().setFromPoints([
            weapon.object.position,
            weapon.object.position.clone().add(forward.multiplyScalar(100))
        ]);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.5 });
        const line = new THREE.Line(lineGeo, lineMat);
        this.engine.scene.add(line);
        setTimeout(() => {
            this.engine.scene.remove(line);
            lineGeo.dispose();
            lineMat.dispose();
        }, 100);

        const intersects = raycaster.intersectObjects(this.engine.objects.map(o => o.object), true);
        
        if (intersects.length > 0) {
            const hit = intersects[0].object;
            const targetObj = hit.userData.b3obj;
            
            if (targetObj && targetObj.isActor) {
                targetObj.health -= weapon.damage;
                console.log(`Combat: Hitscan Hit ${targetObj.name}! Health: ${targetObj.health}`);
            }
        }
    }
}
