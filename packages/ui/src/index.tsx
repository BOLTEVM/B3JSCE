import * as webjsx from 'webjsx';
import * as THREE from 'three';
import { B3Engine, B3Object, Sensor, Controller, Actuator, KeyboardSensor, AndController, MotionActuator, PIN_COLORS } from '@b3js/engine';
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
import { Viewport } from './components/Viewport';
import { ShaderEditor } from './components/ShaderEditor';
import { AudioPanel } from './components/AudioPanel';
import { NetworkPanel } from './components/NetworkPanel';
import { OptimizationPanel } from './components/OptimizationPanel';
import { InventoryPanel } from './components/InventoryPanel';
import { ProjectModal } from './components/ProjectModal';
import { RoboticsPanel } from './components/RoboticsPanel';

/**
 * Industry-Standard B3JS Engine Editor
 */
export class B3Editor extends HTMLElement {
    private engine: B3Engine | null = null;
    private selectedObject: B3Object | null = null;
    private miningStats = { hashrate: '0 H/s', shares: '0', status: 'OFFLINE' };
    private gizmoMode: 'translate' | 'rotate' | 'scale' = 'translate';
    private isSettingsOpen: boolean = false;
    private isProjectModalOpen: boolean = false;
    private activeMenu: string | null = null;
    private logicHeight: number = 250;
    private isDraggingNode: string | null = null;
    private isDraggingWire: boolean = false;
    private wireSource: { node: any, type: string, side: 'in' | 'out', pinName?: string } | null = null;
    private wireMousePos: { x: number, y: number } = { x: 0, y: 0 };
    private selectedShaderNode: any | null = null;
    private isResizingLogic: boolean = false;
    private activeBottomTab: 'logic' | 'shader' | 'audio' | 'network' | 'optimization' | 'inventory' | 'robotics' = 'logic';
    private miningEventHandlers: Partial<Record<'fractal' | 'quai' | 'qrl', () => void>> = {};

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

        // Initialize SpacetimeDB connection for real-time multiplayer sync
        this.engine.spacetime.connect('ws://localhost:3000', 'b3js_sync');

        this.render();
    }

    private renderNode(node: any, type: string) {
        let title = node.constructor.name;
        if (title === 'KeyboardSensor') title = (node as any).targetKey;
        if (title === 'ShaderNode') title = (node as any).getTypeName();

        const onPinMouseDown = (e: MouseEvent, side: 'in' | 'out', pinName?: string) => {
            e.stopPropagation();
            
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
            if (!this.isDraggingWire || !this.wireSource) return;
            const src = this.wireSource;
            
            // VALDIATION & CONNECTION
            if (src.side === 'out' && side === 'in') {
                if (src.type === 'sensor' && type === 'controller') node.addSensor(src.node);
                if (src.type === 'controller' && type === 'actuator') src.node.addActuator(node);
                
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
                 style={`left: ${node.guiMetadata.x}px; top: ${node.guiMetadata.y}px;`}
                 onClick={(e: any) => {
                     if (type === 'shader') {
                         e.stopPropagation();
                         this.selectedShaderNode = node;
                         this.render();
                     }
                 }}>
                <div class={`node-header node-${type}`} onMouseDown={() => this.isDraggingNode = node.id}>
                    {title}
                </div>
                <div class="node-body">
                    {/* Logic Node Pins (V1 Fallback & V2 Typed) */}
                    {(type === 'sensor' || type === 'controller' || type === 'actuator') && node.inputs && node.inputs.length === 0 && node.outputs && node.outputs.length === 0 && (
                        <>
                            {type === 'sensor' && <div class="pin pin-connected" onMouseDown={(e: any) => onPinMouseDown(e, 'out')} style="margin-left: auto;"></div>}
                            {type === 'controller' && (
                                <div style="display: flex; justify-content: space-between;">
                                    <div class="pin pin-connected" onMouseDown={(e: any) => onPinMouseDown(e, 'in')} onMouseUp={(e: any) => onPinMouseUp(e, 'in')}></div>
                                    <div class="pin pin-connected" onMouseDown={(e: any) => onPinMouseDown(e, 'out')}></div>
                                </div>
                            )}
                            {type === 'actuator' && <div class="pin pin-connected" onMouseDown={(e: any) => onPinMouseDown(e, 'in')} onMouseUp={(e: any) => onPinMouseUp(e, 'in')}></div>}
                        </>
                    )}

                    {/* V2 Logic Node Pins */}
                    {(type === 'sensor' || type === 'controller' || type === 'actuator') && (node.inputs.length > 0 || node.outputs.length > 0) && (
                        <div style="display: flex; justify-content: space-between; margin-top: 5px;">
                            <div style="display: flex; flex-direction: column; gap: 6px;">
                                {node.inputs.map((p: any) => (
                                    <div style="display: flex; align-items: center; gap: 4px;">
                                        <div class={`pin ${p.connectedTo?.length > 0 ? 'pin-connected' : ''}`} 
                                             style={`background: ${p.connectedTo?.length > 0 ? (PIN_COLORS as any)[p.dataType] || '#888' : '#333'}; border-color: ${(PIN_COLORS as any)[p.dataType] || '#888'};`}
                                             onMouseDown={(e: any) => onPinMouseDown(e, 'in', p.id)}
                                             onMouseUp={(e: any) => onPinMouseUp(e, 'in', p.id)}
                                             title={p.dataType}></div>
                                        <span style="font-size: 9px; color: #aaa;">{p.name} {p.dataType === 'exec' ? '►' : ''}</span>
                                    </div>
                                ))}
                            </div>
                            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 6px;">
                                {node.outputs.map((p: any) => (
                                    <div style="display: flex; align-items: center; gap: 4px;">
                                        <span style="font-size: 9px; color: #aaa;">{p.dataType === 'exec' ? '►' : ''} {p.name}</span>
                                        <div class={`pin ${p.connectedTo?.length > 0 ? 'pin-connected' : ''}`}
                                             style={`background: ${p.connectedTo?.length > 0 ? (PIN_COLORS as any)[p.dataType] || '#888' : '#333'}; border-color: ${(PIN_COLORS as any)[p.dataType] || '#888'};`}
                                             onMouseDown={(e: any) => onPinMouseDown(e, 'out', p.id)}
                                             title={p.dataType}></div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Shader Node Pins */}
                    {type === 'shader' && (
                        <div style="display: flex; justify-content: space-between;">
                            <div style="display: flex; flex-direction: column; gap: 4px;">
                                {node.getInputPins().map((p: any) => (
                                    <div style="display: flex; align-items: center; gap: 4px;">
                                        <div class={`pin ${node.inputs.has(p.name) ? 'pin-connected' : ''}`} 
                                             onMouseDown={(e: any) => onPinMouseDown(e, 'in', p.name)}
                                             onMouseUp={(e: any) => onPinMouseUp(e, 'in', p.name)}
                                             title={p.type}></div>
                                        <span style="font-size: 8px; color: #888;">{p.name}</span>
                                    </div>
                                ))}
                            </div>
                            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                                {node.getOutputPins().map((p: any) => (
                                    <div style="display: flex; align-items: center; gap: 4px;">
                                        <span style="font-size: 8px; color: #888;">{p.name}</span>
                                        <div class="pin pin-connected" 
                                             onMouseDown={(e: any) => onPinMouseDown(e, 'out', p.name)}
                                             title={p.type}></div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    private drawBezier(x1: number, y1: number, x2: number, y2: number, color = "#e68523", opacity = "0.6") {
        const cp1x = x1 + (x2 - x1) / 2;
        const cp2x = x1 + (x2 - x1) / 2;
        return <path d={`M ${x1} ${y1} C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2}`} stroke={color} stroke-width="2" fill="none" opacity={opacity} />;
    }

    private renderWires() {
        if (!this.selectedObject) return null;
        const paths: any[] = [];

        if (this.activeBottomTab === 'logic') {
            const container = document.getElementById('logic-canvas-container');
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
                    paths.push(this.drawBezier(s.guiMetadata.x + 120, s.guiMetadata.y + 20, c.guiMetadata.x, c.guiMetadata.y + 20, wireColorMode === 'custom' ? wireCustomColor : "#00ff88", wireOpacity));
                });
                c.actuators.forEach((a: any) => {
                    paths.push(this.drawBezier(c.guiMetadata.x + 120, c.guiMetadata.y + 20, a.guiMetadata.x, a.guiMetadata.y + 20, wireColorMode === 'custom' ? wireCustomColor : "#00d4ff", wireOpacity));
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
                                const x1 = source.guiMetadata.x + 140; // width
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
                const x1 = isOut ? src.x + 120 : src.x;
                const y1 = src.y + 70;
                
                const scrollX = container?.scrollLeft || 0;
                const scrollY = container?.scrollTop || 0;
                const mx = this.wireMousePos.x - rect.left + scrollX;
                const my = this.wireMousePos.y - rect.top + scrollY;
                
                paths.push(this.drawBezier(x1, y1, mx, my, "#e68523", "0.4"));
            }
        } else if (this.activeBottomTab === 'shader') {
            const container = document.getElementById('shader-canvas-container');
            const rect = container?.getBoundingClientRect();

            this.selectedObject.materialNodes.forEach(target => {
                target.inputs.forEach((input, inputName) => {
                    const source = this.selectedObject!.materialNodes.find((n: any) => n.id === input.nodeId);
                    if (source) {
                        // Calculate pin indices for vertical offset
                        const outPins = source.getOutputPins();
                        const outIdx = outPins.findIndex((p: any) => p.name === input.outputName);
                        const inPins = target.getInputPins();
                        const inIdx = inPins.findIndex((p: any) => p.name === inputName);

                        const x1 = source.guiMetadata.x + 120;
                        const y1 = source.guiMetadata.y + 45 + (outIdx * 15);
                        const x2 = target.guiMetadata.x;
                        const y2 = target.guiMetadata.y + 45 + (inIdx * 15);
                        
                        paths.push(this.drawBezier(x1, y1, x2, y2, "#4a9eff", "0.6"));
                    }
                });
            });

            // ACTIVE DRAG WIRE (Shader)
            if (this.isDraggingWire && this.wireSource && rect) {
                const src = this.wireSource.node.guiMetadata;
                const isOut = this.wireSource.side === 'out';
                
                // Offset calculation based on pin index
                let pinOffset = 0;
                if (this.wireSource.pinName) {
                    const pins = isOut ? this.wireSource.node.getOutputPins() : this.wireSource.node.getInputPins();
                    const idx = pins.findIndex((p: any) => p.name === this.wireSource?.pinName);
                    pinOffset = Math.max(0, idx) * 15;
                }

                const x1 = isOut ? src.x + 120 : src.x;
                const y1 = src.y + 45 + pinOffset;
                
                const scrollX = container?.scrollLeft || 0;
                const scrollY = container?.scrollTop || 0;
                const mx = this.wireMousePos.x - rect.left + scrollX;
                const my = this.wireMousePos.y - rect.top + scrollY;
                
                paths.push(this.drawBezier(x1, y1, mx, my, "#4a9eff", "0.4"));
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

    private handleKeyDown = (e: KeyboardEvent) => {
        if (!this.engine) return;

        const isCtrl = e.ctrlKey || e.metaKey;

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
            if (document.activeElement?.tagName !== 'INPUT' && this.selectedObject) {
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
                    .node-card { position: absolute; width: 140px; background: #222; border: 1px solid #444; border-radius: 4px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.5); font-size: 10px; cursor: default; }
                    .node-header { padding: 4px 8px; font-weight: bold; cursor: move; color: #fff; }
                    .node-sensor { border-top: 2px solid #00ff88; }
                    .node-controller { border-top: 2px solid var(--accent); }
                    .node-actuator { border-top: 2px solid #00d4ff; }
                    .node-body { padding: 8px; }
                    .pin { width: 10px; height: 10px; border-radius: 50%; background: #444; margin: 4px 0; position: relative; border: 1px solid #666; }
                    .pin-connected { background: var(--accent); border-color: #fff; }
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

                <div class="resizer" onMouseDown={() => { this.isResizingLogic = true; }}></div>

                <div class="panel logic" id="logic-editor">
                    <div style="display: flex; background: #222; border-bottom: 1px solid #111;">
                        <div class={`menu-item ${this.activeBottomTab === 'logic' ? 'active' : ''}`} 
                             style="height: 24px; font-size: 9px;"
                             onClick={() => { this.activeBottomTab = 'logic'; this.render(); }}>Logic Bricks</div>
                        <div class={`menu-item ${this.activeBottomTab === 'shader' ? 'active' : ''}`} 
                             style="height: 24px; font-size: 9px;"
                             onClick={() => { this.activeBottomTab = 'shader'; this.render(); }}>Shader Graph</div>
                        <div class={`menu-item ${this.activeBottomTab === 'audio' ? 'active' : ''}`} 
                             style="height: 24px; font-size: 9px;"
                             onClick={() => { this.activeBottomTab = 'audio'; this.render(); }}>Audio Tools</div>
                         <div class={`menu-item ${this.activeBottomTab === 'network' ? 'active' : ''}`} 
                              style="height: 24px; font-size: 9px;"
                              onClick={() => { this.activeBottomTab = 'network'; this.render(); }}>Network Scene</div>
                         <div class={`menu-item ${this.activeBottomTab === 'optimization' ? 'active' : ''}`} 
                              style="height: 24px; font-size: 9px;"
                              onClick={() => { this.activeBottomTab = 'optimization'; this.render(); }}>Optimization</div>
                         <div class={`menu-item ${this.activeBottomTab === 'inventory' ? 'active' : ''}`} 
                              style="height: 24px; font-size: 9px;"
                              onClick={() => { this.activeBottomTab = 'inventory'; this.render(); }}>Inventory</div>
                         <div class={`menu-item ${this.activeBottomTab === 'robotics' ? 'active' : ''}`} 
                              style="height: 24px; font-size: 9px;"
                              onClick={() => { this.activeBottomTab = 'robotics'; this.render(); }}>Robotics</div>
                     </div>
                    
                    {this.activeBottomTab === 'logic' && LogicEditor({ 
                        selectedObject: this.selectedObject,
                        engine: this.engine,
                        onRender: () => this.render(),
                        renderWires: () => this.renderWires(),
                        renderNode: (node: any, type: string) => this.renderNode(node, type)
                    })}
                    {this.activeBottomTab === 'shader' && ShaderEditor({
                        selectedObject: this.selectedObject,
                        engine: this.engine,
                        onRender: () => this.render(),
                        renderWires: () => this.renderWires(),
                        renderNode: (node: any, type: string) => this.renderNode(node, type)
                    })}
                    {this.activeBottomTab === 'audio' && AudioPanel({ engine: this.engine })}
                    {this.activeBottomTab === 'network' && NetworkPanel({ 
                        engine: this.engine,
                        onRender: () => this.render()
                    })}
                    {this.activeBottomTab === 'optimization' && OptimizationPanel({ 
                        engine: this.engine,
                        onRender: () => this.render()
                    })}
                    {this.activeBottomTab === 'inventory' && (
                        <InventoryPanel 
                            selectedObject={this.selectedObject} 
                            onRender={() => this.render()}
                        />
                    )}
                    {this.activeBottomTab === 'robotics' && <RoboticsPanel engine={this.engine} />}
                </div>

                <div class="panel outliner">
                    <div class="panel-header">Outliner</div>
                    <div id="outliner-content">
                        {Outliner({ 
                            objects: this.engine?.objects || [],
                            selectedObjectId: this.selectedObject?.id,
                            onSelect: (id: string) => this.engine?.selectObject(id),
                            onDelete: (id: string, name: string) => { if(confirm(`Delete ${name}?`)) this.engine?.removeObject(id); }
                        })}
                    </div>
                </div>

                <div class="panel properties">
                    <div class="panel-header">Properties</div>
                    <div id="properties-content">
                        {Properties({ 
                            selectedObject: this.selectedObject,
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

                {SettingsModal({ isOpen: this.isSettingsOpen, onClose: () => { this.isSettingsOpen = false; this.render(); } })}
                {ProjectModal({ 
                    isOpen: this.isProjectModalOpen, 
                    onClose: () => { this.isProjectModalOpen = false; this.render(); },
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
                { label: 'Open Project...', action: () => { this.isProjectModalOpen = true; } },
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
                { label: 'System: Spawn Point', action: () => this.engine?.createSpawnPoint() }
            ],
            'Selection': [
                { label: 'Select All', shortcut: 'Ctrl+A' },
                { label: 'Deselect', shortcut: 'Alt+A' }
            ],
            'Help': [
                { label: 'Documentation' },
                { label: 'About B3JS' }
            ],
            'Scene': [
                ...Array.from(this.engine?.sceneRegistry.keys() || []).map(name => ({
                    label: (this.engine?.activeSceneName === name ? '✓ ' : '  ') + name,
                    action: () => this.engine?.switchScene(name)
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
