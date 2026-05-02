import * as THREE from 'three';
import { B3Engine } from './index';
import { ASSET_BANK } from './assets';
import { XRRadialMenu, XRGizmo, XRInspectorCard, XRAiHUD } from './xr_ui';

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
    private aiHud: XRAiHUD;
    
    private teleportMarker: THREE.Mesh;
    private teleportRay: THREE.Line;
    
    private flySpeed: number = 2.0;
    private selectedObjectId: string | null = null;
    private grabbedObject: any | null = null;
    private grabOffset: THREE.Vector3 = new THREE.Vector3();
    private activeGizmoAxis: string | null = null;

    // Scaling System State
    private scaleMode: 'Object' | 'World' | 'None' = 'None';
    private isPrecisionScaling: boolean = false;
    private initialGripDistance: number = 0;
    private initialTargetScale: number = 1.0;
    private isScalingActive: boolean = false;


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
        this.aiHud = new XRAiHUD();
        this.engine.scene.add(this.gizmo.group);
        this.engine.scene.add(this.inspector.group);
        this.engine.scene.add(this.aiHud.group);

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
            this.engine.xrRig.add(controller); // Attach to rig for correct scaling/locomotion
            this.controllers.push(controller);

            const grip = this.engine.renderer.xr.getControllerGrip(i);
            // Add a simple controller model (box)
            const model = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.1), new THREE.MeshStandardMaterial({ color: 0x333333 }));
            grip.add(model);
            this.engine.xrRig.add(grip); // Attach to rig
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
            } else if (selection) {
                // Check if selection is an Asset Name
                const asset = ASSET_BANK.find(a => a.name === selection);
                if (asset) {
                    const raycaster = this.getControllerRay(index);
                    const intersects = raycaster.intersectObjects(this.engine.scene.children, true);
                    const spawnPos = intersects.length > 0 ? intersects[0].point : undefined;
                    this.engine.spawnAsset(asset.id, spawnPos);
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
                } else if (selection === 'Object Mode') {
                    this.scaleMode = 'Object';
                    console.log("B3JS XR: Scale Mode -> Object");
                } else if (selection === 'World Mode') {
                    this.scaleMode = 'World';
                    console.log("B3JS XR: Scale Mode -> World");
                } else if (selection === 'Precision Toggle') {
                    this.isPrecisionScaling = !this.isPrecisionScaling;
                    console.log(`B3JS XR: Precision Scaling -> ${this.isPrecisionScaling}`);
                } else if (selection === 'Reset All') {
                    if (this.selectedObjectId) {
                        const obj = this.engine.objects.find(o => o.id === this.selectedObjectId);
                        if (obj) {
                            obj.object.scale.set(1, 1, 1);
                            if (obj.body) (obj as any).syncPhysicsScale?.();
                        }
                    }
                    this.engine.xrRig.scale.set(1, 1, 1);
                    console.log("B3JS XR: Scale Reset to Default");
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

        // Process Controller Buttons (Voice AI Trigger - Button 4 / Secondary)
        for (const source of session.inputSources) {
            if (source.gamepad && source.gamepad.buttons.length > 4) {
                const secondaryBtn = source.gamepad.buttons[4]; // B or Y button
                if (secondaryBtn.pressed) {
                    const ctrl = this.controllers[source.handedness === 'left' ? 0 : 1];
                    this.triggerVoiceAI(ctrl);
                }
            }
        }

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

        this.handleScalingGesture(delta);
    }

    private handleScalingGesture(delta: number) {
        if (this.scaleMode === 'None') return;

        const session = this.engine.renderer.xr.getSession();
        if (!session) return;

        let gripsPressed = 0;
        for (const source of session.inputSources) {
            if (source.gamepad && source.gamepad.buttons.length > 1) {
                const grip = source.gamepad.buttons[1]; // Common index for Grip
                if (grip.pressed) gripsPressed++;
            }
        }

        if (gripsPressed === 2) {
            // Calculate distance between controller grips
            const dist = this.controllers[0].position.distanceTo(this.controllers[1].position);
            
            if (!this.isScalingActive) {
                this.isScalingActive = true;
                this.initialGripDistance = dist;
                if (this.scaleMode === 'Object' && this.selectedObjectId) {
                    const obj = this.engine.objects.find(o => o.id === this.selectedObjectId);
                    this.initialTargetScale = obj ? obj.object.scale.x : 1.0;
                } else if (this.scaleMode === 'World') {
                    this.initialTargetScale = this.engine.xrRig.scale.x;
                }
                
                // Show HUD
                this.aiHud.showAt(this.controllers[0].position, this.controllers[0].quaternion);
            } else {
                let ratio = dist / this.initialGripDistance;
                
                if (this.isPrecisionScaling) {
                    // Damping for precision: only apply 10% of the movement delta
                    ratio = 1.0 + (ratio - 1.0) * 0.1;
                }

                const newScale = Math.max(0.01, Math.min(100, this.initialTargetScale * ratio));
                
                if (this.scaleMode === 'Object' && this.selectedObjectId) {
                    const obj = this.engine.objects.find(o => o.id === this.selectedObjectId);
                    if (obj) {
                        obj.object.scale.setScalar(newScale);
                        this.aiHud.update('', `OBJECT SCALE: ${(newScale * 100).toFixed(1)}%`, false);
                    }
                } else if (this.scaleMode === 'World') {
                    this.engine.xrRig.scale.setScalar(newScale);
                    this.aiHud.update('', `WORLD SCALE: ${(newScale * 100).toFixed(1)}%`, false);
                }
            }
        } else {
            if (this.isScalingActive) {
                this.isScalingActive = false;
                if (this.scaleMode === 'Object' && this.selectedObjectId) {
                     const obj = this.engine.objects.find(o => o.id === this.selectedObjectId);
                     if (obj && obj.body) (obj as any).syncPhysicsScale?.();
                }
                setTimeout(() => this.aiHud.hide(), 2000);
            }
        }
    }


    private _lastVoiceTrigger = 0;
    private triggerVoiceAI(controller: THREE.Group) {
        const now = Date.now();
        if (now - this._lastVoiceTrigger < 500) return; // Debounce
        this._lastVoiceTrigger = now;

        // Capture Spatial Context
        const raycaster = this.getControllerRay(this.primaryControllerIndex);
        const intersects = raycaster.intersectObjects(this.engine.scene.children, true);
        const context: any = {};
        
        if (intersects.length > 0) {
            context.position = intersects[0].point.clone();
            
            // Try to find targeted B3Object
            let target = intersects[0].object;
            while (target.parent && !(target as any).b3id) target = target.parent;
            if ((target as any).b3id) {
                context.targetObject = this.engine.objects.find(o => o.id === (target as any).b3id);
            }
        }

        this.engine.voiceManager.setContext(context);
        this.engine.voiceManager.toggle(
            (text, resp) => {
                this.aiHud.update(text, resp, false);
                setTimeout(() => this.aiHud.hide(), 5000);
            },
            (isListening) => {
                if (isListening) {
                    this.aiHud.update('', '', true);
                    this.aiHud.showAt(controller.position, controller.quaternion);
                }
            }
        );
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
                    
                    // Scale movement speed with the rig scale
                    const scaledSpeed = this.flySpeed * this.engine.xrRig.scale.x;
                    this.engine.xrRig.position.addScaledVector(this._flyDir, scaledSpeed * delta);
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
