import * as THREE from 'three';
import { B3Engine } from './index';
import { ASSET_BANK } from './assets';

/**
 * XRRadialMenu: A spatial 3D menu that attaches to the controller for mode switching.
 */
export class XRRadialMenu {
    private group: THREE.Group;
    private buttons: THREE.Mesh[] = [];
    private visible: boolean = false;
    private currentCategory: string | null = null;

    private menuData: any = {
        'Root': ['Locomotion', 'Assets', 'Designer', 'Inventory', 'Inspector'],
        'Locomotion': ['Teleport', 'Fly', 'No-Clip', 'Back'],
        'Assets': ['Furniture', 'Web3', 'Props', 'Primitives', 'Pickups', 'Back'],
        'Designer': ['Translate', 'Rotate', 'Scale', 'Clear', 'Back'],
        'Inventory': ['Equip Weapon', 'Drop Last', 'Back']
    };

    constructor(private engine: B3Engine) {
        this.group = new THREE.Group();
        this.group.visible = false;
        this.engine.scene.add(this.group);

        this.createButtons();
    }

    private createButtons(category = 'Root') {
        // Clear old buttons
        this.buttons.forEach(b => {
            b.children.forEach((child: any) => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (child.material.map) child.material.map.dispose();
                    child.material.dispose();
                }
            });
            if (b.geometry) b.geometry.dispose();
            if ((b as any).material) (b as any).material.dispose();
            this.group.remove(b);
        });
        this.buttons = [];
        this.currentCategory = category;

        const assetCats = ['Furniture', 'Web3', 'Props', 'Primitives', 'Pickups', 'Robotics'];
        let options: string[] = [];
        
        if (assetCats.includes(category)) {
            options = ASSET_BANK.filter(a => a.category === category).map(a => a.name);
            options.push('Back');
        } else {
            options = (this.menuData as any)[category] || this.menuData.Root;
        }

        const radius = 0.18;

        options.forEach((label: string, i: number) => {
            const angle = (i / options.length) * Math.PI * 2;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;

            const geo = new THREE.CircleGeometry(0.045, 32);
            const mat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
            const btn = new THREE.Mesh(geo, mat);
            btn.position.set(x, y, 0);
            btn.userData.label = label;
            
            // Text Label
            const canvas = document.createElement('canvas');
            canvas.width = 128; canvas.height = 64;
            const ctx = canvas.getContext('2d')!;
            ctx.fillStyle = '#ffffff'; ctx.font = 'bold 22px Segoe UI';
            ctx.textAlign = 'center'; ctx.fillText(label, 64, 40);
            
            const tex = new THREE.CanvasTexture(canvas);
            const labelMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.04), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
            labelMesh.position.set(0, 0, 0.002);
            btn.add(labelMesh);

            this.group.add(btn);
            this.buttons.push(btn);
        });
    }

    public show(controller: THREE.Group) {
        this.group.position.copy(controller.position);
        this.group.quaternion.copy(controller.quaternion);
        this.group.translateZ(-0.1); // Float slightly in front of hand
        this.group.visible = true;
        this.visible = true;
    }

    public hide() {
        this.group.visible = false;
        this.visible = false;
    }

    public updateSelection(raycaster: THREE.Raycaster): string | null {
        if (!this.visible) return null;

        const intersects = raycaster.intersectObjects(this.buttons);
        this.buttons.forEach(btn => (btn.material as any).color.set(0x1a1a1a));

        if (intersects.length > 0) {
            const selected = intersects[0].object as THREE.Mesh;
            const label = selected.userData.label;
            (selected.material as any).color.set(0x4a9eff);

            if (label === 'Back') {
                this.createButtons('Root');
                return null;
            } else if (this.menuData.hasOwnProperty(label)) {
                this.createButtons(label);
                return null;
            }
            return label;
        }

        return null;
    }

    public isVisible() {
        return this.visible;
    }
}

/**
 * XRGizmo: 3D Transformation Handles for VR
 */
export class XRGizmo {
    public group: THREE.Group;
    public handles: THREE.Mesh[] = [];

    constructor() {
        this.group = new THREE.Group();
        this.group.visible = false;
        this.createHandles();
    }

    private createHandle(dir: THREE.Vector3, color: number, axis: string) {
        const arrow = new THREE.Mesh(
            new THREE.CylinderGeometry(0.015, 0, 0.3, 8),
            new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.8 })
        );
        arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        arrow.position.copy(dir).multiplyScalar(0.15);
        arrow.userData.axis = axis;
        this.group.add(arrow);
        this.handles.push(arrow);
    }

    private createHandles() {
        this.createHandle(new THREE.Vector3(1, 0, 0), 0xff3333, 'x'); // Red X
        this.createHandle(new THREE.Vector3(0, 1, 0), 0x33ff33, 'y'); // Green Y
        this.createHandle(new THREE.Vector3(0, 0, 1), 0x3333ff, 'z'); // Blue Z
    }

    public attach(obj: THREE.Object3D) {
        // Wrap around the object's scale
        const box = new THREE.Box3().setFromObject(obj);
        const size = box.getSize(new THREE.Vector3());
        const margin = Math.max(size.x, size.y, size.z) * 0.6;
        
        this.group.position.copy(obj.position);
        this.group.scale.setScalar(margin || 1);
        this.group.visible = true;
    }

    public hide() { this.group.visible = false; }
}

/**
 * XRInspectorCard: Immersive Stats View
 */
export class XRInspectorCard {
    public group: THREE.Group;
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private texture: THREE.CanvasTexture;

    constructor() {
        this.group = new THREE.Group();
        this.group.visible = false;

        this.canvas = document.createElement('canvas');
        this.canvas.width = 256; this.canvas.height = 128;
        this.ctx = this.canvas.getContext('2d')!;
        this.texture = new THREE.CanvasTexture(this.canvas);

        const plane = new THREE.Mesh(
            new THREE.PlaneGeometry(0.3, 0.15),
            new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, side: THREE.DoubleSide })
        );
        this.group.add(plane);
    }

    public update(obj: any) {
        this.ctx.clearRect(0, 0, 256, 128);
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        this.ctx.fillRect(0, 0, 256, 128);
        this.ctx.strokeStyle = '#4a9eff';
        this.ctx.lineWidth = 4;
        this.ctx.strokeRect(0, 0, 256, 128);

        this.ctx.fillStyle = '#4a9eff';
        this.ctx.font = 'bold 20px Segoe UI';
        this.ctx.fillText(obj.name || "Actor", 20, 30);
        
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '16px Segoe UI';
        this.ctx.fillText(`Team: ${obj.teamId || 0}`, 20, 60);
        this.ctx.fillText(`HP: ${obj.health || 100}`, 20, 85);
        this.ctx.fillText(`Mode: ${obj.isWeapon ? 'Combat' : 'Passive'}`, 20, 110);
        
        this.texture.needsUpdate = true;
        this.group.position.copy(obj.object.position).add(new THREE.Vector3(0, 0.5, 0));
        this.group.visible = true;
    }

    public hide() { this.group.visible = false; }
}

/**
 * XRAiHUD: Floating AI status and transcript for XR
 */
export class XRAiHUD {
    public group: THREE.Group;
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private texture: THREE.CanvasTexture;
    private plane: THREE.Mesh;

    constructor() {
        this.group = new THREE.Group();
        this.group.visible = false;

        this.canvas = document.createElement('canvas');
        this.canvas.width = 512; this.canvas.height = 128;
        this.ctx = this.canvas.getContext('2d')!;
        this.texture = new THREE.CanvasTexture(this.canvas);

        this.plane = new THREE.Mesh(
            new THREE.PlaneGeometry(0.4, 0.1),
            new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, side: THREE.DoubleSide })
        );
        this.group.add(this.plane);
    }

    public update(text: string, response: string, isListening: boolean) {
        this.ctx.clearRect(0, 0, 512, 128);
        
        // Background
        this.ctx.fillStyle = 'rgba(10, 12, 28, 0.9)';
        this.ctx.beginPath();
        this.ctx.roundRect(0, 0, 512, 128, 15);
        this.ctx.fill();

        // Border Pulse
        this.ctx.strokeStyle = isListening ? '#ef4444' : '#6366f1';
        this.ctx.lineWidth = 4;
        this.ctx.stroke();

        // Icon/Status
        this.ctx.fillStyle = isListening ? '#ef4444' : '#6366f1';
        this.ctx.font = 'bold 16px Inter, Segoe UI';
        this.ctx.fillText(isListening ? '🎙️ LISTENING...' : '🤖 AI ACTIVE', 20, 30);

        // Transcript
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '20px Inter, Segoe UI';
        const displayTask = text ? `"${text}"` : 'Standing by...';
        this.ctx.fillText(displayTask, 20, 70);

        // Response
        if (response) {
            this.ctx.fillStyle = '#6366f1';
            this.ctx.font = 'bold 16px Inter, Segoe UI';
            this.ctx.fillText(`✨ ${response}`, 20, 110);
        }

        this.texture.needsUpdate = true;
        this.group.visible = true;
    }

    public showAt(pos: THREE.Vector3, quat: THREE.Quaternion) {
        this.group.position.copy(pos);
        this.group.quaternion.copy(quat);
        this.group.translateZ(-0.35); // Float in front
        this.group.translateY(0.1);
        this.group.visible = true;
    }

    public hide() {
        this.group.visible = false;
    }
}
