import * as THREE from 'three';
import { B3Engine } from './index';
import { XRRadialMenu, XRGizmo, XRInspectorCard } from './xr_ui';

export type LocomotionMode = 'Teleport' | 'Fly' | 'Designer' | 'Teleoperation';

/**
 * XRManager: Handles WebXR locomotion, controllers, and immersive sessions.
 */
export class XRManager {
    private mode: LocomotionMode = 'Teleport';
    private noclip: boolean = false;
    
    private controllers: THREE.Group[] = [];
    private controllerGrips: THREE.Group[] = [];
    
    private menu: XRRadialMenu;
    private gizmo: XRGizmo;
    private inspector: XRInspectorCard;
    
    private teleportMarker: THREE.Mesh;
    private teleportRay: THREE.Line;
    
    private flySpeed: number = 2.0;
    private selectedObjectId: string | null = null;
    private grabbedObject: any | null = null;
    private grabOffset: THREE.Vector3 = new THREE.Vector3();
    private activeGizmoAxis: string | null = null;

    // Cache to prevent per-frame allocations
    private _raycaster = new THREE.Raycaster();
    private _tempMat = new THREE.Matrix4();
    private _designerPlane = new THREE.Plane();
    private _intersectPoint = new THREE.Vector3();
    private _flyDir = new THREE.Vector3();
    private primaryControllerIndex: number = 0;
    
    constructor(private engine: B3Engine) {
        this.menu = new XRRadialMenu(this.engine);
        this.gizmo = new XRGizmo();
        this.inspector = new XRInspectorCard();
        this.engine.scene.add(this.gizmo.group);
        this.engine.scene.add(this.inspector.group);

        // Setup Teleport Visuals
        const markerGeo = new THREE.RingGeometry(0.1, 0.12, 32);
        markerGeo.rotateX(-Math.PI / 2);
        this.teleportMarker = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.5 }));
        this.teleportMarker.visible = false;
        this.engine.scene.add(this.teleportMarker);

        const rayGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,-1)]);
        this.teleportRay = new THREE.Line(rayGeo, new THREE.MeshBasicMaterial({ color: 0x00d4ff }));
        this.teleportRay.scale.z = 5;
        this.teleportRay.visible = false;

        this.initControllers();
    }

    private initControllers() {
        for (let i = 0; i < 2; i++) {
            const controller = this.engine.renderer.xr.getController(i);
            controller.add(this.teleportRay.clone());
            this.engine.scene.add(controller);
            this.controllers.push(controller);

            const grip = this.engine.renderer.xr.getControllerGrip(i);
            // Add a simple controller model (box)
            const model = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.1), new THREE.MeshStandardMaterial({ color: 0x333333 }));
            grip.add(model);
            this.engine.scene.add(grip);
            this.controllerGrips.push(grip);

            controller.addEventListener('selectstart', () => this.onSelectStart(i));
            controller.addEventListener('selectend', () => this.onSelectEnd(i));
            controller.addEventListener('squeezestart', () => this.onSqueezeStart(i));
            controller.addEventListener('squeezeend', () => this.onSqueezeEnd(i));
        }
    }

    public setMode(mode: LocomotionMode) {
        this.mode = mode;
        console.log(`B3JS XR: Locomotion Mode -> ${mode}`);
    }

    public setNoClip(enabled: boolean) {
        this.noclip = enabled;
        console.log(`B3JS XR: No-Clip -> ${enabled}`);
    }

    private onSelectEnd(index: number) {
        if (this.menu.isVisible()) {
            const raycaster = this.getControllerRay(index);
            const selection = this.menu.updateSelection(raycaster);
            
            if (selection === 'Teleport' || selection === 'Fly' || selection === 'Designer' || selection === 'Teleoperation') {
                this.setMode(selection as LocomotionMode);
            } else if (selection === 'NPC') {
                this.engine.createNPC();
            } else if (selection === 'Vehicle') {
                this.engine.createVehicleBase();
            } else if (selection === 'Cube') {
                this.engine.createCube();
            } else if (selection === 'Equip Weapon') {
                if (this.selectedObjectId) {
                    const obj = this.engine.objects.find(o => o.id === this.selectedObjectId);
                    if (obj) {
                        const weapons = obj.inventory.getItemsByCategory('Weapon');
                        if (weapons.length > 0) obj.equipItem(weapons[0]); // Equip first found weapon
                    }
                }
            } else if (selection === 'Drop Last') {
                if (this.selectedObjectId) {
                    const obj = this.engine.objects.find(o => o.id === this.selectedObjectId);
                    if (obj && obj.inventory.items.length > 0) {
                        obj.inventory.removeItem(obj.inventory.items[obj.inventory.items.length-1].id!);
                    }
                }
            } else if (selection === 'Inspector') {
                if (this.selectedObjectId) {
                    const obj = this.engine.objects.find(o => o.id === this.selectedObjectId);
                    if (obj) this.inspector.update(obj);
                }
            }
        } else if (this.mode === 'Teleport' && this.teleportMarker.visible) {
            this.engine.xrRig.position.copy(this.teleportMarker.position);
        } else if (this.mode === 'Designer') {
            this.grabbedObject = null;
            this.activeGizmoAxis = null;
        }

        this.controllers[index].children[0].visible = false;
        this.teleportMarker.visible = false;
    }

    private getControllerRay(index: number): THREE.Raycaster {
        this._tempMat.identity().extractRotation(this.controllers[index].matrixWorld);
        this._raycaster.ray.origin.setFromMatrixPosition(this.controllers[index].matrixWorld);
        this._raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this._tempMat);
        return this._raycaster;
    }

    private onSelectStart(index: number) {
        this.primaryControllerIndex = index;
        if (this.mode === 'Teleport') {
            this.controllers[index].children[0].visible = true;
        } else if (this.mode === 'Designer') {
            const raycaster = this.getControllerRay(index);
            
            // Check Gizmo Interaction First
            const gizmoIntersects = raycaster.intersectObjects(this.gizmo.handles);
            if (gizmoIntersects.length > 0) {
                this.activeGizmoAxis = gizmoIntersects[0].object.userData.axis;
                const obj = this.engine.objects.find(o => o.id === this.selectedObjectId);
                if (obj) this.grabbedObject = obj;
                return;
            }

            // Check Object Interaction
            const sceneMeshes = this.engine.objects.map(o => o.object);
            const intersects = raycaster.intersectObjects(sceneMeshes, true);
            if (intersects.length > 0) {
                let target = intersects[0].object;
                while (target.parent && !(target as any).b3id) target = target.parent;
                
                const b3id = (target as any).b3id;
                const obj = this.engine.objects.find(o => o.id === b3id);
                if (obj) {
                    this.selectedObjectId = obj.id;
                    this.grabbedObject = obj;
                    this.grabOffset.copy(obj.object.position).sub(intersects[0].point);
                    this.gizmo.attach(obj.object);
                    this.inspector.update(obj);
                }
            } else {
                this.selectedObjectId = null;
                this.gizmo.hide();
                this.inspector.hide();
            }
        }
    }

    private onSqueezeStart(index: number) {
        this.menu.show(this.controllers[index]);
    }

    private onSqueezeEnd(index: number) {
        this.menu.hide();
    }

    public update(delta: number) {
        const session = this.engine.renderer.xr.getSession();
        if (!session) return;

        // Process Locomotion
        if (this.mode === 'Fly') {
            this.handleFly(delta);
        } else if (this.mode === 'Teleport') {
            this.handleTeleportPreview();
        } else if (this.mode === 'Designer') {
            this.handleDesignerUpdate();
        } else if (this.mode === 'Teleoperation') {
            this.handleTeleoperationUpdate(delta);
        }
    }

    private handleDesignerUpdate() {
        if (!this.grabbedObject) return;
        
        const raycaster = this.getControllerRay(this.primaryControllerIndex);
        this._designerPlane.set(new THREE.Vector3(0, 1, 0), -this.grabbedObject.object.position.y);
        raycaster.ray.intersectPlane(this._designerPlane, this._intersectPoint);

        if (this._intersectPoint) {
            const newPos = this._intersectPoint.add(this.grabOffset);
            
            // Magnetic Snapping (0.1m Grid)
            newPos.x = Math.round(newPos.x * 10) / 10;
            newPos.z = Math.round(newPos.z * 10) / 10;

            if (this.activeGizmoAxis === 'x') {
                this.grabbedObject.object.position.x = newPos.x;
            } else if (this.activeGizmoAxis === 'z') {
                this.grabbedObject.object.position.z = newPos.z;
            } else if (this.activeGizmoAxis === 'y') {
                 // Y typically needs a vertical plane, simplified for now
                 this.grabbedObject.object.position.y = Math.round(raycaster.ray.origin.y * 10) / 10;
            } else {
                this.grabbedObject.object.position.copy(newPos);
            }

            // Sync Physics
            if (this.grabbedObject.body) {
                this.grabbedObject.body.position.copy(this.grabbedObject.object.position);
                this.grabbedObject.body.velocity.set(0, 0, 0);
            }
            this.gizmo.attach(this.grabbedObject.object);
            this.inspector.update(this.grabbedObject);
        }
    }

    private handleFly(delta: number) {
        // In a real implementation, we'd get gamepad inputs from session.inputSources
        // For simplicity, we'll fly forward if the primary trigger is pressed (simplified)
        // A more advanced version would use the joystick axes
        const session = this.engine.renderer.xr.getSession();
        if (!session) return;

        for (const source of session.inputSources) {
            if (source.gamepad && source.gamepad.axes.length >= 4) {
                const x = source.gamepad.axes[2]; // Right stick X
                const y = source.gamepad.axes[3]; // Right stick Y
                
                if (Math.abs(x) > 0.1 || Math.abs(y) > 0.1) {
                    this._flyDir.set(x, 0, y).applyQuaternion(this.engine.camera.quaternion);
                    if (!this.noclip) this._flyDir.y = 0;
                    
                    this.engine.xrRig.position.addScaledVector(this._flyDir, this.flySpeed * delta);
                }
            }
        }
    }

    private handleTeleoperationUpdate(delta: number) {
        if (!this.engine.robotics) return;

        const session = this.engine.renderer.xr.getSession();
        if (!session) return;

        const linear = { x: 0, y: 0, z: 0 };
        const angular = { x: 0, y: 0, z: 0 };

        for (const source of session.inputSources) {
            if (source.gamepad && source.gamepad.axes.length >= 4) {
                if (source.handedness === 'left') {
                    // Left Stick: Locomotion (X: Lateral, Y: Longitudinal)
                    linear.x = source.gamepad.axes[2];
                    linear.z = -source.gamepad.axes[3];
                } else if (source.handedness === 'right') {
                    // Right Stick: Rotation (X: Yaw)
                    angular.z = -source.gamepad.axes[2];
                }
            }
        }

        // Apply deadzones and scale
        const DEADZONE = 0.15;
        const scaleVel = (v: number) => (Math.abs(v) < DEADZONE ? 0 : v);

        this.engine.robotics.move(
            { x: scaleVel(linear.x), y: 0, z: scaleVel(linear.z) },
            { x: 0, y: 0, z: scaleVel(angular.z) }
        );
    }

    private handleTeleportPreview() {
        this.controllers.forEach(ctrl => {
            if (ctrl.children[0].visible) {
                this._tempMat.identity().extractRotation(ctrl.matrixWorld);
                this._raycaster.ray.origin.setFromMatrixPosition(ctrl.matrixWorld);
                this._raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this._tempMat);

                const intersects = this._raycaster.intersectObjects(this.engine.scene.children, true);
                if (intersects.length > 0) {
                    this.teleportMarker.position.copy(intersects[0].point);
                    this.teleportMarker.visible = true;
                } else {
                    this.teleportMarker.visible = false;
                }
            }
        });
    }
}
