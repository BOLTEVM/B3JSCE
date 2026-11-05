import * as webjsx from 'webjsx';
import * as THREE from 'three';
import { B3Engine, B3Object, Sensor, Controller, Actuator, KeyboardSensor, AndController, MotionActuator, createSwapScaleTemplate, ZK_CEREMONY_CURRICULUM, QUAIAXE_CURRICULUM } from '@b3js/engine';
import { TutorialOverlay } from './components/TutorialOverlay';
import { selectObject as storeSelectObject } from './store/selectionStore';
import { getActiveScheme } from './store/colorScheme';

// Component Imports
import { Header } from './components/Header';
import { ToolSidebar } from './components/ToolSidebar';
import { Outliner } from './components/Outliner';
import { Properties } from './components/Properties';
import { LogicEditor } from './components/LogicEditor';
import { MiningPanel } from './components/MiningPanel';
import { SettingsModal } from './components/SettingsModal';
import { XRToolbar } from './components/XRToolbar';
import { XRUXOverlay } from './components/XRUXOverlay';
import { HapticsPanel } from './components/HapticsPanel';


type ComponentFn = (props: any) => any;

/**
 * Industry-Standard B3JS Engine Editor
 */
const PIN_COLORS = {
    'exec': '#ffffff',
    'number': '#f6ad55',
    'vector3': '#a78bfa',
    'quaternion': '#f472b6',
    'boolean': '#4ade80',
    'string': '#60a5fa',
    'geometry': '#10b981',
    'object': '#fbbf24',
    'any': '#94a3b8',
    // Shader Types
    'float': '#94a3b8',
    'vec2': '#a855f7',
    'vec3': '#eab308',
    'color': '#eab308',
    'vec4': '#ec4899'
};

const CATEGORY_COLORS: Record<string, string> = {
    'Event': '#9b2c2c',
    'Logic': '#22543d',
    'Math': '#744210',
    'Variable': '#44337a',
    'Action': '#2a4365',
    'Web3': '#2d3748',
    'Physics': '#285e61',
    // Shader Categories
    'Geometry': '#4c1d95',
    'Input': '#4c1d95',
    'Texture': '#7c2d12',
    'Converter': '#164e63',
    'Shader': '#14532d',
    'Output': '#7f1d1d',
    'Default': '#1a202c'
};

export class B3Editor extends HTMLElement {
    private engine: B3Engine | null = null;
    private selectedObject: B3Object | null = null;
    private miningStats = { hashrate: '0 H/s', shares: '0', status: 'OFFLINE' };
    private gizmoMode: 'translate' | 'rotate' | 'scale' = 'translate';
    private isSettingsOpen: boolean = false;
    private isHapticsOpen: boolean = false;
    private isProjectModalOpen: boolean = false;
    private isHelpOpen: boolean = false;
    private isAboutOpen: boolean = false;
    private activeMenu: string | null = null;
    private logicHeight: number = 250;
    private isDraggingNode: string | null = null;
    private isDraggingWire: boolean = false;
    private wireSource: { node: any, type: string, side: 'in' | 'out', pinName?: string } | null = null;
    private wireMousePos: { x: number, y: number } = { x: 0, y: 0 };
    private selectedShaderNode: any | null = null;
    private isResizingLogic: boolean = false;
    private activeBottomTab: 'logic' | 'shader' | 'audio' | 'network' | 'optimization' | 'inventory' | 'robotics' | 'assetBank' | 'haptics' | 'zk' | 'trading' | 'ceremony' | 'qaxe' | 'arcade' = 'logic';

    private miningEventHandlers: Partial<Record<'fractal' | 'quai' | 'qrl', () => void>> = {};
    private documentationShortcutBound: boolean = false;
    private lazyComponents: Record<string, ComponentFn | null> = {
        ShaderEditor: null,
        AudioPanel: null,
        NetworkPanel: null,
        OptimizationPanel: null,
        InventoryPanel: null,
        RoboticsPanel: null,
        ProjectModal: null,
        DocumentationModal: null,
        AboutModal: null,
        AssetBank: null,
        HapticsPanel: null,
        ZKPanel: null,
        TradingPanel: null,
        CeremonyPanel: null,
        QuaiAxePanel: null,
        RhythmArcadePanel: null,
    };

    private lazyComponentPromises: Record<string, Promise<void> | null> = {};

    private root: HTMLElement;

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.root = document.createElement('div');
        this.root.style.height = '100%';
        this.root.style.width = '100%';
        this.shadowRoot!.appendChild(this.root);
    }

    setEngine(engine: B3Engine) {
        this.engine = engine;
        this.engine.setOnSelectionChange((obj: B3Object | null) => {
            this.selectedObject = obj;
            storeSelectObject(obj?.id ?? null);
            this.render();
        });

        if (!this.documentationShortcutBound) {
            window.addEventListener('keydown', this.handleDocumentationShortcut);
            this.documentationShortcutBound = true;
        }

        // Register Spatial UI (Tablet Outliner)
        this.engine.setSpatialUIRenderer((container: HTMLElement) => {
            webjsx.applyDiff(container, (
                <div style="height: 100%; display: flex; flex-direction: column;">
                    <div style="background: #222; padding: 10px; font-weight: bold; font-size: 14px; color: #fff;">
                        Bolt Tablet OS
                    </div>
                    <div style="flex: 1; overflow: hidden;">
                        {Outliner({ 
                            objects: this.engine?.objects || [], 
                            selectedObjectId: this.selectedObject?.id, 
                            onSelect: (id: any) => this.engine?.selectObject(id),
                            onDelete: (id: any, name: any) => { if(confirm(`Delete ${name}?`)) this.engine?.removeObject(id); }
                        })}
                    </div>
                </div>
            ));
        });

        // Register Spatial Trading Panel
        this.engine.setSpatialTradingRenderer((container: HTMLElement) => {
            const renderTrading = () => {
                const TradingPanel = this.lazyComponents.TradingPanel;
                webjsx.applyDiff(container, (
                    <div style="height: 100%; display: flex; flex-direction: column;">
                        <div style="background: #1e3a8a; padding: 10px; font-weight: bold; font-size: 14px; color: #fff; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-chart-line" style="color: #93c5fd;"></i>
                            Bolt OS - Trading Agents
                        </div>
                        <div style="flex: 1; overflow: hidden; background: #1a1b1e;">
                            {TradingPanel ? TradingPanel({}) : <div style="padding: 20px; color: #888;">Loading Trading Panel...</div>}
                        </div>
                    </div>
                ));
            };

            if (!this.lazyComponents.TradingPanel) {
                this.loadLazyComponent('TradingPanel', () => import('./components/TradingPanel')).then(renderTrading);
            }
            renderTrading();
        });

        // Register Spatial Toolbar
        this.engine.setSpatialToolbarRenderer((container: HTMLElement) => {
            webjsx.applyDiff(container, (
                <XRToolbar 
                    selectedObject={this.selectedObject}
                    transformMode={this.gizmoMode}
                    onAction={(id: string) => {
                        if (id === 'duplicate') this.engine?.duplicateObject(this.selectedObject!);
                        else if (id === 'delete') this.engine?.removeObject(this.selectedObject!.id);
                        else this.setGizmoMode(id as any);
                    }}
                    onClose={() => this.engine?.selectObject(null)}
                />
            ));
        });

        // Initialize SpacetimeDB connection for real-time multiplayer sync
        this.engine.spacetime.connect('ws://localhost:3000', 'b3js_sync');

        // Load Custom Assets if configured
        const customAssetsUrl = localStorage.getItem('B3JS_CUSTOM_ASSETS_URL');
        if (customAssetsUrl) {
            this.engine.loadCustomAssetBank(customAssetsUrl);
        }

        this.render();
    }


    private renderNode(node: any, type: string) {
        const info = (node.constructor as any).getNodeInfo ? (node.constructor as any).getNodeInfo() : { label: node.constructor.name, category: 'Default', icon: '📦', color: '#888' };
        let title = info.label;
        if (node.constructor.name === 'KeyboardSensor') title = (node as any).targetKey || 'Key';

        const headerColor = CATEGORY_COLORS[info.category] || CATEGORY_COLORS['Default'];

        const onPinMouseDown = (e: MouseEvent, side: 'in' | 'out', pinName?: string) => {
            e.stopPropagation();
            e.preventDefault();
            
            // Drag-to-Break Logic
            if (side === 'in') {
                if (type === 'controller') {
                    const sensor = this.selectedObject?.sensors.find(s => node.sensors.includes(s));
                    if (sensor) {
                        node.sensors = node.sensors.filter((s: any) => s !== sensor);
                        this.isDraggingWire = true;
                        this.wireSource = { node: sensor, type: 'sensor', side: 'out' };
                        return;
                    }
                } else if (type === 'shader' && pinName) {
                    const input = node.inputs.get(pinName);
                    if (input) {
                        const sourceNode = this.selectedObject?.materialNodes.find((n: any) => n.id === input.nodeId);
                        node.inputs.delete(pinName);
                        this.isDraggingWire = true;
                        this.wireSource = { node: sourceNode, type: 'shader', side: 'out', pinName: input.outputName };
                        return;
                    }
                }
            }

            this.isDraggingWire = true;
            this.wireSource = { node, type, side, pinName };
            this.wireMousePos = { x: e.clientX, y: e.clientY };
            this.render();
        };

        const onPinMouseUp = (e: MouseEvent, side: 'in' | 'out', pinName?: string) => {
            e.stopPropagation();
            e.preventDefault();
            if (!this.isDraggingWire || !this.wireSource) return;
            const src = this.wireSource;
            
            // VALDIATION & CONNECTION
            if (src.side === 'out' && side === 'in') {
                const srcPin = src.pinName && src.node.outputs?.find((p: any) => p.id === src.pinName);
                const targetPin = pinName && node.inputs?.find((p: any) => p.id === pinName);

                if (srcPin && targetPin) {
                    const compatible = srcPin.dataType === targetPin.dataType
                        || srcPin.dataType === 'any'
                        || targetPin.dataType === 'any';

                    if (compatible && !targetPin.connectedTo?.includes(srcPin.id)) {
                        targetPin.connectedTo = targetPin.connectedTo || [];
                        srcPin.connectedTo = srcPin.connectedTo || [];
                        targetPin.connectedTo.push(srcPin.id);
                        srcPin.connectedTo.push(targetPin.id);
                    }
                } else {
                    if (src.type === 'sensor' && type === 'controller') node.addSensor(src.node);
                    if (src.type === 'controller' && type === 'actuator') src.node.addActuator(node);
                }
                
                if (src.type === 'shader' && type === 'shader' && pinName && src.pinName) {
                    node.inputs.set(pinName, { nodeId: src.node.id, outputName: src.pinName });
                }
            }
            
            this.isDraggingWire = false;
            this.wireSource = null;
            this.render();
        };

        return (
            <div class={`node-card ${this.selectedShaderNode?.id === node.id ? 'node-selected' : ''}`} 
                 style={`left: ${node.guiMetadata.x}px; top: ${node.guiMetadata.y}px; border-color: ${headerColor}88;`}>
                <div class="node-header" 
                     style={`background: ${headerColor}; border-bottom: 1px solid rgba(255,255,255,0.1);`}
                     onMouseDown={(e: any) => { e.stopPropagation(); this.isDraggingNode = node.id; }}>
                    <span style="margin-right: 6px; opacity: 0.8;">{info.icon}</span>
                    <span style="flex: 1;">{title}</span>
                </div>
                <div class="node-body">
                    {/* Logic Node Pins (V1 Fallback & V2 Typed) */}
                    {(type === 'sensor' || type === 'controller' || type === 'actuator') && node.inputs && node.inputs.length === 0 && node.outputs && node.outputs.length === 0 && (
                        <div style="display: flex; justify-content: space-between; align-items: center; min-height: 20px;">
                            {type !== 'sensor' && (
                                <div class="pin pin-connected" 
                                     onMouseDown={(e: any) => onPinMouseDown(e, 'in')} 
                                     onMouseUp={(e: any) => onPinMouseUp(e, 'in')}
                                     style="background: #ffffff; border-color: #fff;"></div>
                            )}
                            {type !== 'actuator' && (
                                <div class="pin pin-connected" 
                                     onMouseDown={(e: any) => onPinMouseDown(e, 'out')}
                                     style="background: #ffffff; border-color: #fff; margin-left: auto;"></div>
                            )}
                        </div>
                    )}

                    {/* V2 Logic Node Pins */}
                    {(type === 'sensor' || type === 'controller' || type === 'actuator') && (node.inputs.length > 0 || node.outputs.length > 0) && (
                        <div style="display: flex; justify-content: space-between; margin-top: 2px;">
                            <div style="display: flex; flex-direction: column; gap: 8px;">
                                {node.inputs.map((p: any) => (
                                    <div style="display: flex; align-items: center; gap: 6px;">
                                        <div class={`pin ${p.connectedTo?.length > 0 ? 'pin-connected' : ''}`} 
                                             style={`background: ${p.connectedTo?.length > 0 ? (PIN_COLORS as any)[p.dataType] || '#888' : '#111'}; border-color: ${(PIN_COLORS as any)[p.dataType] || '#444'};`}
                                             onMouseDown={(e: any) => onPinMouseDown(e, 'in', p.id)}
                                             onMouseUp={(e: any) => onPinMouseUp(e, 'in', p.id)}
                                             title={p.dataType}></div>
                                        <span style={`font-size: 9px; font-weight: 500; color: ${p.connectedTo?.length > 0 ? '#eee' : '#888'};`}>{p.name} {p.dataType === 'exec' ? '►' : ''}</span>
                                    </div>
                                ))}
                            </div>
                            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
                                {node.outputs.map((p: any) => (
                                    <div style="display: flex; align-items: center; gap: 6px;">
                                        <span style={`font-size: 9px; font-weight: 500; color: ${p.connectedTo?.length > 0 ? '#eee' : '#888'};`}>{p.dataType === 'exec' ? '►' : ''} {p.name}</span>
                                        <div class={`pin ${p.connectedTo?.length > 0 ? 'pin-connected' : ''}`}
                                             style={`background: ${p.connectedTo?.length > 0 ? (PIN_COLORS as any)[p.dataType] || '#888' : '#111'}; border-color: ${(PIN_COLORS as any)[p.dataType] || '#444'};`}
                                             onMouseDown={(e: any) => onPinMouseDown(e, 'out', p.id)}
                                             title={p.dataType}></div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Shader Node Pins */}
                    {type === 'shader' && (
                        <div style="display: flex; flex-direction: column; gap: 8px;">
                            <div style="display: flex; justify-content: space-between;">
                                <div style="display: flex; flex-direction: column; gap: 6px;">
                                    {node.getInputPins().map((p: any) => (
                                        <div style="display: flex; align-items: center; gap: 6px;">
                                            <div class={`pin ${node.inputs.has(p.name) ? 'pin-connected' : ''}`} 
                                                 style={`background: ${node.inputs.has(p.name) ? (PIN_COLORS as any)[p.type] || '#888' : '#111'}; border-color: ${(PIN_COLORS as any)[p.type] || '#444'};`}
                                                 onMouseDown={(e: any) => onPinMouseDown(e, 'in', p.name)}
                                                 onMouseUp={(e: any) => onPinMouseUp(e, 'in', p.name)}
                                                 title={p.type}></div>
                                            <span style={`font-size: 9px; font-weight: 500; color: ${node.inputs.has(p.name) ? '#eee' : '#888'};`}>{p.name}</span>
                                        </div>
                                    ))}
                                </div>
                                <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 6px;">
                                    {node.getOutputPins().map((p: any) => (
                                        <div style="display: flex; align-items: center; gap: 6px;">
                                            <span style="font-size: 9px; font-weight: 500; color: #eee;">{p.name}</span>
                                            <div class="pin pin-connected" 
                                                 style={`background: ${(PIN_COLORS as any)[p.type] || '#888'}; border-color: ${(PIN_COLORS as any)[p.type] || '#444'};`}
                                                 onMouseDown={(e: any) => onPinMouseDown(e, 'out', p.name)}
                                                 title={p.type}></div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Inline Controls */}
                            <div style="margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 8px;">
                                {node.constructor.name === 'ColorNode' && (
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <input type="color" value={`#${node.color.getHexString()}`} 
                                               style="width: 100%; height: 20px; border: 1px solid #333; cursor: pointer; background: none; padding: 0;"
                                               onInput={(e: any) => { node.color.set(e.target.value); this.render(); }} />
                                    </div>
                                )}
                                {node.constructor.name === 'MathNode' && (
                                    <select style="width: 100%; font-size: 9px; background: #000; border: 1px solid #333; color: #aaa;"
                                            value={node.operation}
                                            onChange={(e: any) => { node.operation = e.target.value; this.render(); }}>
                                        <option value="add">ADD</option>
                                        <option value="multiply">MULTIPLY</option>
                                        <option value="sin">SINE</option>
                                    </select>
                                )}
                                {node.constructor.name === 'AudioNode' && (
                                    <div style="display: flex; flex-direction: column; gap: 2px;">
                                        <div style="display: flex; justify-content: space-between; font-size: 8px; color: #555;">
                                            <span>FREQ</span>
                                            <span>{Math.floor(node.freqIndex)}</span>
                                        </div>
                                        <input type="range" min="0" max="127" value={node.freqIndex} 
                                               style="width: 100%; height: 4px; accent-color: var(--accent);"
                                               onInput={(e: any) => { node.freqIndex = parseInt(e.target.value); this.render(); }} />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    private drawBezier(x1: number, y1: number, x2: number, y2: number, color = "#ffffff", opacity = "0.8") {
        const dx = Math.abs(x2 - x1);
        const horizontalOffset = Math.min(dx / 2, 50);
        const cp1x = x1 + horizontalOffset;
        const cp2x = x2 - horizontalOffset;
        
        return (
            <g>
                <path d={`M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2}`} 
                      stroke={color} 
                      stroke-width="3" 
                      fill="none" 
                      opacity={opacity}
                      style="transition: stroke 0.2s; filter: drop-shadow(0 0 2px rgba(0,0,0,0.5));" />
                <path d={`M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2}`} 
                      stroke={color} 
                      stroke-width="1" 
                      fill="none" 
                      opacity={Math.min(parseFloat(opacity) * 1.5, 1)} />
            </g>
        );
    }

    private renderWires() {
        if (!this.selectedObject) return null;
        const paths: any[] = [];

        if (this.activeBottomTab === 'logic') {
            const container = this.shadowRoot?.getElementById('logic-canvas-container') as HTMLElement | null;
            const rect = container?.getBoundingClientRect();

            const allNodes = [
                ...this.selectedObject.sensors,
                ...this.selectedObject.controllers,
                ...this.selectedObject.actuators
            ];

            const wireOpacity = localStorage.getItem('B3JS_WIRE_OPACITY') || "0.8";
            const wireColorMode = localStorage.getItem('B3JS_WIRE_COLOR_MODE') || "typed";
            const wireCustomColor = localStorage.getItem('B3JS_WIRE_CUSTOM_COLOR') || "#e68523";

            // Draw V1 Legacy Connections
            this.selectedObject.controllers.forEach(c => {
                if (c.inputs && c.inputs.length > 0) return; // Skip if V2
                c.sensors.forEach((s: any) => {
                    paths.push(this.drawBezier(s.guiMetadata.x + 160, s.guiMetadata.y + 24, c.guiMetadata.x, c.guiMetadata.y + 24, "#ffffff", wireOpacity));
                });
                c.actuators.forEach((a: any) => {
                    paths.push(this.drawBezier(c.guiMetadata.x + 160, c.guiMetadata.y + 24, a.guiMetadata.x, a.guiMetadata.y + 24, "#ffffff", wireOpacity));
                });
            });

            // Draw V2 Connections
            allNodes.forEach(target => {
                if (!target.inputs || target.inputs.length === 0) return;
                target.inputs.forEach((inputPin: any, inIdx: number) => {
                    inputPin.connectedTo?.forEach((srcPinId: string) => {
                        allNodes.forEach(source => {
                            if (!source.outputs) return;
                            const outIdx = source.outputs.findIndex((p: any) => p.id === srcPinId);
                            if (outIdx !== -1) {
                                const srcPin = source.outputs[outIdx];
                                const x1 = source.guiMetadata.x + 160; // node width
                                const y1 = source.guiMetadata.y + 35 + (outIdx * 19);
                                const x2 = target.guiMetadata.x;
                                const y2 = target.guiMetadata.y + 35 + (inIdx * 19);
                                
                                let c = (PIN_COLORS as any)[srcPin.dataType] || "#e68523";
                                if (wireColorMode === 'custom') c = wireCustomColor;

                                paths.push(this.drawBezier(x1, y1, x2, y2, c, wireOpacity));
                            }
                        });
                    });
                });
            });

            // ACTIVE DRAG WIRE
            if (this.isDraggingWire && this.wireSource && rect) {
                const src = this.wireSource.node.guiMetadata;
                const isOut = this.wireSource.side === 'out';
                const sourcePins = isOut ? this.wireSource.node.outputs : this.wireSource.node.inputs;
                const sourcePinIndex = sourcePins?.findIndex((p: any) => p.id === this.wireSource?.pinName) ?? -1;
                const x1 = isOut ? src.x + 160 : src.x;
                const y1 = src.y + 35 + (Math.max(0, sourcePinIndex) * 19);
                
                const scrollX = container?.scrollLeft || 0;
                const scrollY = container?.scrollTop || 0;
                const mx = this.wireMousePos.x - rect.left + scrollX;
                const my = this.wireMousePos.y - rect.top + scrollY;
                
                paths.push(this.drawBezier(x1, y1, mx, my, "#e68523", "0.4"));
            }
        } else if (this.activeBottomTab === 'shader') {
            const container = this.shadowRoot?.getElementById('shader-canvas-container') as HTMLElement | null;
            const rect = container?.getBoundingClientRect();

            this.selectedObject.materialNodes.forEach(target => {
                target.inputs.forEach((input, inputName) => {
                    const source = this.selectedObject!.materialNodes.find((n: any) => n.id === input.nodeId);
                    if (source) {
                        const outPins = source.getOutputPins();
                        const outIdx = outPins.findIndex((p: any) => p.name === input.outputName);
                        const inPins = target.getInputPins();
                        const inIdx = inPins.findIndex((p: any) => p.name === inputName);

                        if (outIdx === -1 || inIdx === -1) return;

                        const x1 = source.guiMetadata.x + 160;
                        const y1 = source.guiMetadata.y + 40 + (outIdx * 20);
                        const x2 = target.guiMetadata.x;
                        const y2 = target.guiMetadata.y + 40 + (inIdx * 20);
                        
                        const pinType = outPins[outIdx].type;
                        const color = (PIN_COLORS as any)[pinType] || "#4a9eff";
                        paths.push(this.drawBezier(x1, y1, x2, y2, color, "0.8"));
                    }
                });
            });

            if (this.isDraggingWire && this.wireSource && rect) {
                const src = this.wireSource.node.guiMetadata;
                const isOut = this.wireSource.side === 'out';
                
                let pinOffset = 0;
                let color = "#4a9eff";

                if (this.wireSource.pinName) {
                    const pins = isOut ? this.wireSource.node.getOutputPins() : this.wireSource.node.getInputPins();
                    const idx = pins.findIndex((p: any) => p.name === this.wireSource?.pinName);
                    pinOffset = Math.max(0, idx) * 20;
                    if (idx !== -1) {
                        color = (PIN_COLORS as any)[pins[idx].type] || color;
                    }
                }

                const x1 = isOut ? src.x + 160 : src.x;
                const y1 = src.y + 40 + pinOffset;
                
                const scrollX = container?.scrollLeft || 0;
                const scrollY = container?.scrollTop || 0;
                const mx = this.wireMousePos.x - rect.left + scrollX;
                const my = this.wireMousePos.y - rect.top + scrollY;
                
                paths.push(this.drawBezier(x1, y1, mx, my, color, "0.4"));
            }
        }
        return paths;
    }

    updateMining(stats: any) {
        this.miningStats = {
            hashrate: stats.hashrate.toFixed(2) + (stats.miner === 'QRL' ? ' H/s' : ' MH/s'),
            shares: stats.shares.toString(),
            status: stats.status
        };
        this.render();
    }

    setGizmoMode(mode: 'translate' | 'rotate' | 'scale') {
        this.gizmoMode = mode;
        if (this.engine) this.engine.setGizmoMode(mode);
        this.render();
    }

    connectedCallback() {
        this.render();
        window.addEventListener('b3js:ui:setTab', (e: any) => {
            if (e.detail) {
                this.activeBottomTab = e.detail;
                this.render();
            }
        });
        // Tutorial progression → re-render the overlay
        window.addEventListener('b3js:tutorial:step', () => this.render());

        if (!this.documentationShortcutBound) {
            window.addEventListener('keydown', this.handleDocumentationShortcut);
            this.documentationShortcutBound = true;
        }
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('click', this.handleGlobalClick);
        window.addEventListener('mousemove', this.handleMouseMove);
        window.addEventListener('mouseup', this.handleMouseUp);
        (window as any).B3_EDITOR_INSTANCE = this;

        (['fractal', 'quai', 'qrl'] as const).forEach(type => {
            const handler = () => this.render();
            this.miningEventHandlers[type] = handler;
            window.addEventListener(`b3js:mining:${type}`, handler);
        });

        // Signal to consumers that the editor DOM is ready
        this.dispatchEvent(new CustomEvent('editor-ready', {
            bubbles: true,
            composed: true, // Crosses shadow DOM boundary
        }));
    }

    disconnectedCallback() {
        window.removeEventListener('keydown', this.handleKeyDown);
        if (this.documentationShortcutBound) {
            window.removeEventListener('keydown', this.handleDocumentationShortcut);
            this.documentationShortcutBound = false;
        }
        window.removeEventListener('click', this.handleGlobalClick);
        window.removeEventListener('mousemove', this.handleMouseMove);
        window.removeEventListener('mouseup', this.handleMouseUp);
        (['fractal', 'quai', 'qrl'] as const).forEach(type => {
            const handler = this.miningEventHandlers[type];
            if (handler) window.removeEventListener(`b3js:mining:${type}`, handler);
        });
        (window as any).B3_EDITOR_INSTANCE = null;
    }

    private handleMouseMove = (e: MouseEvent) => {
        if (this.isResizingLogic) {
            const h = window.innerHeight - e.clientY - 100;
            this.logicHeight = Math.max(100, Math.min(600, h));
            this.render();
        }
        if (this.isDraggingNode && this.selectedObject) {
            const node = [
                ...this.selectedObject.sensors, 
                ...this.selectedObject.controllers, 
                ...this.selectedObject.actuators,
                ...this.selectedObject.materialNodes
            ].find(n => n.id === this.isDraggingNode);
            if (node) {
                node.guiMetadata.x += e.movementX;
                node.guiMetadata.y += e.movementY;
                
                // Snap to 20px Grid
                node.guiMetadata.x = Math.round(node.guiMetadata.x / 20) * 20;
                node.guiMetadata.y = Math.round(node.guiMetadata.y / 20) * 20;
                
                this.render();
            }
        }
        if (this.isDraggingWire) {
            this.wireMousePos = { x: e.clientX, y: e.clientY };
            this.render();
        }
    };

    private handleMouseUp = () => {
        this.isResizingLogic = false;
        this.isDraggingNode = null;
        this.isDraggingWire = false;
        this.wireSource = null;
        this.render();
    };

    private handleGlobalClick = (e: MouseEvent) => {
        if (this.activeMenu) {
            this.activeMenu = null;
            this.render();
        }
        this.selectedShaderNode = null;
        this.render();
    };

    private handleDocumentationShortcut = (e: KeyboardEvent) => {
        if (e.key !== 'F12') return;

        e.preventDefault();
        e.stopPropagation();

        this.openDocumentation();
    };

    private loadLazyComponent(name: string, loader: () => Promise<any>): Promise<void> {
        if (this.lazyComponents[name]) return Promise.resolve();
        if (this.lazyComponentPromises[name]) return this.lazyComponentPromises[name] as Promise<void>;

        this.lazyComponentPromises[name] = loader().then((module) => {
            this.lazyComponents[name] = module[name];
            this.render();
        }).finally(() => {
            this.lazyComponentPromises[name] = null;
        });
        
        return this.lazyComponentPromises[name] as Promise<void>;
    }

    private loadBottomTab(tab: typeof this.activeBottomTab) {
        if (tab === 'shader') this.loadLazyComponent('ShaderEditor', () => import('./components/ShaderEditor'));
        if (tab === 'audio') this.loadLazyComponent('AudioPanel', () => import('./components/AudioPanel'));
        if (tab === 'network') this.loadLazyComponent('NetworkPanel', () => import('./components/NetworkPanel'));
        if (tab === 'optimization') this.loadLazyComponent('OptimizationPanel', () => import('./components/OptimizationPanel'));
        if (tab === 'inventory') this.loadLazyComponent('InventoryPanel', () => import('./components/InventoryPanel'));
        if (tab === 'robotics') this.loadLazyComponent('RoboticsPanel', () => import('./components/RoboticsPanel'));
        if (tab === 'assetBank') this.loadLazyComponent('AssetBank', () => import('./components/AssetBank'));
        if (tab === 'zk') this.loadLazyComponent('ZKPanel', () => import('./components/ZKPanel'));
        if (tab === 'ceremony') this.loadLazyComponent('CeremonyPanel', () => import('./components/CeremonyPanel'));
        if (tab === 'qaxe') this.loadLazyComponent('QuaiAxePanel', () => import('./components/QuaiAxePanel'));
        if (tab === 'arcade') this.loadLazyComponent('RhythmArcadePanel', () => import('./components/RhythmArcadePanel'));
        if (tab === 'trading') this.loadLazyComponent('TradingPanel', () => import('./components/TradingPanel'));
        if (tab === 'haptics') this.loadLazyComponent('HapticsPanel', () => import('./components/HapticsPanel'));
    }

    private setBottomTab(tab: typeof this.activeBottomTab) {
        if (tab === 'haptics') {
            this.isHapticsOpen = true;
            this.loadBottomTab(tab);
            this.render();
            return;
        }
        this.activeBottomTab = tab;
        this.loadBottomTab(tab);
        this.render();
    }

    private openProjectModal() {
        this.activeMenu = null;
        this.isProjectModalOpen = true;
        this.loadLazyComponent('ProjectModal', () => import('./components/ProjectModal'));
        this.render();
    }

    private openDocumentation() {
        this.activeMenu = null;
        this.isHelpOpen = true;
        this.loadLazyComponent('DocumentationModal', () => import('./components/DocumentationModal'));
        this.render();
    }

    private openAbout() {
        this.activeMenu = null;
        this.isAboutOpen = true;
        this.loadLazyComponent('AboutModal', () => import('./components/AboutModal'));
        this.render();
    }

    private renderLazyPanel() {
        return <div style="padding: 14px; color: #777; font-size: 10px;">Loading panel...</div>;
    }

    private isTextEntryActive() {
        const activeElement = (this.shadowRoot?.activeElement || document.activeElement) as HTMLElement | null;
        const tagName = activeElement?.tagName;

        return tagName === 'INPUT'
            || tagName === 'TEXTAREA'
            || tagName === 'SELECT'
            || activeElement?.isContentEditable;
    }

    private isAnyModalOpen() {
        return this.isSettingsOpen || this.isProjectModalOpen || this.isHelpOpen || this.isAboutOpen;
    }

    private closeTopModal() {
        if (this.isHelpOpen) this.isHelpOpen = false;
        else if (this.isAboutOpen) this.isAboutOpen = false;
        else if (this.isProjectModalOpen) this.isProjectModalOpen = false;
        else if (this.isSettingsOpen) this.isSettingsOpen = false;
    }

    private handleKeyDown = (e: KeyboardEvent) => {
        if (!this.engine) return;

        const isCtrl = e.ctrlKey || e.metaKey;
        const isTextEntryActive = this.isTextEntryActive();

        if (e.key === 'Escape' && this.isAnyModalOpen()) {
            e.preventDefault();
            this.closeTopModal();
            this.render();
            return;
        }

        if (this.isAnyModalOpen()) {
            e.stopImmediatePropagation();
            return;
        }

        if (isTextEntryActive) {
            e.stopImmediatePropagation();
            return;
        }

        if (isCtrl && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (e.shiftKey) {
                this.engine.history.redo();
            } else {
                this.engine.history.undo();
            }
            this.render();
        }

        if (isCtrl && e.key.toLowerCase() === 'y') {
            e.preventDefault();
            this.engine.history.redo();
            this.render();
        }

        if (isCtrl && e.key.toLowerCase() === 'd') {
            e.preventDefault();
            if (this.selectedObject) {
                this.engine.duplicateObject(this.selectedObject.id);
                this.render();
            }
        }

        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (this.selectedObject) {
                this.engine.removeObject(this.selectedObject.id);
                this.render();
            }
        }

        if (e.key.toLowerCase() === 'g') this.setGizmoMode('translate');
        if (e.key.toLowerCase() === 'r') this.setGizmoMode('rotate');
        if (e.key.toLowerCase() === 's') this.setGizmoMode('scale');
    };

    private saveProject() {
        if (!this.engine) return;
        let name = "New Project";
        let id = this.engine.activeProjectId;
        
        if (!id) {
            const input = prompt("Enter Project Name:", "My B3JS World");
            if (!input) return;
            name = input;
        } else {
            const list = this.engine.projects.list();
            name = list.find(p => p.id === id)?.name || "Unnamed Project";
        }

        const data = this.engine.serialize();
        const savedId = this.engine.projects.save(name, data, id || undefined);
        this.engine.activeProjectId = savedId;
        alert(`Project '${name}' saved!`);
        this.render();
    }

    private exportProject() {
        if (!this.engine) return;
        const data = this.engine.serialize();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `b3js_project_${new Date().getTime()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    private importProject() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e: any) => {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (res: any) => {
                const content = res.target.result;
                if (this.engine) {
                    this.engine.deserialize(content);
                    this.render();
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    render() {
        const scheme = getActiveScheme();
        const ShaderEditor = this.lazyComponents.ShaderEditor;
        const AudioPanel = this.lazyComponents.AudioPanel;
        const NetworkPanel = this.lazyComponents.NetworkPanel;
        const OptimizationPanel = this.lazyComponents.OptimizationPanel;
        const InventoryPanel = this.lazyComponents.InventoryPanel;
        const RoboticsPanel = this.lazyComponents.RoboticsPanel;
        const ProjectModal = this.lazyComponents.ProjectModal;
        const DocumentationModal = this.lazyComponents.DocumentationModal;
        const AboutModal = this.lazyComponents.AboutModal;
        const AssetBank = this.lazyComponents.AssetBank;
        const HapticsPanel = this.lazyComponents.HapticsPanel;
        const ZKPanel = this.lazyComponents.ZKPanel;
        const TradingPanel = this.lazyComponents.TradingPanel;
        const CeremonyPanel = this.lazyComponents.CeremonyPanel;
        const QuaiAxePanel = this.lazyComponents.QuaiAxePanel;
        const RhythmArcadePanel = this.lazyComponents.RhythmArcadePanel;


        webjsx.applyDiff(this.root, (
            <div id="editor-root" style={`--accent: ${scheme.accent}; --accent-light: ${scheme.accentLight}; grid-template-rows: 40px 1fr 1fr 4px ${this.logicHeight}px 100px;`}>
                <style>{`
                    #editor-root {
                        display: grid;
                        grid-template-areas: 
                            "header header header"
                            "tools viewport outliner"
                            "tools viewport properties"
                            "tools resizer properties"
                            "tools logic properties"
                            "mining mining properties";
                        grid-template-columns: 50px 1fr 300px;
                        grid-template-rows: 32px 150px 1fr 4px ${this.logicHeight}px 80px;
                        height: 100vh; width: 100vw; background: #1d1d1d; color: #cfcfcf;
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 11px; overflow: hidden;
                    }
                    .panel { background: #282828; border: 1px solid #181818; display: flex; flex-direction: column; overflow: hidden; }
                    .panel-header { background: #3d3d3d; padding: 4px 8px; font-weight: bold; text-transform: uppercase; font-size: 9px; letter-spacing: 1px; border-bottom: 1px solid #181818; }
                    header { grid-area: header; background: #333; display: flex; align-items: center; padding: 0 10px; border-bottom: 1px solid #111; }
                    .tools { grid-area: tools; background: #232323; align-items: center; padding-top: 10px; display: flex; flex-direction: column; }
                    .viewport { grid-area: viewport; background: #000; position: relative; border: 2px solid #333; min-height: 100px; }
                    .resizer { grid-area: resizer; background: #333; cursor: ns-resize; transition: background 0.2s; }
                    .resizer:hover { background: var(--accent); }
                    .logic { grid-area: logic; background: #1a1a1a; position: relative; border-top: 1px solid #111; overflow: hidden; }
                    .outliner { grid-area: outliner; }
                    .properties { grid-area: properties; }
                    .mining { grid-area: mining; background: #232323; }
                    #outliner-content, #properties-content, #mining-content { flex: 1; overflow-y: auto; }

                    /* Header Styles */
                    .menu-bar { display: flex; align-items: center; height: 32px; background: #111; border-bottom: 1px solid #222; font-size: 11px; z-index: 1000; width: 100%; box-sizing: border-box; }
                    .menu-item { padding: 0 10px; height: 100%; display: flex; align-items: center; cursor: pointer; position: relative; color: #aaa; }
                    .menu-item:hover, .menu-item.active { background: #222; color: #fff; }
                    .dropdown-menu { position: absolute; top: 100%; left: 0; min-width: 160px; background: rgba(30,30,30,0.95); backdrop-filter: blur(10px); border: 1px solid #444; border-radius: 4px; padding: 4px 0; box-shadow: 0 10px 25px rgba(0,0,0,0.5); z-index: 2000; display: flex; flex-direction: column; }
                    .dropdown-item { padding: 6px 12px; display: flex; justify-content: space-between; align-items: center; color: #ddd; white-space: nowrap; }
                    .dropdown-item:hover { background: var(--accent); color: #fff; }
                    .dropdown-shortcut { font-size: 9px; opacity: 0.5; margin-left: 12px; }
                    .dropdown-divider { height: 1px; background: #333; margin: 4px 0; }

                    /* Sidebar Styles */
                    .tool-btn { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; margin-bottom: 8px; border-radius: 4px; font-size: 16px; border: 1px solid transparent; transition: all 0.2s; }
                    .tool-btn:hover { background: #3d3d3d; }
                    .tool-btn.active { background: var(--accent); color: white; border-color: var(--accent-light); }
                    .sidebar-category { font-size: 8px; font-weight: 800; color: #555; margin: 12px 0 6px 0; text-transform: uppercase; width: 100%; text-align: center; }
                    .sidebar-hr { width: 30px; border: 0.5px solid #333; margin: 8px 0; }

                    /* Outliner & Properties Styles */
                    .tree-item { padding: 4px 12px; cursor: pointer; display: flex; align-items: center; }
                    .tree-item:hover { background: #353535; }
                    .tree-item.selected { background: #4b4b4b; color: var(--accent); }
                    .icon { margin-right: 8px; opacity: 0.6; }
                    .tree-indent { margin-left: 14px; border-left: 1px solid #333; }
                    .prop-row { padding: 8px; display: flex; border-bottom: 1px solid #333; }
                    .prop-label { width: 80px; color: #888; }
                    .prop-value { flex: 1; font-weight: bold; color: #ddd; }
                    input[type="number"], select { background: #181818; border: 1px solid #333; color: #ddd; font-size: 10px; padding: 2px 4px; border-radius: 2px; width: 100%; box-sizing: border-box; }
                    .prop-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; width: 100%; }
                    .section-title { font-size: 9px; text-transform: uppercase; color: #666; margin-top: 10px; padding: 0 8px; }

                    /* Logic Graph Styles */
                    .logic-canvas { width: 4000px; height: 4000px; background-image: radial-gradient(#333 1px, transparent 1px); background-size: 20px 20px; position: relative; }
                    .node-card { position: absolute; width: 160px; background: rgba(30,30,30,0.85); border: 1px solid #444; border-radius: 8px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.6); font-size: 10px; cursor: default; backdrop-filter: blur(12px); }
                    .node-header { padding: 8px 12px; font-weight: 700; cursor: move; color: #fff; display: flex; align-items: center; font-size: 11px; letter-spacing: 0.5px; }
                    .node-sensor { border-top: 1px solid #00ff8888; }
                    .node-controller { border-top: 1px solid rgba(255,255,255,0.1); }
                    .node-actuator { border-top: 1px solid #00d4ff88; }
                    .node-body { padding: 10px 12px; background: rgba(0,0,0,0.2); }
                    .pin { width: 12px; height: 12px; border-radius: 50%; background: #111; margin: 4px 0; position: relative; border: 2px solid #444; cursor: crosshair; transition: all 0.15s; }
                    .pin:hover { transform: scale(1.2); border-color: #fff; }
                    .pin-connected { border-width: 2px; }
                    .logic-brick { background: #333; border: 1px solid #444; margin: 4px; padding: 6px; border-radius: 4px; border-left: 3px solid var(--accent); position: relative; }
                    .delete-btn { position: absolute; right: 4px; top: 4px; cursor: pointer; opacity: 0.5; font-size: 10px; }
                    .delete-btn:hover { opacity: 1; color: #ff3366; }

                    /* Modal Styles */
                    .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; z-index: 9999; }
                    .modal-content { background: #232323; border: 1px solid #444; border-radius: 12px; width: 600px; max-height: 80vh; overflow-y: auto; box-shadow: 0 20px 50px rgba(0,0,0,0.5); padding: 24px; color: #ddd; }
                    .modal-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #333; padding-bottom: 12px; margin-bottom: 20px; }
                    .setting-card { background: #1a1a1a; padding: 12px; border-radius: 8px; margin-bottom: 12px; border-left: 3px solid #00d4ff; }
                    .setting-title { font-weight: bold; margin-bottom: 8px; font-size: 13px; color: #fff; }
                    .close-btn { cursor: pointer; opacity: 0.5; font-size: 20px; }
                    .close-btn:hover { opacity: 1; color: #ff3366; }

                    /* XR Glass Command Overlay */
                    .xrux-layer { grid-area: viewport; position: relative; pointer-events: none; z-index: 20; display: flex; align-items: flex-start; justify-content: flex-end; padding: 14px; box-sizing: border-box; min-height: 0; }
                    .xrux-launcher, .xrux-panel { pointer-events: auto; }
                    .xrux-layer.left-hand { justify-content: flex-start; }
                    .xrux-launcher { width: 44px; height: 44px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); background: rgba(14,20,28,0.74); color: #e8fbff; font-size: 12px; font-weight: 800; cursor: pointer; backdrop-filter: blur(18px); box-shadow: 0 16px 42px rgba(0,0,0,0.36); }
                    .xrux-panel { width: min(420px, calc(100vw - 390px)); max-width: 420px; max-height: calc(100% - 28px); display: flex; flex-direction: column; overflow: hidden; border-radius: 8px; border: 1px solid rgba(190,230,255,0.22); background: rgba(12,18,26,var(--xrux-opacity)); color: #e9f6ff; backdrop-filter: blur(22px) saturate(1.25); box-shadow: 0 20px 60px rgba(0,0,0,0.44); }
                    .xrux-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px; border-bottom: 1px solid rgba(255,255,255,0.09); }
                    .xrux-title { font-size: 14px; font-weight: 800; color: #ffffff; }
                    .xrux-subtitle { margin-top: 2px; font-size: 10px; color: rgba(233,246,255,0.62); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 240px; }
                    .xrux-header-actions, .xrux-actions, .xrux-item-actions { display: flex; gap: 8px; align-items: center; }
                    .xrux-icon-btn, .xrux-soft-btn, .xrux-tab, .xrux-row { border: 1px solid rgba(255,255,255,0.13); background: rgba(255,255,255,0.06); color: #e9f6ff; cursor: pointer; border-radius: 7px; }
                    .xrux-icon-btn { min-width: 34px; height: 28px; font-size: 9px; font-weight: 800; }
                    .xrux-tabs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; padding: 10px 12px 0; }
                    .xrux-tab { height: 30px; font-size: 10px; font-weight: 700; }
                    .xrux-tab.active, .xrux-row.selected { background: rgba(34,211,238,0.16); border-color: rgba(34,211,238,0.5); color: #bff7ff; }
                    .xrux-body { min-height: 0; overflow-y: auto; padding: 12px; }
                    .xrux-section { display: flex; flex-direction: column; gap: 10px; }
                    .xrux-section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 10px; font-weight: 800; color: rgba(233,246,255,0.75); text-transform: uppercase; }
                    .xrux-list { display: flex; flex-direction: column; gap: 6px; }
                    .xrux-list.compact { max-height: 135px; overflow-y: auto; }
                    .xrux-row { min-height: 34px; padding: 0 10px; display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 11px; text-align: left; }
                    .xrux-row span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                    .xrux-row span:last-child { color: rgba(233,246,255,0.54); font-size: 9px; flex: none; }
                    .xrux-soft-btn { min-height: 28px; padding: 0 10px; font-size: 10px; font-weight: 700; }
                    .xrux-soft-btn:hover, .xrux-tab:hover, .xrux-row:hover, .xrux-icon-btn:hover { border-color: rgba(255,255,255,0.32); background: rgba(255,255,255,0.11); }
                    .xrux-soft-btn.danger { color: #ffc2cc; border-color: rgba(255,92,122,0.28); }
                    .xrux-empty { padding: 22px 12px; border: 1px dashed rgba(255,255,255,0.12); border-radius: 8px; color: rgba(233,246,255,0.48); text-align: center; font-size: 11px; }
                    .xrux-inventory { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
                    .xrux-inventory.compact { grid-template-columns: 1fr; }
                    .xrux-item { min-width: 0; border-radius: 8px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.055); padding: 10px; }
                    .xrux-item.equipped { border-color: rgba(45,212,191,0.55); background: rgba(20,184,166,0.11); }
                    .xrux-item-top, .xrux-item-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
                    .xrux-item-top strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
                    .xrux-item-top span, .xrux-item-meta { color: rgba(233,246,255,0.58); font-size: 9px; }
                    .xrux-item-meta { margin: 7px 0 9px; }
                    .xrux-field, .xrux-toggle { display: flex; align-items: center; justify-content: space-between; gap: 14px; min-height: 36px; padding: 8px 10px; border-radius: 8px; background: rgba(255,255,255,0.055); border: 1px solid rgba(255,255,255,0.09); color: rgba(233,246,255,0.76); font-size: 11px; }
                    .xrux-field select, .xrux-field input[type="range"] { max-width: 170px; }
                    .xrux-toggle { justify-content: flex-start; }
                    @media (max-width: 900px) { .xrux-panel { width: min(360px, calc(100vw - 86px)); } }
                `}</style>

                {Header({ 
                    activeMenu: this.activeMenu,
                    isSpacetimeOnline: (this.engine?.spacetime as any)?.isOnline || false,
                    onMenuToggle: (menu: any) => { this.activeMenu = menu; this.render(); },
                    onSettingsOpen: () => { this.isSettingsOpen = true; this.render(); },
                    renderDropdown: (menu: string) => this.renderDropdown(menu)
                })}

                <div class="panel tools" id="tool-sidebar">
                    {ToolSidebar({ 
                        engine: this.engine,
                        gizmoMode: this.gizmoMode,
                        selectedObject: this.selectedObject,
                        onSetGizmoMode: (mode: any) => this.setGizmoMode(mode),
                        onRender: () => this.render()
                    })}
                </div>

                <div class="panel viewport" 
                     id="viewport-container"
                     style="flex: 1; min-height: 0; position: relative;"
                     onDragOver={(e: any) => e.preventDefault()}
                     onDrop={(e: any) => {
                         e.preventDefault();
                         if (e.dataTransfer.files.length > 0) {
                             this.engine?.handleFilesDrop(e.dataTransfer.files);
                         }
                     }}
                >
                </div>

                {XRUXOverlay({
                    engine: this.engine,
                    selectedObject: this.selectedObject,
                    onRender: () => this.render(),
                    onOpenSettings: () => { this.isSettingsOpen = true; this.render(); }
                })}

                <div class="resizer" onMouseDown={() => { this.isResizingLogic = true; }}></div>

                <div class="panel logic" id="logic-editor">
                    <div style="display: flex; background: #222; border-bottom: 1px solid #111;">
                        <div class={`menu-item ${this.activeBottomTab === 'logic' ? 'active' : ''}`} 
                             style="height: 24px; font-size: 9px;"
                             onClick={() => this.setBottomTab('logic')}>Logic Bricks</div>
                        <div class={`menu-item ${this.activeBottomTab === 'shader' ? 'active' : ''}`} 
                             style="height: 24px; font-size: 9px;"
                             onClick={() => this.setBottomTab('shader')}>Shader Graph</div>
                        <div class={`menu-item ${this.activeBottomTab === 'audio' ? 'active' : ''}`} 
                             style="height: 24px; font-size: 9px;"
                             onClick={() => this.setBottomTab('audio')}>Audio Tools</div>
                         <div class={`menu-item ${this.activeBottomTab === 'network' ? 'active' : ''}`} 
                              style="height: 24px; font-size: 9px;"
                              onClick={() => this.setBottomTab('network')}>Network Scene</div>
                         <div class={`menu-item ${this.activeBottomTab === 'optimization' ? 'active' : ''}`} 
                              style="height: 24px; font-size: 9px;"
                              onClick={() => this.setBottomTab('optimization')}>Optimization</div>
                         <div class={`menu-item ${this.activeBottomTab === 'inventory' ? 'active' : ''}`} 
                              style="height: 24px; font-size: 9px;"
                              onClick={() => this.setBottomTab('inventory')}>Inventory</div>
                         <div class={`menu-item ${this.activeBottomTab === 'robotics' ? 'active' : ''}`} 
                              style="height: 24px; font-size: 9px;"
                              onClick={() => this.setBottomTab('robotics')}>Robotics</div>
                         <div class={`menu-item ${this.activeBottomTab === 'assetBank' ? 'active' : ''}`} 
                             style="height: 24px; font-size: 9px;"
                             onClick={() => this.setBottomTab('assetBank')}>Item Bank</div>
                        <div class={`menu-item ${this.activeBottomTab === 'haptics' ? 'active' : ''}`} 
                             style="height: 24px; font-size: 9px;"
                             onClick={() => this.setBottomTab('haptics')}>Haptics</div>
                        <div class={`menu-item ${this.activeBottomTab === 'zk' ? 'active' : ''}`} 
                             style="height: 24px; font-size: 9px; color: #00ff88;"
                             onClick={() => this.setBottomTab('zk')}>ZK Privacy</div>
                        <div class={`menu-item ${this.activeBottomTab === 'ceremony' ? 'active' : ''}`} 
                             style="height: 24px; font-size: 9px; color: #b366ff;"
                             onClick={() => this.setBottomTab('ceremony')}>Ceremonies</div>
                        <div class={`menu-item ${this.activeBottomTab === 'qaxe' ? 'active' : ''}`} 
                             style="height: 24px; font-size: 9px; color: #ff7a1a;"
                             onClick={() => this.setBottomTab('qaxe')}>QuaiAxe</div>
                        <div class={`menu-item ${this.activeBottomTab === 'arcade' ? 'active' : ''}`} 
                             style="height: 24px; font-size: 9px; color: #ff3333;"
                             onClick={() => this.setBottomTab('arcade')}>🕹️ Arcade</div>
                        <div class={`menu-item ${this.activeBottomTab === 'trading' ? 'active' : ''}`} 
                             style="height: 24px; font-size: 9px; color: #3b82f6;"
                             onClick={() => this.setBottomTab('trading')}>Trading Agents</div>
                     </div>
                    
                    {this.activeBottomTab === 'logic' && LogicEditor({ 
                        selectedObject: this.selectedObject,
                        engine: this.engine,
                        onRender: () => this.render(),
                        renderWires: () => this.renderWires(),
                        renderNode: (node: any, type: string) => this.renderNode(node, type)
                    })}
                    {this.activeBottomTab === 'shader' && (ShaderEditor ? ShaderEditor({
                        selectedObject: this.selectedObject,
                        engine: this.engine,
                        onRender: () => this.render(),
                        renderWires: () => this.renderWires(),
                        renderNode: (node: any, type: string) => this.renderNode(node, type)
                    }) : this.renderLazyPanel())}
                    {this.activeBottomTab === 'audio' && (AudioPanel ? AudioPanel({ engine: this.engine }) : this.renderLazyPanel())}
                    {this.activeBottomTab === 'network' && (NetworkPanel ? NetworkPanel({ 
                        engine: this.engine,
                        onRender: () => this.render()
                    }) : this.renderLazyPanel())}
                    {this.activeBottomTab === 'optimization' && (OptimizationPanel ? OptimizationPanel({ 
                        engine: this.engine,
                        onRender: () => this.render()
                    }) : this.renderLazyPanel())}
                    {this.activeBottomTab === 'inventory' && (InventoryPanel ? InventoryPanel({ 
                        selectedObject: this.selectedObject, 
                        onRender: () => this.render()
                    }) : this.renderLazyPanel())}
                    {this.activeBottomTab === 'robotics' && (RoboticsPanel ? RoboticsPanel({ engine: this.engine }) : this.renderLazyPanel())}
                    {this.activeBottomTab === 'assetBank' && (AssetBank ? AssetBank({ 
                        engine: this.engine,
                        onRender: () => this.render()
                    }) : this.renderLazyPanel())}
                    {this.activeBottomTab === 'trading' && (TradingPanel ? TradingPanel({ 
                        engine: this.engine,
                        onRender: () => this.render()
                    }) : this.renderLazyPanel())}
                    {this.activeBottomTab === 'zk' && (ZKPanel ? ZKPanel({ 
                        engine: this.engine,
                        onRender: () => this.render()
                    }) : this.renderLazyPanel())}
                    {this.activeBottomTab === 'ceremony' && (CeremonyPanel ? CeremonyPanel({ 
                        engine: this.engine,
                        onRender: () => this.render()
                    }) : this.renderLazyPanel())}
                    {this.activeBottomTab === 'qaxe' && (QuaiAxePanel ? QuaiAxePanel({ 
                        engine: this.engine,
                        onRender: () => this.render()
                    }) : this.renderLazyPanel())}
                    {this.activeBottomTab === 'arcade' && (RhythmArcadePanel ? RhythmArcadePanel({ 
                        engine: this.engine,
                        onRender: () => this.render()
                    }) : this.renderLazyPanel())}


                </div>

                <div class="panel outliner">
                    <div class="panel-header">Outliner</div>
                    <div id="outliner-content">
                        {Outliner({ 
                            objects: this.engine?.objects || [],
                            selectedObjectId: this.selectedObject?.id,
                            selectedSubItem: (this.engine as any)?.selectedSubItem,
                            onSelect: (id: string) => this.engine?.selectObject(id),
                            onSelectSubItem: (pId: string, type: any, id: string) => (this.engine as any)?.selectSubItem(pId, type, id),
                            onDelete: (id: string, name: string) => { if(confirm(`Delete ${name}?`)) this.engine?.removeObject(id); }
                        })}
                    </div>
                </div>

                <div class="panel properties">
                    <div class="panel-header">Properties</div>
                    <div id="properties-content">
                        {Properties({ 
                            selectedObject: this.selectedObject,
                            selectedSubItem: (this.engine as any)?.selectedSubItem,
                            engine: this.engine,
                            selectedShaderNode: this.selectedShaderNode,
                            onRender: () => this.render()
                        })}
                    </div>
                </div>

                <div class="panel mining">
                    <div class="panel-header">
                        Mining Telemetry Panel
                        <span id="mining-status" style={`color: ${this.miningStats.status === 'CONNECTED' ? '#00ff88' : '#ff3366'}`}>{this.miningStats.status}</span>
                    </div>
                    <div id="mining-content">
                        {MiningPanel({ engine: this.engine })}
                    </div>
                </div>

                {SettingsModal({ 
                    isOpen: this.isSettingsOpen, 
                    onClose: () => { this.isSettingsOpen = false; this.render(); },
                    onRender: () => this.render(),
                    engine: this.engine
                })}

                {HapticsPanel && HapticsPanel({
                    isOpen: this.isHapticsOpen,
                    onClose: () => { this.isHapticsOpen = false; this.render(); },
                    engine: this.engine,
                    onRender: () => this.render()
                })}
                
                {ProjectModal && ProjectModal({ 
                    isOpen: this.isProjectModalOpen, 
                    onClose: () => { this.isProjectModalOpen = false; this.render(); },
                    engine: this.engine,
                    onRender: () => this.render()
                })}

                {DocumentationModal && DocumentationModal({ 
                    isOpen: this.isHelpOpen, 
                    onClose: () => { this.isHelpOpen = false; this.render(); } 
                })}

                {AboutModal && AboutModal({ 
                    isOpen: this.isAboutOpen, 
                    onClose: () => { this.isAboutOpen = false; this.render(); } 
                })}

                {TutorialOverlay({ 
                    engine: this.engine,
                    onRender: () => this.render()
                })}
            </div>
        ) as any);
        
        // Ensure selected item is visible in outliner
        setTimeout(() => {
            const selectedItem = this.shadowRoot?.querySelector('.tree-item.selected');
            if (selectedItem) {
                selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }, 50);
    }

    private renderDropdown(menu: string) {
        const items: any = {
            'File': [
                { label: 'New Project', shortcut: 'Ctrl+N', action: () => { if(confirm("Discard all changes?")) { this.engine?.resetScene(); if(this.engine) this.engine.activeProjectId = null; } } },
                { type: 'divider' },
                { label: 'Save Project', shortcut: 'Ctrl+S', action: () => this.saveProject() },
                { label: 'Save Project As...', action: () => {
                    const name = prompt("Enter New Name:");
                    if (name && this.engine) {
                        const data = this.engine.serialize();
                        this.engine.activeProjectId = this.engine.projects.save(name, data);
                        alert(`Project saved as ${name}`);
                    }
                }},
                { label: 'Open Project...', action: () => this.openProjectModal() },
                { type: 'divider' },
                { label: 'Import JSON', action: () => this.importProject() },
                { label: 'Export JSON', action: () => this.exportProject() },
                { label: 'Export GLTF' },
                { type: 'divider' },
                { label: 'Spacetime: Create Global World', action: () => {
                    const name = prompt("Enter World Name:");
                    if (name) this.engine?.spacetime.createLobby(name, true);
                }},
                { label: 'Spacetime: Join Private World', action: () => {
                    const id = prompt("Enter World ID:");
                    if (id) this.engine?.spacetime.joinLobby(id);
                }},
                { label: 'Spacetime: Share World ID', action: () => {
                    const id = this.engine?.spacetime.activeLobbyId;
                    if (id) prompt("Copy World ID:", id);
                    else alert("Not connected to a world.");
                }}
            ],
            'Edit': [
                { label: 'Undo', shortcut: 'Ctrl+Z', action: () => this.engine?.history.undo() },
                { label: 'Redo', shortcut: 'Ctrl+Y', action: () => this.engine?.history.redo() },
                { type: 'divider' },
                { label: 'Duplicate', shortcut: 'Ctrl+D', action: () => { if (this.selectedObject) this.engine?.duplicateObject(this.selectedObject.id); } },
                { label: 'Delete', shortcut: 'Del', action: () => { if (this.selectedObject) this.engine?.removeObject(this.selectedObject.id); } }
            ],
            'Add': [
                { label: 'Primitive: Cube', action: () => this.engine?.createCube() },
                { label: 'Primitive: Sphere', action: () => this.engine?.createSphere() },
                { label: 'Point Light', action: () => this.engine?.createLight() },
                { label: 'Spatial Audio Source', action: () => {
                    const url = prompt("Enter Audio URL:");
                    if (url) this.engine?.createSpatialAudio(url);
                }},
                { type: 'divider' },
                { label: 'Actor: Autonomous NPC', action: () => this.engine?.createNPC() },
                { label: 'Actor: Tactical Hero (Avatar)', action: () => this.engine?.createAdvancedActor() },
                { label: 'Combat: Turret', action: () => this.engine?.createWeaponUnit() },
                { label: 'Vehicle: Chassis', action: () => this.engine?.createVehicleBase() },
                { type: 'divider' },
                { label: 'Pickup: Ammo Box', action: () => this.engine?.createAmmoPickup() },
                { label: 'Pickup: Medkit', action: () => this.engine?.createHealthPickup() },
                { type: 'divider' },
                { label: 'Robotic: Unitree B1', action: () => this.engine?.createUnitreeBot() },
                { type: 'divider' },
                { label: 'System: Spawn Point', action: () => this.engine?.createSpawnPoint() },
                { label: 'System: Bolt Tablet (Outliner)', action: () => this.engine?.spawnBoltTabletOutliner() },
                { label: 'Exchange: Swap Scale', action: () => {
                    if (this.engine) createSwapScaleTemplate(this.engine);
                }},
                { type: 'divider' },
                { label: '🔮 Ceremony Arena (Tutorial World)', action: async () => {
                    if (!this.engine) return;
                    await this.engine.createCeremonyArenaTemplate();
                    this.render();
                }},
                { label: '🔥 QuaiAxe Furnace (Tutorial World)', action: async () => {
                    if (!this.engine) return;
                    await this.engine.createQuaiAxeFurnaceTemplate();
                    this.setBottomTab('qaxe');
                    this.render();
                }},
                { label: '🕹️ Rhythm Arcade (DeFi Mini-Games)', action: async () => {
                    if (!this.engine) return;
                    await this.engine.createRhythmArcadeTemplate();
                    this.setBottomTab('arcade');
                    this.render();
                }},
                { label: '🥽 XR Mini Game Arcade (Quai DeFi)', action: async () => {
                    if (!this.engine) return;
                    await this.engine.createXRArcadeTemplate();
                    this.setBottomTab('arcade');
                    this.render();
                }},
                { label: '🎓 Restart Ceremony Course', action: () => {
                    this.engine?.tutorial?.startCurriculum('zk-ceremony', ZK_CEREMONY_CURRICULUM, true);
                    this.render();
                }},
                { label: '🎓 Restart QuaiAxe Course', action: () => {
                    this.engine?.tutorial?.startCurriculum('quaiaxe', QUAIAXE_CURRICULUM, true);
                    this.render();
                }}
            ],
            'Selection': [
                { label: 'Select All', shortcut: 'Ctrl+A' },
                { label: 'Deselect', shortcut: 'Alt+A' }
            ],
            'Help': [
                { label: 'Documentation (F12)', action: () => this.openDocumentation() },
                { label: 'About B3JS', action: () => this.openAbout() }
            ],
            'Scene': [
                ...Array.from(this.engine?.sceneRegistry.keys() || []).map(name => ({
                    label: (this.engine?.activeSceneName === name ? '✓ ' : '  ') + name,
                    action: () => this.engine?.switchScene(name as string)
                })),
                { type: 'divider' },
                { label: 'New Scene...', action: () => {
                    const name = prompt("Enter Scene Name:");
                    if (name) this.engine?.createNewScene(name);
                }},
                { label: 'Delete Current Scene', action: () => {
                    if (confirm(`Delete ${this.engine?.activeSceneName}?`)) {
                        this.engine?.deleteScene(this.engine?.activeSceneName);
                    }
                }},
                { type: 'divider' },
                { label: 'Scene Settings', action: () => { this.isSettingsOpen = true; } },
                { label: 'Reset Scene', action: () => { if (confirm("Reset current scene?")) this.engine?.resetScene(); } },
                { label: 'Stats: Deterministic Physics' }
            ]
        };

        return (items[menu] || []).map((item: any) => {
            if (item.type === 'divider') return <div class="dropdown-divider"></div>;
            return (
                <div class="dropdown-item" onClick={() => { if (item.action) item.action(); this.render(); }}>
                    <span>{item.label}</span>
                    {item.shortcut && <span class="dropdown-shortcut">{item.shortcut}</span>}
                </div>
            );
        });
    }
}

customElements.define('b3-editor', B3Editor);
