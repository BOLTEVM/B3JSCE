import * as webjsx from 'webjsx';
import { 
    Sensor, Controller, Actuator,
    OnStartNode, OnTickNode, OnKeyNode, OnCollisionNode, OnTimerNode, OnInteractNode,
    BranchNode, SequenceNode, ForLoopNode, DelayNode, GateNode,
    GetVariableNode, SetVariableNode, MathOpNode, CompareNode, BoolLogicNode, GetPropertyNode, SetPropertyNode,
    MoveToNode, RotateNode, PlaySoundNode, SpawnObjectNode, DestroyObjectNode, SendMessageNode, LogNode, SetMaterialNode, DoorToggleNode,
    SetSkyColorNode, SetSunNode, WeatherNode, StarFieldNode, DayNightCycleNode,
    CSharpController
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

export const LogicEditor = ({ 
    selectedObject, 
    engine,
    onRender,
    renderWires,
    renderNode
}: any) => {
    
    // Context Menu State
    const toggleContextMenu = (e: MouseEvent, show: boolean) => {
        const menu = document.getElementById('logic-context-menu');
        if (!menu) return;
        if (show) {
            e.preventDefault();
            menu.style.display = 'block';
            menu.style.left = `${e.clientX}px`;
            menu.style.top = `${e.clientY}px`;
            const searchInput = document.getElementById('logic-search') as HTMLInputElement;
            if (searchInput) {
                searchInput.value = '';
                searchFilter = '';
                setTimeout(() => searchInput.focus(), 10);
            }
        } else {
            menu.style.display = 'none';
        }
        if (onRender) onRender();
    };

    const addNode = (nodeClass: any) => {
        if (!selectedObject) return;
        const node = new nodeClass();
        if (node instanceof Sensor) selectedObject.addSensor(node);
        else if (node instanceof Actuator) selectedObject.addActuator(node);
        else selectedObject.addController(node);
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

            {/* Searchable Node Palette Modal Menu */}
            <div id="logic-context-menu" 
                 onClick={(e: any) => e.stopPropagation()}
                 style="display: none; position: fixed; background: rgba(30,30,30,0.95); border: 1px solid #444; border-radius: 6px; z-index: 1000; min-width: 240px; box-shadow: 0 10px 30px rgba(0,0,0,0.8); backdrop-filter: blur(5px); overflow: hidden; max-height: 400px; display: flex; flex-direction: column;">
                
                <div style="padding: 10px; border-bottom: 1px solid #333; background: #111;">
                    <input id="logic-search" type="text" placeholder="Search nodes (e.g. 'Key')" 
                           style="width: 100%; padding: 6px; box-sizing: border-box; background: #000; border: 1px solid #444; color: #fff; font-size: 11px; border-radius: 4px;"
                           onInput={(e: any) => {
                               searchFilter = e.target.value.toLowerCase();
                               if (onRender) onRender();
                           }} />
                </div>

                <div style="flex: 1; overflow-y: auto; padding: 10px;">
                    {filtered.length === 0 && <div style="color: #666; font-size: 10px; text-align: center; padding: 10px;">No nodes found</div>}
                    
                    {categories.map(cat => (
                        <div style="margin-bottom: 12px;">
                            {/* Category Header */}
                            <div 
                                style={`font-size: 9px; color: #888; font-weight: bold; margin-bottom: 4px; text-transform: uppercase; cursor: ${isAccordion ? 'pointer' : 'default'}; display: flex; justify-content: space-between;`}
                                onClick={() => {
                                    if (isAccordion) {
                                        openCategory = openCategory === cat ? null : cat;
                                        if (onRender) onRender();
                                    }
                                }}
                            >
                                <span>{cat}</span>
                                {isAccordion && <span>{openCategory === cat ? '▼' : '►'}</span>}
                            </div>
                            
                            {/* Children */}
                            {(!isAccordion || openCategory === cat || searchFilter.length > 0) && (
                                <div style="display: flex; flex-direction: column; gap: 4px;">
                                    {filtered.filter(n => n.info.category === cat).map(n => (
                                        <div class="menu-item" style="font-size: 11px; padding: 6px; border-radius: 3px; cursor: pointer; display: flex; align-items: center; gap: 6px;" 
                                             onClick={() => addNode(n.ctor)}>
                                            <span style={`color: ${n.info.color}; font-size: 12px;`}>{n.info.icon}</span>
                                            <div style="display: flex; flex-direction: column;">
                                                <span style="color: #ddd;">{n.info.label}</span>
                                                <span style="font-size: 9px; color: #666;">{n.info.description}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
