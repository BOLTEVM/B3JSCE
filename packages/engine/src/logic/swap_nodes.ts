import * as THREE from 'three';
import { Sensor, Controller, Actuator, B3ObjectRef, B3EngineRef } from './base';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { requestWalletTransaction } from '../wallet/integration';

/**
 * SwapSensor: Detects if a Token B3Object is placed on a specific pan.
 */
export class SwapSensor extends Sensor {
    public detectedObject: B3ObjectRef | null = null;
    constructor(public panName: string = "") { super(); }
    getTypeName() { return 'SwapSensor'; }

    update(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef) {
        this.positive = false;
        this.detectedObject = null;
        const radius = 0.6;
        
        const panPos = b3obj.object.position;

        for (const other of engine.objects) {
            if (other === b3obj || other.isStatic) continue;
            
            const isToken = other.metadata?.type === 'Token' || other.name.toLowerCase().includes('token');
            if (!isToken) continue;

            const dist = panPos.distanceTo(other.object.position);
            if (dist < radius) {
                this.positive = true;
                this.detectedObject = other;
                break;
            }
        }
    }

    toJSON() {
        return { ...super.toJSON(), type: 'SwapSensor', panName: this.panName };
    }

    static fromJSON(data: any): SwapSensor {
        const n = new SwapSensor(data.panName);
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        return n;
    }
}

/**
 * SwapController: Orchestrates the Swap Scale logic.
 */
export class SwapController extends Controller {
    public swapState: 'IDLE' | 'SELECTING' | 'CONFIRMING' | 'SWAPPING' = 'IDLE';
    public inputToken: any = null;
    public targetToken: any = null;
    
    private _uiAttached = false;
    private _uiContainer: HTMLDivElement | null = null;
    private _cssObj: CSS2DObject | null = null;

    constructor() { super(); }
    getTypeName() { return 'SwapController'; }

    execute(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef) {
        if (!this.enabled) return;

        const leftSensor = this.sensors.find(s => (s as any).panName === 'left');
        const rightSensor = this.sensors.find(s => (s as any).panName === 'right');

        // State Machine
        switch (this.swapState) {
            case 'IDLE':
                if (leftSensor?.positive && (leftSensor as SwapSensor).detectedObject) {
                    const token = (leftSensor as SwapSensor).detectedObject;
                    this.swapState = 'SELECTING';
                    this.inputToken = { 
                        symbol: token.metadata?.symbol || 'BOLT', 
                        color: token.metadata?.color || '#6366f1' 
                    };
                    this.updateUI(b3obj, engine);
                }
                break;
            case 'SELECTING':
                if (!leftSensor?.positive) {
                    this.swapState = 'IDLE';
                    this.inputToken = null;
                    this.updateUI(b3obj, engine);
                }
                break;
            case 'CONFIRMING':
                if (!leftSensor?.positive) {
                    this.swapState = 'IDLE';
                    this.inputToken = null;
                    this.targetToken = null;
                    this.updateUI(b3obj, engine);
                }
                break;
            case 'SWAPPING':
                // Finalizing...
                break;
        }
    }

    update(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef) { this.execute(delta, b3obj, engine); }

    private updateUI(b3obj: B3ObjectRef, engine: B3EngineRef) {
        if (this.swapState === 'IDLE') {
            if (this._cssObj) {
                b3obj.object.remove(this._cssObj);
                this._cssObj = null;
                this._uiContainer = null;
            }
            this._uiAttached = false;
            return;
        }

        if (!this._uiAttached) {
            this._uiContainer = document.createElement('div');
            this._uiContainer.className = 'swap-ui-panel';
            this._uiContainer.style.cssText = `
                background: rgba(15, 23, 42, 0.95);
                border: 1px solid rgba(99, 102, 241, 0.4);
                border-radius: 12px;
                padding: 16px;
                color: white;
                font-family: sans-serif;
                pointer-events: auto;
                min-width: 200px;
                backdrop-filter: blur(8px);
                box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            `;
            
            this._cssObj = new CSS2DObject(this._uiContainer);
            this._cssObj.position.set(0, 1.5, 0);
            b3obj.object.add(this._cssObj);
            this._uiAttached = true;
        }

        // Render content based on state
        if (this._uiContainer) {
            this._uiContainer.innerHTML = ''; // Clear previous content safely
            
            if (this.swapState === 'SELECTING') {
                const header = document.createElement('div');
                header.style.cssText = 'font-size: 10px; opacity: 0.6; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;';
                header.textContent = `Swap Source: ${this.inputToken.symbol}`;
                
                const title = document.createElement('div');
                title.style.cssText = 'font-weight: bold; margin-bottom: 12px;';
                title.textContent = 'SELECT TARGET ASSET';
                
                const btnContainer = document.createElement('div');
                btnContainer.style.display = 'flex';
                btnContainer.style.gap = '8px';
                
                ['ETH', 'USDC', 'QUAI'].forEach(symbol => {
                    const btn = document.createElement('div');
                    btn.className = 'swap-btn';
                    btn.style.cssText = `background: #334155; padding: 8px; border-radius: 6px; cursor: pointer; flex: 1; text-align: center; font-size: 12px; transition: background 0.2s;`;
                    btn.textContent = symbol;
                    btn.onclick = () => {
                        this.targetToken = { symbol };
                        this.swapState = 'CONFIRMING';
                        this.updateUI(b3obj, engine);
                    };
                    btn.onmouseenter = () => btn.style.background = '#475569';
                    btn.onmouseleave = () => btn.style.background = '#334155';
                    btnContainer.appendChild(btn);
                });

                this._uiContainer.appendChild(header);
                this._uiContainer.appendChild(title);
                this._uiContainer.appendChild(btnContainer);

            } else if (this.swapState === 'CONFIRMING') {
                const title = document.createElement('div');
                title.style.cssText = 'font-weight: bold; margin-bottom: 8px; text-align: center;';
                title.textContent = 'Confirm Swap?';
                
                const detail = document.createElement('div');
                detail.style.cssText = 'font-size: 13px; text-align: center; margin-bottom: 16px;';
                detail.innerHTML = `${this.inputToken.symbol} <span style="opacity: 0.5;">➜</span> ${this.targetToken.symbol}`;
                
                const btn = document.createElement('button');
                btn.style.cssText = 'width: 100%; background: #6366f1; color: white; border: none; padding: 10px; border-radius: 6px; font-weight: bold; cursor: pointer;';
                btn.textContent = 'EXECUTE SWAP';
                btn.onclick = async () => {
                    btn.textContent = 'SWAPPING...';
                    btn.disabled = true;
                    
                    let action: 'BUY' | 'SELL' = 'BUY';
                    let ticker = this.targetToken.symbol;
                    
                    if (this.targetToken.symbol === 'ETH' || this.targetToken.symbol === 'native') {
                         action = 'SELL';
                         ticker = this.inputToken.symbol;
                    } else {
                         action = 'BUY';
                         ticker = this.targetToken.symbol;
                    }
                    
                    const intent = {
                        ticker: ticker,
                        action: action,
                        amount: 1,
                        timestamp: Date.now()
                    };
                    
                    const success = await requestWalletTransaction(intent);
                    if (success) {
                        btn.style.background = '#10b981';
                        btn.textContent = 'SUCCESS';
                    } else {
                        btn.style.background = '#ef4444';
                        btn.textContent = 'FAILED';
                    }

                    setTimeout(() => {
                        this.swapState = 'IDLE';
                        this.updateUI(b3obj, engine);
                    }, 2000);
                };

                this._uiContainer.appendChild(title);
                this._uiContainer.appendChild(detail);
                this._uiContainer.appendChild(btn);
            }
        }
    }

    toJSON() { return { ...super.toJSON(), type: 'SwapController' }; }
    static fromJSON(data: any): SwapController {
        const n = new SwapController();
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        return n;
    }
}

/**
 * SwapActuator: Animates the mechanical tilt of the scale.
 */
export class SwapActuator extends Actuator {
    private currentTilt = 0;
    private _cachedController: SwapController | null = null;
    
    constructor() { super(); }
    getTypeName() { return 'SwapActuator'; }

    update(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef) {
        if (!this._cachedController) {
            this._cachedController = engine.objects
                .flatMap((o: any) => o.controllers)
                .find((c: any) => c instanceof SwapController) as SwapController;
        }
        
        if (!this._cachedController) return;

        const targetTilt = this._cachedController.swapState !== 'IDLE' ? -0.2 : 0;
        
        // Smooth lerp
        this.currentTilt = THREE.MathUtils.lerp(this.currentTilt, targetTilt, delta * 2.5);

        // Find the Arm mesh in the hierarchy
        const arm = b3obj.object.getObjectByName('ScaleArm');
        if (arm) {
            arm.rotation.z = this.currentTilt;
        }

        // Find Pans and counter-rotate them to keep them vertical
        const leftPan = b3obj.object.getObjectByName('LeftPan');
        const rightPan = b3obj.object.getObjectByName('RightPan');
        if (leftPan) leftPan.rotation.z = -this.currentTilt;
        if (rightPan) rightPan.rotation.z = -this.currentTilt;
    }

    execute(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef) {}
    
    toJSON() { return { ...super.toJSON(), type: 'SwapActuator' }; }
    static fromJSON(data: any): SwapActuator {
        const n = new SwapActuator();
        n.id = data.id; n.guiMetadata = data.guiMetadata; n.enabled = data.enabled;
        return n;
    }
}
