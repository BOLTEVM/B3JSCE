/** @jsx webjsx.h */
import * as webjsx from 'webjsx';

export const ShaderEditor = ({
    selectedObject,
    engine,
    renderWires,
    renderNode
}: any) => {
    // Context Menu State
    const toggleContextMenu = (e: MouseEvent, show: boolean) => {
        const menu = document.getElementById('shader-context-menu');
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
        const n = new (nodeClass as any)(...params);
        selectedObject.materialNodes.push(n);
        toggleContextMenu({} as any, false);
    };

    return (
        <div style="width: 100%; height: 100%; display: flex; flex-direction: column;"
            onContextMenu={(e: any) => toggleContextMenu(e, true)}
            onClick={() => toggleContextMenu({} as any, false)}>
            <div class="panel-header" style="display: flex; justify-content: space-between; align-items: center;">
                <span>Nodal Shader Editor</span>
                <div style="display: flex; gap: 8px;">
                    <button style="font-size: 9px; cursor: pointer;" onClick={() => {
                        const n = new (engine.constructor as any).ColorNode();
                        selectedObject.materialNodes.push(n);
                    }}>+ Color</button>
                    <button style="font-size: 9px; cursor: pointer;" onClick={() => {
                        const n = new (engine.constructor as any).PositionNode();
                        selectedObject.materialNodes.push(n);
                    }}>+ Pos</button>
                    <button style="font-size: 9px; cursor: pointer;" onClick={() => {
                        const n = new (engine.constructor as any).TimeNode();
                        selectedObject.materialNodes.push(n);
                    }}>+ Time</button>
                    <button style="font-size: 9px; cursor: pointer;" onClick={() => {
                        const n = new (engine.constructor as any).MathNode();
                        selectedObject.materialNodes.push(n);
                    }}>+ Math</button>
                    <button style="font-size: 9px; cursor: pointer;" onClick={() => {
                        const n = new (engine.constructor as any).AudioNode();
                        selectedObject.materialNodes.push(n);
                    }}>+ Audio</button>
                    <button style="font-size: 9px; cursor: pointer; background: #e68523;" onClick={() => {
                        selectedObject.recompileMaterial();
                    }}>Compile & Apply</button>
                </div>
            </div>
            <div style="flex: 1; overflow: scroll; position: relative;" id="shader-canvas-container"
                onDblClick={(e: any) => toggleContextMenu(e, true)}>
                <div class="shader-canvas" style="width: 2000px; height: 2000px;">
                    <svg style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;">
                        {renderWires()}
                    </svg>
                    {selectedObject && selectedObject.materialNodes.map((n: any) => renderNode(n, 'shader'))}
                </div>
            </div>

            {/* Right-Click / Double-Click Modal Menu */}
            <div id="shader-context-menu" style="display: none; position: fixed; background: #1a1a1a; border: 1px solid #444; border-radius: 6px; z-index: 1000; padding: 10px; min-width: 180px; box-shadow: 0 10px 30px rgba(0,0,0,0.8); backdrop-filter: blur(5px);">
                <div style="font-size: 9px; color: #666; font-weight: bold; margin-bottom: 8px; text-transform: uppercase;">Inputs</div>
                <div class="menu-item" style="font-size: 11px; padding: 6px; border-radius: 3px; cursor: pointer;" onClick={() => addNode((engine.constructor as any).ColorNode)}>🎨 Color Node</div>
                <div class="menu-item" style="font-size: 11px; padding: 6px; border-radius: 3px; cursor: pointer;" onClick={() => addNode((engine.constructor as any).PositionNode)}>📍 Position Node</div>
                <div class="menu-item" style="font-size: 11px; padding: 6px; border-radius: 3px; cursor: pointer;" onClick={() => addNode((engine.constructor as any).TimeNode)}>🕒 Time Node</div>
                <div class="menu-item" style="font-size: 11px; padding: 6px; border-radius: 3px; cursor: pointer;" onClick={() => addNode((engine.constructor as any).AudioNode)}>🔊 Audio Node</div>

                <div style="font-size: 9px; color: #666; font-weight: bold; margin: 12px 0 8px 0; text-transform: uppercase;">Generators</div>
                <div class="menu-item" style="font-size: 11px; padding: 6px; border-radius: 3px; cursor: pointer;" onClick={() => addNode((engine.constructor as any).NoiseNode)}>☁️ Simplex Noise</div>

                <div style="font-size: 9px; color: #666; font-weight: bold; margin: 12px 0 8px 0; text-transform: uppercase;">Math & Composition</div>
                <div class="menu-item" style="font-size: 11px; padding: 6px; border-radius: 3px; cursor: pointer;" onClick={() => addNode((engine.constructor as any).MathNode)}>➕ Math Operation</div>
                <div class="menu-item" style="font-size: 11px; padding: 6px; border-radius: 3px; cursor: pointer;" onClick={() => addNode((engine.constructor as any).MixNode)}>🌓 Mix / Lerp</div>
                <div class="menu-item" style="font-size: 11px; padding: 6px; border-radius: 3px; cursor: pointer;" onClick={() => addNode((engine.constructor as any).Vector3Node)}>🧱 Vector3 Compose</div>

                <div style="margin-top: 10px; border-top: 1px solid #333; padding-top: 10px;">
                    <div class="menu-item" style="font-size: 11px; padding: 6px; color: #e68523; font-weight: bold;" onClick={() => { selectedObject.recompileMaterial(); toggleContextMenu({} as any, false); }}>🏗️ Compile & Apply</div>
                </div>
            </div>
        </div>
    );
};
