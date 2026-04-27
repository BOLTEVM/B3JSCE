import * as webjsx from 'webjsx';
import * as THREE from 'three';
import { KeyboardSensor, AndController, MotionActuator, TEMPLATE_CATALOG, buildTemplate, Controller, Sensor, Actuator } from '@b3js/engine';

export const ToolSidebar = ({ 
    engine, 
    gizmoMode, 
    selectedObject, 
    onSetGizmoMode, 
    onRender 
}: any) => {
    return (
        <div style="display: flex; flex-direction: column; align-items: center; padding: 10px 0;">
            
            <div class="sidebar-category">Xform</div>
            <button class={`tool-btn ${gizmoMode === 'translate' ? 'active' : ''}`}
                title="Translate (G)"
                onClick={() => onSetGizmoMode('translate')}>✜</button>
            <button class={`tool-btn ${gizmoMode === 'rotate' ? 'active' : ''}`}
                title="Rotate (R)"
                onClick={() => onSetGizmoMode('rotate')}>⟳</button>
            <button class={`tool-btn ${gizmoMode === 'scale' ? 'active' : ''}`}
                title="Scale (S)"
                onClick={() => onSetGizmoMode('scale')}>⤢</button>

            <div class="sidebar-hr"></div>
            <div class="sidebar-category">Create</div>
            <button class="tool-btn" title="Create Cube" onClick={() => { engine?.createCube(); onRender(); }}>🧊</button>
            <button class="tool-btn" title="Create Sphere" onClick={() => { engine?.createSphere(); onRender(); }}>⚽</button>
            <button class="tool-btn" title="Create Point Light" onClick={() => { engine?.createLight(); onRender(); }}>💡</button>

            <div class="sidebar-hr"></div>
            <div class="sidebar-category">Logic</div>
            <button class="tool-btn" title="Add Key Sensor (W)" 
                onClick={() => {
                    if (selectedObject) {
                        selectedObject.addSensor(new KeyboardSensor('KeyW'));
                        onRender();
                    }
                }}>⌨</button>
            <button class="tool-btn" title="Add AND Controller" 
                onClick={() => {
                    if (selectedObject) {
                        selectedObject.addController(new AndController());
                        onRender();
                    }
                }}>⚙</button>
            <button class="tool-btn" title="Add Motion Actuator" 
                onClick={() => {
                    if (selectedObject) {
                        selectedObject.addActuator(new MotionActuator(selectedObject.object, new THREE.Vector3(0,0,-0.1)));
                        onRender();
                    }
                }}>▶</button>

            <div class="sidebar-hr"></div>
            <div class="sidebar-category">Sim</div>
            <button class={`tool-btn ${engine?.isPaused ? '' : 'active'}`} 
                title="Toggle Simulation (P)" 
                onClick={() => {
                    engine?.toggleSimulation();
                    onRender();
                }}>⏯</button>
            <button class="tool-btn" title="Reset Scene" 
                onClick={() => {
                    if (confirm("Reset current scene?")) {
                        engine?.resetScene();
                        onRender();
                    }
                }}>↺</button>
            
            <div class="sidebar-hr"></div>
            <div class="sidebar-category">Templates</div>
            {TEMPLATE_CATALOG.map((t: any) => (
                <button class="tool-btn" title={t.name + ": " + t.description} style="width: 40px; font-size: 14px;"
                    onClick={() => {
                        if (selectedObject) {
                            const res = buildTemplate(t.id);
                            if (res) {
                                res.nodes.forEach((n: any) => {
                                    if ((n as any) instanceof Sensor) selectedObject.addSensor(n);
                                    else if ((n as any) instanceof Actuator) selectedObject.addActuator(n);
                                    else selectedObject.addController(n);
                                });
                                onRender();
                            }
                        }
                    }}>{t.icon}</button>
            ))}
        </div>
    );
};
