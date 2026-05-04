import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export interface PhysicsBodyResult {
    name: string;
    body: CANNON.Body;
    type: string;
    mass: number;
}

export interface PhysicsResult {
    bodies: PhysicsBodyResult[];
    colliderMeshes: THREE.Mesh[];
}

function geometryToTrimesh(geo: THREE.BufferGeometry): CANNON.Trimesh {
    const pos = geo.getAttribute('position');
    if (!pos) throw new Error(`glbParser: no position attribute on geometry`);
    const vertices = Array.from(pos.array as ArrayLike<number>);
    if (!geo.index) {
        const indices: number[] = [];
        for (let i = 0; i < pos.count; i++) indices.push(i);
        return new CANNON.Trimesh(vertices, indices);
    }
    return new CANNON.Trimesh(vertices, Array.from(geo.index.array as ArrayLike<number>));
}

function geometryToConvex(geo: THREE.BufferGeometry): CANNON.ConvexPolyhedron {
    const pos = geo.getAttribute('position');
    if (!pos) throw new Error(`glbParser: no position attribute on geometry`);
    const verts: CANNON.Vec3[] = [];
    for (let i = 0; i < pos.count; i++) {
        verts.push(new CANNON.Vec3(pos.getX(i), pos.getY(i), pos.getZ(i)));
    }
    const faces: number[][] = [];
    if (geo.index) {
        const idx = geo.index.array;
        for (let i = 0; i < idx.length; i += 3) {
            faces.push([idx[i], idx[i + 1], idx[i + 2]]);
        }
    } else {
        for (let i = 0; i < pos.count; i += 3) {
            faces.push([i, i + 1, i + 2]);
        }
    }
    return new CANNON.ConvexPolyhedron({ vertices: verts, faces });
}

function bakeColliderGeometry(
    geo: THREE.BufferGeometry,
    node: THREE.Object3D,
    parentRb: THREE.Object3D | null
): { geometry: THREE.BufferGeometry; offset: CANNON.Vec3; quat: CANNON.Quaternion } {
    const cloned = geo.clone();
    const nodeWorldPos = new THREE.Vector3();
    const nodeWorldQuat = new THREE.Quaternion();
    const nodeWorldScale = new THREE.Vector3();
    node.getWorldPosition(nodeWorldPos);
    node.getWorldQuaternion(nodeWorldQuat);
    node.getWorldScale(nodeWorldScale);

    const posAttr = cloned.getAttribute('position');
    for (let i = 0; i < posAttr.count; i++) {
        posAttr.setXYZ(i,
            posAttr.getX(i) * nodeWorldScale.x,
            posAttr.getY(i) * nodeWorldScale.y,
            posAttr.getZ(i) * nodeWorldScale.z
        );
    }
    posAttr.needsUpdate = true;

    let offset = new CANNON.Vec3(0, 0, 0);
    let quat = new CANNON.Quaternion(0, 0, 0, 1);

    if (parentRb) {
        const parentWorldPos = new THREE.Vector3();
        const parentWorldQuat = new THREE.Quaternion();
        parentRb.getWorldPosition(parentWorldPos);
        parentRb.getWorldQuaternion(parentWorldQuat);

        const invParentQuat = parentWorldQuat.clone().invert();
        const relPos = nodeWorldPos.clone().sub(parentWorldPos).applyQuaternion(invParentQuat);
        const relQuat = invParentQuat.clone().multiply(nodeWorldQuat);

        offset = new CANNON.Vec3(relPos.x, relPos.y, relPos.z);
        quat = new CANNON.Quaternion(relQuat.x, relQuat.y, relQuat.z, relQuat.w);
    }

    return { geometry: cloned, offset, quat };
}

export function processGlbPhysics(gltf: any, cannonWorld: CANNON.World): PhysicsResult {
    const result: PhysicsResult = { bodies: [], colliderMeshes: [] };
    gltf.scene.updateMatrixWorld(true);

    const rigidbodyMap = new Map<THREE.Object3D, CANNON.Body>();

    gltf.scene.traverse((obj: THREE.Object3D) => {
        if (obj.userData.node !== 'rigidbody') return;
        const type = obj.userData.type || 'static';
        const mass = obj.userData.mass ?? 1;

        let body: CANNON.Body;
        if (type === 'static') {
            body = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC });
        } else if (type === 'kinematic') {
            body = new CANNON.Body({ mass, type: CANNON.Body.KINEMATIC });
        } else {
            body = new CANNON.Body({ mass, type: CANNON.Body.DYNAMIC });
        }

        const wp = new THREE.Vector3();
        const wq = new THREE.Quaternion();
        obj.getWorldPosition(wp);
        obj.getWorldQuaternion(wq);
        body.position.set(wp.x, wp.y, wp.z);
        body.quaternion.set(wq.x, wq.y, wq.z, wq.w);

        cannonWorld.addBody(body);
        rigidbodyMap.set(obj, body);
        result.bodies.push({ name: obj.name, body, type, mass });
    });

    gltf.scene.traverse((obj: THREE.Object3D) => {
        if (obj.userData.node !== 'collider') return;
        if (!(obj as any).isMesh) {
            console.warn(`glbParser: collider "${obj.name}" skipped (not a Mesh — multi-material export)`);
            return;
        }
        const mesh = obj as THREE.Mesh;
        if (!mesh.geometry) {
            console.warn(`glbParser: collider "${obj.name}" has no geometry`);
            return;
        }

        const convex = obj.userData.convex ?? false;
        const trigger = obj.userData.trigger ?? false;

        let parentRb: THREE.Object3D | null = null;
        let parentBody: CANNON.Body | null = null;
        let p = obj.parent;
        while (p) {
            if (rigidbodyMap.has(p)) {
                parentRb = p;
                parentBody = rigidbodyMap.get(p)!;
                break;
            }
            p = p.parent;
        }

        if (!parentBody) {
            parentBody = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC });
            const wp = new THREE.Vector3();
            const wq = new THREE.Quaternion();
            obj.getWorldPosition(wp);
            obj.getWorldQuaternion(wq);
            parentBody.position.set(wp.x, wp.y, wp.z);
            parentBody.quaternion.set(wq.x, wq.y, wq.z, wq.w);
            cannonWorld.addBody(parentBody);
            result.bodies.push({ name: `${obj.name}_static`, body: parentBody, type: 'static', mass: 0 });
        }

        const { geometry, offset, quat } = bakeColliderGeometry(mesh.geometry, mesh, parentRb);
        const shape = convex ? geometryToConvex(geometry) : geometryToTrimesh(geometry);
        parentBody.addShape(shape, offset, quat);

        if (trigger) parentBody.collisionResponse = false;

        mesh.visible = false;
        result.colliderMeshes.push(mesh);
        geometry.dispose();
    });

    gltf.scene.traverse((obj: THREE.Object3D) => {
        if (obj.userData.node !== 'Mesh' || !(obj as any).isMesh) return;
        const mesh = obj as THREE.Mesh;
        if (obj.userData.castShadow !== undefined) mesh.castShadow = obj.userData.castShadow;
        if (obj.userData.receiveShadow !== undefined) mesh.receiveShadow = obj.userData.receiveShadow;
    });

    return result;
}
