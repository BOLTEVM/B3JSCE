import * as webjsx from 'webjsx';
import { 
    Sensor, Controller, Actuator,
    OnStartNode, OnTickNode, OnKeyNode, OnCollisionNode, OnTimerNode, OnInteractNode,
    BranchNode, SequenceNode, ForLoopNode, DelayNode, GateNode,
    GetVariableNode, SetVariableNode, MathOpNode, CompareNode, BoolLogicNode, GetPropertyNode, SetPropertyNode,
    MoveToNode, RotateNode, PlaySoundNode, SpawnObjectNode, DestroyObjectNode, SendMessageNode, LogNode, SetMaterialNode, DoorToggleNode,
    SetSkyColorNode, SetSunNode, WeatherNode, StarFieldNode, DayNightCycleNode,
    CSharpController,
    TEMPLATE_CATALOG,
    buildTemplate
} from '@b3js/engine';

const V2_NODES = [
    OnStartNode, OnTickNode, OnKeyNode, OnCollisionNode, OnTimerNode, OnInteractNode,
    BranchNode, SequenceNode, ForLoopNode, DelayNode, GateNode,
    GetVariableNode, SetVariableNode, MathOpNode, CompareNode, BoolLogicNode, GetPropertyNode, SetPropertyNode,
    MoveToNode, RotateNode, PlaySoundNode, SpawnObjectNode, DestroyObjectNode, SendMessageNode, LogNode, SetMaterialNode, DoorToggleNode,
    SetSkyColorNode, SetSunNode, WeatherNode, StarFieldNode, DayNightCycleNode,
    CSharpController
];

let searchFilter = '';
let openCategory: string | null = null;
let isPinned = false;
let isVisible = false;
let palettePos = { x: 100, y: 100 };
let isDraggingPalette = false;
let dragStartPos = { x: 0, y: 0 };

export const LogicEditor = ({ 
    selectedObject, 
    engine,
    onRender,
    renderWires,
    renderNode
}: any) => {
    
    // Context Menu State
    const toggleContextMenu = (e: MouseEvent, show: boolean) => {
        if (show) {
            e.preventDefault();
            isVisible = true;
            if (!isPinned) {
                palettePos = { x: e.clientX, y: e.clientY };
            }
            const searchInput = document.getElementById('logic-search') as HTMLInputElement;
            if (searchInput) {
                searchInput.value = '';
                searchFilter = '';
                setTimeout(() => searchInput.focus(), 10);
            }
        } else {
            isVisible = false;
        }
        if (onRender) onRender();
    };

    const onPaletteMouseDown = (e: MouseEvent) => {
        if (isPinned) return;
        const target = e.target as HTMLElement;
        if (target.closest('button') || target.closest('input')) return;
        isDraggingPalette = true;
        dragStartPos = { x: e.clientX - palettePos.x, y: e.clientY - palettePos.y };
        window.addEventListener('mousemove', onPaletteMouseMove);
        window.addEventListener('mouseup', onPaletteMouseUp);
    };

    const onPaletteMouseMove = (e: MouseEvent) => {
        if (!isDraggingPalette) return;
        palettePos = { x: e.clientX - dragStartPos.x, y: e.clientY - dragStartPos.y };
        if (onRender) onRender();
    };

    const onPaletteMouseUp = () => {
        isDraggingPalette = false;
        window.removeEventListener('mousemove', onPaletteMouseMove);
        window.removeEventListener('mouseup', onPaletteMouseUp);
    };

    const addNode = (nodeClass: any) => {
        if (!selectedObject) return;
        const node = new nodeClass();
        if (node instanceof Sensor) selectedObject.addSensor(node);
        else if (node instanceof Actuator) selectedObject.addActuator(node);
        else selectedObject.addController(node);
        toggleContextMenu({} as any, false);
    };

    const addTemplate = (templateId: string) => {
        if (!selectedObject) return;
        const result = buildTemplate(templateId);
        result.nodes.forEach((node: any) => {
            if (node instanceof Sensor) selectedObject.addSensor(node);
            else if (node instanceof Actuator) selectedObject.addActuator(node);
            else selectedObject.addController(node);
        });
        toggleContextMenu({} as any, false);
    };

    // Build Catalog
    const catalog = V2_NODES.map(ctor => ({ ctor, info: (ctor as any).getNodeInfo() }));
    const filtered = catalog.filter(n => n.info.label.toLowerCase().includes(searchFilter) || n.info.description.toLowerCase().includes(searchFilter));
    
    const categories = Array.from(new Set(filtered.map(n => n.info.category)));
    const isAccordion = (localStorage.getItem('B3JS_PALETTE_MODE') || 'list') === 'accordion';

    return (
        <div style="width: 100%; height: 100%; display: flex; flex-direction: column;"
             onContextMenu={(e: any) => toggleContextMenu(e, true)}
             onClick={() => toggleContextMenu({} as any, false)}>
            <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center;">
                <span>Nodal Logic Editor</span>
                <span style="font-size: 9px; color: #666;">Double-Click or Right-Click to add nodes</span>
            </div>
            
            <div style="flex: 1; overflow: scroll; position: relative;" id="logic-canvas-container"
                 onDblClick={(e: any) => toggleContextMenu(e, true)}>
                <div class="logic-canvas" style="width: 4000px; height: 4000px;">
                    <svg style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 0;">
                        {renderWires()}
                    </svg>
                    {selectedObject && [
                        ...selectedObject.sensors.map((n: any) => renderNode(n, 'sensor')),
                        ...selectedObject.controllers.map((n: any) => renderNode(n, 'controller')),
                        ...selectedObject.actuators.map((n: any) => renderNode(n, 'actuator'))
                    ]}
                </div>
            </div>

            {/* Searchable Node Palette Modal Menu / Sidebar */}
            <div id="logic-context-menu" 
                 onClick={(e: any) => e.stopPropagation()}
                 style={`
                    display: ${isVisible || isPinned ? 'flex' : 'none'};
                    position: ${isPinned ? 'absolute' : 'fixed'};
                    left: ${isPinned ? '10px' : palettePos.x + 'px'};
                    top: ${isPinned ? '10px' : palettePos.y + 'px'};
                    bottom: ${isPinned ? '10px' : 'auto'};
                    background: rgba(15,15,15,0.92);
                    border: 1px solid #333;
                    border-radius: 12px;
                    z-index: 1000;
                    width: 280px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.9);
                    backdrop-filter: blur(30px);
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    transition: ${isDraggingPalette ? 'none' : 'opacity 0.2s, transform 0.2s'};
                    transform-origin: top left;
                 `}>
                
                <div 
                    onMouseDown={onPaletteMouseDown}
                    style={`padding: 14px; border-bottom: 1px solid #222; background: rgba(255,255,255,0.03); display: flex; align-items: center; gap: 10px; cursor: ${isPinned ? 'default' : 'move'};`}>
                    <input id="logic-search" type="text" placeholder="Search nodes..." 
                           style="flex: 1; padding: 8px 10px; background: #000; border: 1px solid #333; color: #fff; font-size: 11px; border-radius: 6px; outline: none;"
                           onInput={(e: any) => {
                               searchFilter = e.target.value.toLowerCase();
                               if (onRender) onRender();
                           }} />
                    <button 
                        title={isPinned ? "Unpin Palette" : "Pin Palette"}
                        onMouseDown={(e: any) => e.stopPropagation()}
                        onClick={(e: any) => { e.stopPropagation(); isPinned = !isPinned; if (onRender) onRender(); }}
                        style={`background: ${isPinned ? '#3b82f6' : '#222'}; border: none; color: #fff; padding: 6px; border-radius: 4px; cursor: pointer; font-size: 12px; transition: background 0.2s;`}>
                        {isPinned ? '📍' : '📌'}
                    </button>
                    {!isPinned && (
                        <button onClick={() => toggleContextMenu({} as any, false)} style="background: none; border: none; color: #666; cursor: pointer; font-size: 14px;">✕</button>
                    )}
                </div>

                <div style="flex: 1; overflow-y: auto; padding: 8px; scrollbar-width: thin;">
                    {filtered.length === 0 && <div style="color: #444; font-size: 11px; text-align: center; padding: 40px;">No matching nodes</div>}
                    
                    {categories.map(cat => (
                        <div style="margin-bottom: 8px;">
                            <div 
                                style={`font-size: 10px; color: #555; font-weight: 800; margin-bottom: 6px; padding: 4px 6px; text-transform: uppercase; letter-spacing: 1px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; border-radius: 4px; background: rgba(255,255,255,0.03);`}
                                onClick={() => {
                                    openCategory = openCategory === cat ? null : cat;
                                    if (onRender) onRender();
                                }}
                            >
                                <span>{cat}</span>
                                <span style="font-size: 8px; opacity: 0.5;">{openCategory === cat ? '▼' : '►'}</span>
                            </div>
                            
                            {(openCategory === cat || searchFilter.length > 0) && (
                                <div style="display: flex; flex-direction: column; gap: 2px;">
                                    {filtered.filter(n => n.info.category === cat).map(n => (
                                        <div class="menu-item" 
                                             style="padding: 8px 10px; border-radius: 6px; cursor: pointer; display: flex; align-items: flex-start; gap: 10px; transition: background 0.1s;" 
                                             onClick={() => addNode(n.ctor)}>
                                            <div style={`background: ${n.info.color}22; color: ${n.info.color}; width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 16px; border: 1px solid ${n.info.color}44;`}>
                                                {n.info.icon}
                                            </div>
                                            <div style="display: flex; flex-direction: column; gap: 1px; overflow: hidden;">
                                                <span style="color: #eee; font-weight: 600; font-size: 11px;">{n.info.label}</span>
                                                <span style="font-size: 9px; color: #666; line-height: 1.2; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">{n.info.description}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}

                    <div style="margin-top: 10px; border-top: 1px solid #222; padding-top: 8px;">
                        <div style="font-size: 10px; color: #777; font-weight: 800; margin-bottom: 6px; padding: 4px 6px; text-transform: uppercase; letter-spacing: 1px;">
                            Templates
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 2px;">
                            {TEMPLATE_CATALOG
                                .filter((t: any) => !searchFilter || t.name.toLowerCase().includes(searchFilter) || t.description.toLowerCase().includes(searchFilter))
                                .map((t: any) => (
                                    <div class="menu-item"
                                         style="padding: 8px 10px; border-radius: 6px; cursor: pointer; display: flex; align-items: flex-start; gap: 10px; transition: background 0.1s;"
                                         onClick={() => addTemplate(t.id)}>
                                        <div style="background: #e6852322; color: #e68523; width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 16px; border: 1px solid #e6852344;">
                                            {t.icon}
                                        </div>
                                        <div style="display: flex; flex-direction: column; gap: 1px; overflow: hidden;">
                                            <span style="color: #eee; font-weight: 600; font-size: 11px;">{t.name}</span>
                                            <span style="font-size: 9px; color: #666; line-height: 1.2; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">{t.description}</span>
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </div>
                </div>
                <div style="padding: 10px; font-size: 8px; color: #444; border-top: 1px solid #222; text-align: center; background: rgba(0,0,0,0.2);">
                    Drag into canvas to spawn (Future Build)
                </div>
            </div>
        </div>
    );
};
