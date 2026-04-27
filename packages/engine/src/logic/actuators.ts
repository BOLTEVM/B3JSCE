import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { Actuator, B3ObjectRef, B3EngineRef } from './base';

export class MotionActuator extends Actuator {
    constructor(private object: THREE.Object3D, private velocity: THREE.Vector3) {
        super();
    }
    getTypeName() { return 'MotionActuator'; }
    execute(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef) {
        this.object.position.add(this.velocity);
    }
    update(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef) { /* Passive */ }

    toJSON() {
        return {
            ...super.toJSON(),
            type: 'MotionActuator',
            velocity: this.velocity.toArray()
        };
    }

    static fromJSON(data: any, object: THREE.Object3D): MotionActuator {
        const vel = new THREE.Vector3().fromArray(data.velocity);
        const node = new MotionActuator(object, vel);
        node.id = data.id;
        node.guiMetadata = data.guiMetadata;
        node.enabled = data.enabled;
        return node;
    }
}

/**
 * MiningActuator: Controls a miner (Start/Stop)
 */
export class MiningActuator extends Actuator {
    constructor(private callback: (active: boolean) => void, private active: boolean = true) {
        super();
    }
    getTypeName() { return 'MiningActuator'; }
    execute(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef) {
        this.callback(this.active);
    }

    update(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef) { /* Passive */ }

    toJSON() {
        return {
            ...super.toJSON(),
            type: 'MiningActuator',
            active: this.active
        };
    }

    static fromJSON(data: any, onExecute: (active: boolean) => void): MiningActuator {
        const node = new MiningActuator(onExecute, data.active);
        node.id = data.id;
        node.guiMetadata = data.guiMetadata;
        node.enabled = data.enabled;
        return node;
    }
}

// ─── Web3ConnectActuator ─────────────────────────────────────────
// When executed by a Controller, toggles a 3D-overlaid wallet connect panel.

export class Web3ConnectActuator extends Actuator {
    private label: CSS2DObject | null = null;
    private panelEl: HTMLDivElement | null = null;
    private isConnected = false;
    private address: string | null = null;
    private _attached = false;

    constructor(
        public buttonText: string = 'Connect Wallet',
        public buttonColor: string = '#6366f1',
        public interactionDistance: number = 4
    ) {
        super();
    }

    getTypeName() { return 'Web3ConnectActuator'; }

    /** Build the HTML overlay element once and attach it as a CSS2DObject */
    private ensurePanel(b3obj: B3ObjectRef) {
        if (this._attached) return;
        this._attached = true;

        const el = document.createElement('div');
        el.id = `web3-panel-${this.id}`;
        el.style.cssText = `
            pointer-events: auto;
            background: rgba(10, 12, 28, 0.92);
            border: 1px solid rgba(99, 102, 241, 0.4);
            border-radius: 12px;
            padding: 14px 20px;
            font-family: 'Inter', 'Segoe UI', sans-serif;
            color: #e2e8f0;
            min-width: 180px;
            text-align: center;
            backdrop-filter: blur(8px);
            box-shadow: 0 4px 24px rgba(99,102,241,0.15);
            transition: opacity 0.25s;
        `;

        const status = document.createElement('div');
        status.style.cssText = 'font-size:11px; margin-bottom:8px; opacity:0.7;';
        status.textContent = '🌐 Disconnected';
        status.id = `web3-status-${this.id}`;

        const btn = document.createElement('button');
        btn.textContent = this.buttonText;
        btn.id = `web3-btn-${this.id}`;
        btn.style.cssText = `
            background: ${this.buttonColor};
            color: #fff; border: none; border-radius: 8px;
            padding: 8px 18px; font-size: 13px; font-weight: 600;
            cursor: pointer; width: 100%;
            transition: transform 0.15s, box-shadow 0.15s;
        `;
        btn.onmouseenter = () => { btn.style.transform = 'scale(1.04)'; btn.style.boxShadow = '0 2px 12px rgba(99,102,241,0.4)'; };
        btn.onmouseleave = () => { btn.style.transform = 'scale(1)'; btn.style.boxShadow = 'none'; };
        btn.onclick = () => this.handleClick(status, btn);

        el.appendChild(status);
        el.appendChild(btn);

        this.panelEl = el;
        this.label = new CSS2DObject(el);
        this.label.position.set(0, 2.2, 0);
        b3obj.object.add(this.label);
    }

    private handleClick(status: HTMLDivElement, btn: HTMLButtonElement) {
        if (this.isConnected) {
            // Disconnect
            this.isConnected = false;
            this.address = null;
            status.textContent = '🌐 Disconnected';
            status.style.color = '#94a3b8';
            btn.textContent = this.buttonText;
            btn.style.background = this.buttonColor;
            // Dispatch engine-level event
            window.dispatchEvent(new CustomEvent('b3js:wallet:disconnect'));
        } else {
            // Request connection — dispatches to the React UI layer
            status.textContent = '⏳ Connecting...';
            status.style.color = '#f59e0b';
            btn.disabled = true;

            window.dispatchEvent(new CustomEvent('b3js:wallet:connect'));

            // Listen for response from React/wagmi layer
            const handler = (e: Event) => {
                const detail = (e as CustomEvent).detail;
                btn.disabled = false;
                if (detail?.address) {
                    this.isConnected = true;
                    this.address = detail.address;
                    const short = detail.address.substring(0, 6) + '...' + detail.address.substring(38);
                    status.textContent = `✅ ${short}`;
                    status.style.color = '#10b981';
                    btn.textContent = 'Disconnect';
                    btn.style.background = '#ef4444';
                } else {
                    status.textContent = '❌ Failed';
                    status.style.color = '#ef4444';
                    setTimeout(() => { status.textContent = '🌐 Disconnected'; status.style.color = '#94a3b8'; }, 2500);
                }
                window.removeEventListener('b3js:wallet:result', handler);
            };
            window.addEventListener('b3js:wallet:result', handler);
        }
    }

    execute(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef) {
        this.ensurePanel(b3obj);
    }

    update(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef) {
        this.execute(delta, b3obj, engine);

        // Hide panel if player is too far
        if (this.panelEl && engine.camera) {
            const dist = engine.camera.position.distanceTo(b3obj.object.position);
            this.panelEl.style.opacity = dist < this.interactionDistance ? '1' : '0';
            this.panelEl.style.pointerEvents = dist < this.interactionDistance ? 'auto' : 'none';
        }
    }

    dispose() {
        if (this.label) {
            this.label.removeFromParent();
            this.label = null;
        }
        this.panelEl = null;
        this._attached = false;
    }

    toJSON() {
        return {
            ...super.toJSON(),
            type: 'Web3ConnectActuator',
            buttonText: this.buttonText,
            buttonColor: this.buttonColor,
            interactionDistance: this.interactionDistance
        };
    }

    static fromJSON(data: any): Web3ConnectActuator {
        const a = new Web3ConnectActuator(data.buttonText, data.buttonColor, data.interactionDistance);
        a.id = data.id;
        a.guiMetadata = data.guiMetadata;
        a.enabled = data.enabled;
        return a;
    }
}

export class InventoryActuator extends Actuator {
    constructor(public itemCategory: string, public quantity: number) { super(); }
    getTypeName() { return 'InventoryActuator'; }
    execute(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef) {
        // Grant to all touching actors (or just player)
        const actors = engine.objects.filter((o: any) => o.isActor && o.object.position.distanceTo(b3obj.object.position) < 1.5);
        actors.forEach((actor: any) => {
            actor.inventory.addItem({
                name: `${this.itemCategory} Pickup`,
                category: this.itemCategory as any,
                weight: 0.1, stackable: true, quantity: this.quantity
            });
        });
        
        // Mark for deletion if picked up
        if (actors.length > 0) {
            b3obj.object.removeFromParent();
            if (b3obj.body) engine.world.removeBody(b3obj.body);
            engine.objects = engine.objects.filter((o: any) => o !== b3obj);
        }
    }
    update(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef) {}
    toJSON() { return { ...super.toJSON(), type: 'InventoryActuator', itemCategory: this.itemCategory, quantity: this.quantity }; }
    static fromJSON(data: any): InventoryActuator {
        const n = new InventoryActuator(data.itemCategory, data.quantity);
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        return n;
    }
}
