import * as webjsx from 'webjsx';

export const NodalEditor = ({ 
    selectedObject, 
    engine, 
    type, // 'logic' | 'shader'
    renderWires,
    renderNode
}: any) => {
    // Context Menu State (Simple DOM toggle)
    const toggleContextMenu = (e: MouseEvent, show: boolean) => {
        const menu = document.getElementById('nodal-context-menu');
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
        if (type === 'logic') {
            if (nodeClass.name.includes('Sensor')) selectedObject.addSensor(node);
            if (nodeClass.name.includes('Controller')) selectedObject.addController(node);
            if (nodeClass.name.includes('Actuator')) selectedObject.addActuator(node);
        } else {
            selectedObject.materialNodes.push(node);
        }
        toggleContextMenu({} as any, false);
        // Force refresh via engine's selection callback if possible, or assume parent handles it
    };

    return (
        <div 
            style="width: 100%; height: 100%; display: flex; flex-direction: column;"
            onContextMenu={(e: any) => toggleContextMenu(e, true)}
            onClick={() => toggleContextMenu({} as any, false)}
        >
            <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center;">
                <span style="text-transform: capitalize;">{type} Editor</span>
                <span style="font-size: 9px; color: #666;">Right-click to add nodes</span>
            </div>

            <div style="flex: 1; overflow: scroll; position: relative;">
                <div class={`${type}-canvas`} style="width: 2000px; height: 2000px; background-image: radial-gradient(#222 1px, transparent 1px); background-size: 20px 20px;">
                    <svg style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;">
                        {renderWires()}
                    </svg>
                    
                    {selectedObject && type === 'logic' && [
                        ...selectedObject.sensors.map((n: any) => renderNode(n, 'sensor')),
                        ...selectedObject.controllers.map((n: any) => renderNode(n, 'controller')),
                        ...selectedObject.actuators.map((n: any) => renderNode(n, 'actuator'))
                    ]}

                    {selectedObject && type === 'shader' && selectedObject.materialNodes.map((n: any) => renderNode(n, 'shader'))}
                </div>
            </div>

            {/* Right-Click Context Menu */}
            <div 
                id="nodal-context-menu" 
                style="display: none; position: fixed; background: #222; border: 1px solid #444; border-radius: 4px; z-index: 1000; padding: 5px; min-width: 120px; box-shadow: 0 4px 10px rgba(0,0,0,0.5);"
            >
                {type === 'logic' ? (
                    <div>
                        <div class="menu-item" style="font-size: 10px; padding: 5px;" onClick={() => addNode(engine.constructor.KeyboardSensor, ['KeyW'])}>+ Keyboard Sensor</div>
                        <div class="menu-item" style="font-size: 10px; padding: 5px;" onClick={() => addNode(engine.constructor.AndController, [])}>+ AND Controller</div>
                        <div class="menu-item" style="font-size: 10px; padding: 5px;" onClick={() => addNode(engine.constructor.PythonController, [])}>+ Python Controller</div>
                        <div class="menu-item" style="font-size: 10px; padding: 5px; border-top: 1px solid #333;" onClick={() => { engine.applyBlueprint(selectedObject.id, 'WASD_MOVEMENT'); toggleContextMenu({} as any, false); }}>Apply WASD Blueprint</div>
                    </div>
                ) : (
                    <div>
                        <div class="menu-item" style="font-size: 10px; padding: 5px;" onClick={() => addNode(engine.constructor.ColorNode, [])}>+ Color Node</div>
                        <div class="menu-item" style="font-size: 10px; padding: 5px;" onClick={() => addNode(engine.constructor.TimeNode, [])}>+ Time Node</div>
                        <div class="menu-item" style="font-size: 10px; padding: 5px;" onClick={() => addNode(engine.constructor.MathNode, [])}>+ Math Node</div>
                        <div class="menu-item" style="font-size: 10px; padding: 5px;" onClick={() => addNode(engine.constructor.AudioNode, [])}>+ Audio Node</div>
                        <div class="menu-item" style="font-size: 10px; padding: 5px; border-top: 1px solid #333; color: #e68523;" onClick={() => { selectedObject.recompileMaterial(); toggleContextMenu({} as any, false); }}>Compile & Apply</div>
                    </div>
                )}
            </div>
        </div>
    );
};
