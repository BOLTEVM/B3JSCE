import * as webjsx from 'webjsx';

export const LogicEditor = ({ 
    selectedObject, 
    engine, 
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
        } else {
            menu.style.display = 'none';
        }
    };

    const addNode = (nodeClass: any, params: any[] = []) => {
        if (!selectedObject) return;
        const node = new nodeClass(...params);
        if (nodeClass.name.includes('Sensor')) selectedObject.addSensor(node);
        if (nodeClass.name.includes('Controller')) selectedObject.addController(node);
        if (nodeClass.name.includes('Actuator')) selectedObject.addActuator(node);
        toggleContextMenu({} as any, false);
    };

    return (
        <div style="width: 100%; height: 100%; display: flex; flex-direction: column;"
             onContextMenu={(e: any) => toggleContextMenu(e, true)}
             onClick={() => toggleContextMenu({} as any, false)}>
            <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center;">
                <span>Nodal Logic Editor</span>
                <div style="display: flex; gap: 8px;">
                    <button style="font-size: 9px; cursor: pointer;" onClick={() => { if (selectedObject) engine?.applyBlueprint(selectedObject.id, 'WASD_MOVEMENT'); }}>WASD Blueprint</button>
                </div>
            </div>
            <div style="flex: 1; overflow: scroll; position: relative;" id="logic-canvas-container"
                 onDblClick={(e: any) => toggleContextMenu(e, true)}>
                <div class="logic-canvas" style="width: 2000px; height: 2000px;">
                    <svg style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;">
                        {renderWires()}
                    </svg>
                    {selectedObject && [
                        ...selectedObject.sensors.map((n: any) => renderNode(n, 'sensor')),
                        ...selectedObject.controllers.map((n: any) => renderNode(n, 'controller')),
                        ...selectedObject.actuators.map((n: any) => renderNode(n, 'actuator'))
                    ]}
                </div>
            </div>

            {/* Right-Click / Double-Click Modal Menu */}
            <div id="logic-context-menu" style="display: none; position: fixed; background: #1a1a1a; border: 1px solid #444; border-radius: 6px; z-index: 1000; padding: 10px; min-width: 180px; box-shadow: 0 10px 30px rgba(0,0,0,0.8); backdrop-filter: blur(5px);">
                <div style="font-size: 9px; color: #666; font-weight: bold; margin-bottom: 8px; text-transform: uppercase;">Sensors</div>
                <div class="menu-item" style="font-size: 11px; padding: 6px; border-radius: 3px; cursor: pointer;" onClick={() => addNode(engine.constructor.KeyboardSensor, ['KeyW'])}>⌨️ Keyboard Sensor</div>
                <div class="menu-item" style="font-size: 11px; padding: 6px; border-radius: 3px; cursor: pointer;" onClick={() => addNode(engine.constructor.SightSensor, [])}>👁️ Sight Sensor (AI)</div>
                
                <div style="font-size: 9px; color: #666; font-weight: bold; margin: 12px 0 8px 0; text-transform: uppercase;">Controllers</div>
                <div class="menu-item" style="font-size: 11px; padding: 6px; border-radius: 3px; cursor: pointer;" onClick={() => addNode(engine.constructor.AndController, [])}>⚡ AND Controller</div>
                <div class="menu-item" style="font-size: 11px; padding: 6px; border-radius: 3px; cursor: pointer;" onClick={() => addNode(engine.constructor.PythonController, [])}>🐍 Python Script</div>
                
                <div style="font-size: 9px; color: #666; font-weight: bold; margin: 12px 0 8px 0; text-transform: uppercase;">Actuators</div>
                <div class="menu-item" style="font-size: 11px; padding: 6px; border-radius: 3px; cursor: pointer;" onClick={() => addNode(engine.constructor.MotionActuator, [new engine.THREE.Vector3(0,0,1)])}>🏃 Motion Actuator</div>
                <div class="menu-item" style="font-size: 11px; padding: 6px; border-radius: 3px; cursor: pointer;" onClick={() => addNode(engine.constructor.NavMoveActuator, [engine.camera.position])}>🗺️ Nav Path Move</div>
                <div class="menu-item" style="font-size: 11px; padding: 6px; border-radius: 3px; cursor: pointer;" onClick={() => addNode(engine.constructor.CombatActuator, [])}>🔫 Combat Fire</div>
                
                <div style="margin-top: 10px; border-top: 1px solid #333; padding-top: 10px;">
                    <div class="menu-item" style="font-size: 11px; padding: 6px; color: #e68523;" onClick={() => { engine.applyBlueprint(selectedObject.id, 'WASD_MOVEMENT'); toggleContextMenu({} as any, false); }}>🏗️ Apply WASD Blueprint</div>
                </div>
            </div>
        </div>
    );
};
