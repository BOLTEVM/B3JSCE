import * as webjsx from 'webjsx';
import * as THREE from 'three';

import { PropertiesProps } from '../types';
import { SetPropertyCommand } from '@b3js/engine';

export const Properties = ({ 
    selectedObject, 
    selectedSubItem,
    engine,
    selectedShaderNode,
    onRender 
}: PropertiesProps) => {
    if (!selectedObject || !engine) {
        return (
            <div style="padding: 20px; text-align: center; opacity: 0.3;">
                {engine ? 'Select an object to view properties' : 'Engine required'}
            </div>
        );
    }

    const renderSubItemInspector = () => {
        if (!selectedSubItem) return null;

        const { type, id } = selectedSubItem;

        if (type === 'modifier') {
            const modifier = selectedObject.modifiers.find((m: any) => m.id === id);
            if (!modifier) return null;

            return (
                <div class="sub-inspector">
                    <div class="sub-header">
                        <span style="color: #60a5fa;">🔧 {modifier.name}</span>
                        <input type="checkbox" checked={modifier.enabled} onChange={(e: any) => { modifier.enabled = e.target.checked; onRender(); }} />
                    </div>
                    <div class="prop-row">
                        <div class="prop-label">Type</div>
                        <div style="font-size: 10px; color: #888;">{modifier.type}</div>
                    </div>
                    {Object.entries(modifier.properties).map(([key, value]: any) => (
                        <div class="prop-row" key={key}>
                            <div class="prop-label">{key}</div>
                            {typeof value === 'number' ? (
                                <input type="number" value={value.toString()} onInput={(e: any) => { modifier.properties[key] = parseFloat(e.target.value); onRender(); }} />
                            ) : typeof value === 'boolean' ? (
                                <input type="checkbox" checked={value} onChange={(e: any) => { modifier.properties[key] = e.target.checked; onRender(); }} />
                            ) : (
                                <input type="text" value={value} onInput={(e: any) => { modifier.properties[key] = e.target.value; onRender(); }} />
                            )}
                        </div>
                    ))}
                    <div style="font-size: 8px; color: #555; margin-top: 8px;">ID: {modifier.id}</div>
                </div>
            );
        }

        if (type === 'vertexGroup') {
            const group = selectedObject.vertexGroups.find((vg: any) => vg.name === id);
            if (!group) return null;

            return (
                <div class="sub-inspector">
                    <div class="sub-header">
                        <span style="color: #34d399;">🧬 {group.name}</span>
                    </div>
                    <div class="prop-row">
                        <div class="prop-label">Vertices</div>
                        <div style="font-size: 10px; color: #888;">{group.indices.length} indices</div>
                    </div>
                    <div style="margin-top: 10px; opacity: 0.5; font-size: 9px; text-align: center;">
                        Vertex weights are currently read-only.
                    </div>
                </div>
            );
        }

        if (type === 'logic') {
            const node = selectedObject.logicNodes.find((ln: any) => ln.name === id);
            if (!node) return null;

            return (
                <div class="sub-inspector">
                    <div class="sub-header">
                        <span style="color: #facc15;">● {node.name}</span>
                    </div>
                    <div class="prop-row">
                        <div class="prop-label">Type</div>
                        <div style="font-size: 10px; color: #888;">{node.type.toUpperCase()}</div>
                    </div>
                    {node.type === 'collider' && (
                        <>
                            <div class="prop-row">
                                <div class="prop-label">Physics Type</div>
                                <select onInput={(e: any) => { /* TODO: Change physics type */ }}>
                                    <option value="box">Box</option>
                                    <option value="sphere">Sphere</option>
                                    <option value="mesh">Mesh (Trimesh)</option>
                                </select>
                            </div>
                            <div class="prop-row">
                                <div class="prop-label">Mass</div>
                                <input type="number" value="1.0" />
                            </div>
                        </>
                    )}
                </div>
            );
        }

        return null;
    };

    return (
        <div class="properties-wrapper" style="padding: 10px;">
            <style>{`
                .sub-inspector {
                    background: #1a1a1a;
                    border-radius: 6px;
                    padding: 12px;
                    margin-bottom: 20px;
                    border: 1px solid #333;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                }
                .sub-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-size: 12px;
                    font-weight: bold;
                    margin-bottom: 12px;
                    border-bottom: 1px solid #333;
                    padding-bottom: 8px;
                }
            `}</style>
            
            <div style="font-size: 14px; font-weight: bold; margin-bottom: 15px; color: #e68523; display: flex; align-items: center; gap: 8px;">
                <span style="opacity: 0.5;">📦</span> {selectedObject.name}
            </div>

            {/* Sub-Item Inspector */}
            {renderSubItemInspector()}

            {/* Shader Node Inspector */}
            {selectedShaderNode && (
                <div style="background: #1a1a1a; border: 1px solid #4a9eff; padding: 10px; border-radius: 4px; margin-bottom: 20px; box-shadow: 0 4px 15px rgba(74, 158, 255, 0.2);">
                    <div style="font-size: 10px; color: #4a9eff; font-weight: bold; margin-bottom: 8px; text-transform: uppercase;">Node: {selectedShaderNode.getTypeName()}</div>
                    
                    {selectedShaderNode.getTypeName() === 'MathNode' && (
                        <div class="prop-row">
                            <div class="prop-label">Operation</div>
                            <select value={selectedShaderNode.operation} onInput={(e: any) => { selectedShaderNode.operation = e.target.value; onRender(); }}>
                                <option value="add">Add</option>
                                <option value="multiply">Multiply</option>
                                <option value="sin">Sine Wave</option>
                            </select>
                        </div>
                    )}

                    {selectedShaderNode.getTypeName() === 'NoiseNode' && (
                        <div class="prop-row">
                            <div class="prop-label">Scale</div>
                            <input type="number" step="0.1" value={selectedShaderNode.scale.toString()} 
                                   onInput={(e: any) => { selectedShaderNode.scale = parseFloat(e.target.value); onRender(); }} />
                        </div>
                    )}

                    {selectedShaderNode.getTypeName() === 'ColorNode' && (
                        <div class="prop-row">
                            <div class="prop-label">Color</div>
                            <input type="color" value={`#${selectedShaderNode.color.getHexString()}`} 
                                   onInput={(e: any) => { selectedShaderNode.color.set(e.target.value); onRender(); }} />
                        </div>
                    )}

                    {selectedShaderNode.getTypeName() === 'AudioNode' && (
                        <div class="prop-row">
                            <div class="prop-label">Freq Index</div>
                            <input type="range" min="0" max="127" value={selectedShaderNode.freqIndex.toString()} 
                                   onInput={(e: any) => { selectedShaderNode.freqIndex = parseInt(e.target.value); onRender(); }} />
                            <span style="font-size: 8px; margin-left: 4px;">{selectedShaderNode.freqIndex}</span>
                        </div>
                    )}

                    <div style="font-size: 8px; color: #555; margin-top: 8px;">ID: {selectedShaderNode.id}</div>
                </div>
            )}
            
            <div class="section-title">Transform</div>
            <div class="prop-row">
                <div class="prop-label">Position</div>
                <div class="prop-grid">
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                        <span style="font-size: 8px; color: #666; font-weight: bold; text-align: center;">X</span>
                        <input type="number" step="0.1" value={selectedObject.object.position.x.toString()} 
                            onInput={(e: any) => {
                                const v = parseFloat(e.target.value);
                                if (!isNaN(v)) {
                                    engine.history.execute(new SetPropertyCommand(selectedObject.object.position, 'x', v));
                                    if (selectedObject.body) selectedObject.body.position.x = v;
                                    if (!selectedObject.isRemote) engine.spacetime.pushUpdate(selectedObject);
                                    onRender();
                                }
                            }} />
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                        <span style="font-size: 8px; color: #666; font-weight: bold; text-align: center;">Y</span>
                        <input type="number" step="0.1" value={selectedObject.object.position.y.toString()} 
                            onInput={(e: any) => {
                                const v = parseFloat(e.target.value);
                                if (!isNaN(v)) {
                                    engine.history.execute(new SetPropertyCommand(selectedObject.object.position, 'y', v));
                                    if (selectedObject.body) selectedObject.body.position.y = v;
                                    if (!selectedObject.isRemote) engine.spacetime.pushUpdate(selectedObject);
                                    onRender();
                                }
                            }} />
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                        <span style="font-size: 8px; color: #666; font-weight: bold; text-align: center;">Z</span>
                        <input type="number" step="0.1" value={selectedObject.object.position.z.toString()} 
                            onInput={(e: any) => {
                                const v = parseFloat(e.target.value);
                                if (!isNaN(v)) {
                                    engine.history.execute(new SetPropertyCommand(selectedObject.object.position, 'z', v));
                                    if (selectedObject.body) selectedObject.body.position.z = v;
                                    if (!selectedObject.isRemote) engine.spacetime.pushUpdate(selectedObject);
                                    onRender();
                                }
                            }} />
                    </div>
                </div>
            </div>

            <div class="section-title" style="margin-top: 15px;">Avatar & Visuals</div>
            <div class="prop-row">
                <div class="prop-label">Model URL</div>
                <input type="text" placeholder="https://...model.glb" value={selectedObject.avatarUrl} 
                       onInput={(e: any) => {
                           selectedObject.avatarUrl = e.target.value;
                       }} 
                       onBlur={() => {
                           if (selectedObject.avatarUrl) selectedObject.setAvatar(selectedObject.avatarUrl).then(() => onRender());
                       }} />
            </div>
            <div style="padding: 0 8px; margin-top: 5px;">
                <button style="width: 100%; font-size: 8px; cursor: pointer; background: #333; color: #fff; border: 1px solid #444; padding: 4px;"
                        onClick={() => {
                            selectedObject.recalculatePhysicsBody();
                            onRender();
                        }}>Recalculate Physics Body</button>
            </div>

            <div class="section-title" style="margin-top: 15px;">Logic Bricks</div>
            
            {/* Sensors */}
            {selectedObject.sensors.map((s: any) => (
                <div class="logic-brick">
                    ⚡ {s.getTypeName ? s.getTypeName() : s.constructor.name}
                    <span class="delete-btn" onClick={() => {
                        selectedObject.removeSensor(s);
                        onRender();
                    }}>✕</span>
                </div>
            ))}

            {/* Controllers */}
            {selectedObject.controllers.map((c: any) => (
                <div class="logic-brick">
                    ⚙ {c.getTypeName ? c.getTypeName() : c.constructor.name}
                    <span class="delete-btn" onClick={() => {
                        selectedObject.removeController(c);
                        onRender();
                    }}>✕</span>
                    
                    <div class="section-title" style="font-size: 8px; margin-top: 4px;">Link Sensors</div>
                    <select onInput={(e: any) => {
                        const sensor = selectedObject.sensors.find((s: any) => s.id === e.target.value);
                        if (sensor) c.addSensor(sensor);
                        onRender();
                    }}>
                        <option value="">Add Sensor...</option>
                        {selectedObject.sensors.map((s: any) => <option value={s.id}>{s.getTypeName ? s.getTypeName() : s.constructor.name}</option>)}
                    </select>

                    {/* Python Script Editor */}
                    {(c.getTypeName ? c.getTypeName() : c.constructor.name) === 'PythonController' && (
                        <div style="margin-top: 10px;">
                            <div class="section-title" style="font-size: 8px; margin-bottom: 4px;">Python Script</div>
                            <textarea 
                                style="width: 100%; height: 80px; background: #111; color: #00ff88; font-family: monospace; font-size: 9px; border: 1px solid #333; padding: 4px; box-sizing: border-box;"
                                onInput={(e: any) => {
                                    c.script = e.target.value;
                                }}
                            >{c.script}</textarea>
                        </div>
                    )}
                </div>
            ))}

            <div style="display: flex; gap: 4px; margin-top: 10px;">
                <button style="font-size: 9px; flex: 1; cursor: pointer;" onClick={() => { selectedObject.addController(new (engine.constructor as any).AndController()); onRender(); }}>+ AND</button>
                <button style="font-size: 9px; flex: 1; cursor: pointer;" onClick={() => { selectedObject.addController(new (engine.constructor as any).PythonController()); onRender(); }}>+ Python</button>
                <button style="font-size: 9px; flex: 1; cursor: pointer;" onClick={() => { selectedObject.addActuator(new (engine.constructor as any).SpawnActuator()); onRender(); }}>+ Spawn</button>
            </div>

            {/* Actuators */}
            {selectedObject.actuators.map((a: any) => (
                <div class="logic-brick">
                    ▶ {a.getTypeName ? a.getTypeName() : a.constructor.name}
                    <span class="delete-btn" onClick={() => {
                        selectedObject.removeActuator(a);
                        onRender();
                    }}>✕</span>

                    {a.getTypeName() === 'SpawnActuator' && (
                        <div style="margin-top: 8px; border-top: 1px solid #444; padding-top: 8px;">
                            <div class="prop-row" style="border:none; padding: 2px 0;">
                                <div class="prop-label" style="font-size: 8px; width: 60px;">Actor Type</div>
                                <select value={a.actorType} onInput={(e: any) => { a.actorType = e.target.value; onRender(); }}>
                                    <option value="Basic NPC">Basic NPC</option>
                                    <option value="Tactical Hero">Tactical Hero</option>
                                    <option value="Primitive">Cube (Dummy)</option>
                                </select>
                            </div>
                            <div class="prop-row" style="border:none; padding: 2px 0;">
                                <div class="prop-label" style="font-size: 8px; width: 60px;">Team ID</div>
                                <input type="number" value={a.teamId.toString()} onInput={(e: any) => { a.teamId = parseInt(e.target.value); onRender(); }} />
                            </div>
                            <div class="prop-row" style="border:none; padding: 2px 0;">
                                <div class="prop-label" style="font-size: 8px; width: 60px;">Interval (s)</div>
                                <input type="number" step="0.5" value={a.interval.toString()} onInput={(e: any) => { a.interval = parseFloat(e.target.value); onRender(); }} />
                            </div>
                        </div>
                    )}
                </div>
            ))}

            <div class="section-title" style="margin-top: 15px;">Material</div>
            <div class="prop-row">
                <div class="prop-label">Mode</div>
                <select value={selectedObject.isNodalMaterial ? 'nodal' : 'standard'} 
                        onInput={(e: any) => {
                            selectedObject.isNodalMaterial = e.target.value === 'nodal';
                            selectedObject.recompileMaterial();
                            onRender();
                        }}>
                    <option value="standard">Standard</option>
                    <option value="nodal">Nodal (Custom)</option>
                </select>
            </div>

            {selectedObject.isNodalMaterial && (
                <>
                    <div style="padding: 8px;">
                        <button style="width: 100%; font-size: 9px; cursor: pointer; background: #e68523; color: white; border: none; padding: 4px; border-radius: 2px;"
                                onClick={() => { selectedObject.recompileMaterial(); onRender(); }}>
                            Recompile Shader
                        </button>
                    </div>
                    
                    <div class="section-title" style="font-size: 8px;">Custom Uniforms</div>
                    {Object.entries(selectedObject.shaderUniforms.uniforms).map(([name, data]: any) => (
                        <div class="prop-row">
                            <div class="prop-label" style="font-size: 9px;">{name}</div>
                            {data.type === 'float' ? (
                                <input type="number" step="0.01" value={data.value.toString()} 
                                    onInput={(e: any) => {
                                        data.value = parseFloat(e.target.value);
                                        onRender();
                                    }} />
                            ) : data.type === 'color' ? (
                                <input type="color" value={`#${data.value.getHexString()}`} 
                                    onInput={(e: any) => {
                                        data.value.set(e.target.value);
                                        onRender();
                                    }} />
                            ) : <div>{data.type}</div>}
                        </div>
                    ))}
                </>
            )}
            <div class="section-title" style="margin-top: 15px;">Physics & Tools</div>
            <div style="display: flex; gap: 4px; margin-bottom: 8px;">
                <button style="flex: 1; font-size: 9px; cursor: pointer;" onClick={() => {
                    if (selectedObject.body) {
                        selectedObject.body.type = 1; // Dynamic
                        onRender();
                    }
                }}>Make Dynamic</button>
                <button style="flex: 1; font-size: 9px; cursor: pointer;" onClick={() => {
                    if (selectedObject.body) {
                        selectedObject.body.type = 2; // Static
                        onRender();
                    }
                }}>Make Static</button>
            </div>
            <button style="width: 100%; font-size: 9px; cursor: pointer; background: #333; height: 24px; border: 1px solid #444;" 
                    onClick={() => { 
                        selectedObject.normalizeScale(); 
                        onRender(); 
                    }}>Normalize Scale</button>

            <div class="prop-row" style="margin-top: 10px; border-top: 1px solid #444; padding-top: 10px;">
                <div class="prop-label" style="font-size: 9px;">Visible</div>
                <input type="checkbox" checked={selectedObject.visible} 
                       onChange={(e: any) => {
                           selectedObject.visible = e.target.checked;
                           onRender();
                       }} />
            </div>

            <div class="prop-row">
                <div class="prop-label" style="font-size: 9px;">Locked</div>
                <input type="checkbox" checked={selectedObject.locked} 
                       onChange={(e: any) => {
                           selectedObject.locked = e.target.checked;
                           if (e.target.checked) engine.selectObject(null); // Deselect if locked
                           onRender();
                       }} />
            </div>

            <div class="prop-row">
                <div class="prop-label" style="font-size: 9px;">Static Object</div>
                <input type="checkbox" checked={selectedObject.isStatic} 
                       onChange={(e: any) => {
                           engine.history.execute(new SetPropertyCommand(selectedObject, 'isStatic', e.target.checked));
                           if (engine.optimizationMode === 'auto') engine.optimizer.rebuildInstances();
                           onRender();
                       }} />
            </div>

            <div class="prop-row">
                <div class="prop-label" style="font-size: 9px;">Is Actor</div>
                <input type="checkbox" checked={selectedObject.isActor} 
                       onChange={(e: any) => {
                           engine.history.execute(new SetPropertyCommand(selectedObject, 'isActor', e.target.checked));
                           onRender();
                       }} />
            </div>

            {selectedObject.isActor && (
                <div style="background: #222; padding: 10px; border-radius: 4px; margin-top: 8px;">
                    <div class="prop-row">
                        <div class="prop-label">Team ID</div>
                        <input type="number" value={selectedObject.teamId.toString()} 
                               onChange={(e: any) => { engine.history.execute(new SetPropertyCommand(selectedObject, 'teamId', parseInt(e.target.value))); onRender(); }} />
                    </div>
                </div>
            )}

            <div class="prop-row">
                <div class="prop-label" style="font-size: 9px;">Is Vehicle</div>
                <input type="checkbox" checked={selectedObject.isVehicle} 
                       onChange={(e: any) => {
                           engine.history.execute(new SetPropertyCommand(selectedObject, 'isVehicle', e.target.checked));
                           if (e.target.checked && !selectedObject.vehicleId) {
                               engine.vehicles.createVehicle(selectedObject);
                           }
                           onRender();
                       }} />
            </div>

            {selectedObject.isVehicle && (
                <div style="background: #222; padding: 10px; border-radius: 4px; margin-top: 8px;">
                    <button style="width: 100%; border: none; padding: 4px; background: #333; color: #fff; font-size: 9px; cursor: pointer;"
                            onClick={() => {
                                selectedObject.seats.push({ name: `Seat ${selectedObject.seats.length + 1}`, offset: new THREE.Vector3(0, 1, 0), occupantId: null });
                                onRender();
                            }}>+ Add Seat Socket</button>
                    {selectedObject.seats.map((seat: any, i: number) => (
                        <div key={i} style="margin-top: 5px; font-size: 9px; color: #888;">{seat.name} (Socket {i})</div>
                    ))}
                </div>
            )}

            <div class="prop-row">
                <div class="prop-label" style="font-size: 9px;">Is Weapon</div>
                <input type="checkbox" checked={selectedObject.isWeapon} 
                       onChange={(e: any) => {
                           engine.history.execute(new SetPropertyCommand(selectedObject, 'isWeapon', e.target.checked));
                           onRender();
                       }} />
            </div>

            {selectedObject.isWeapon && (
                <div style="background: #222; padding: 10px; border-radius: 4px; margin-top: 8px;">
                    <div class="prop-row">
                        <div class="prop-label">Weapon Mode</div>
                        <select value={selectedObject.weaponMode} onChange={(e: any) => { selectedObject.weaponMode = e.target.value; onRender(); }}>
                            <option value="physical">Physical Projectile</option>
                            <option value="hitscan">Instant Hitscan</option>
                        </select>
                    </div>
                    <div class="prop-row">
                        <div class="prop-label">Damage</div>
                        <input type="number" value={selectedObject.damage.toString()} 
                               onChange={(e: any) => { engine.history.execute(new SetPropertyCommand(selectedObject, 'damage', parseInt(e.target.value))); onRender(); }} />
                    </div>
                    <div class="prop-row">
                        <div class="prop-label">Fire Delay</div>
                        <input type="number" step="0.1" value={selectedObject.fireRate.toString()} 
                               onChange={(e: any) => { engine.history.execute(new SetPropertyCommand(selectedObject, 'fireRate', parseFloat(e.target.value))); onRender(); }} />
                    </div>
                </div>
            )}

            <div class="prop-row">
                <div class="prop-label" style="font-size: 9px;">Sync to Network</div>
                <input type="checkbox" checked={selectedObject.syncTransform} 
                       onChange={(e: any) => {
                           engine.history.execute(new SetPropertyCommand(selectedObject, 'syncTransform', e.target.checked));
                           onRender();
                       }} />
            </div>
        </div>
    );
};
