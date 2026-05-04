import * as webjsx from 'webjsx';

export const HapticsPanel = ({ engine, onRender }: any) => {
    const isConnected = engine?.haptics?.getStatus();
    const devices = engine?.haptics?.getConnectedDevicesList() || [];
    
    const getAppId = () => (document.getElementById('bhaptics-appid') as HTMLInputElement)?.value || localStorage.getItem('B3JS_BHAPTICS_APP_ID') || 'com.b3js.engine';
    const getApiKey = () => (document.getElementById('bhaptics-apikey') as HTMLInputElement)?.value || localStorage.getItem('B3JS_BHAPTICS_API_KEY') || '';

    const handleUpdate = () => {
        const appId = getAppId();
        const apiKey = getApiKey();
        engine?.haptics?.updateSettings(appId, apiKey);
        setTimeout(onRender, 500); 
    };

    const testHaptic = (pos: string) => {
        engine?.haptics?.triggerDots(pos, Array(20).fill(100), 200);
    };

    const gridStyle = `background-image: radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px); background-size: 20px 20px; background-color: #0b0e14;`;

    return (
        <div style={`width: 100%; height: 100%; overflow: hidden; position: relative; ${gridStyle} display: flex; font-family: 'Inter', sans-serif;`}>
            
            {/* Header Overlay */}
            <div style="position: absolute; top: 20px; left: 20px; z-index: 10;">
                <div style="font-size: 24px; font-weight: 900; color: #fff; letter-spacing: -1px; display: flex; align-items: center; gap: 12px;">
                    <span style="background: linear-gradient(135deg, #6366f1, #a855f7); padding: 4px 10px; border-radius: 8px;">H</span>
                    BHAPTICS ORCHESTRATOR
                </div>
                <div style="font-size: 11px; color: #64748b; margin-top: 4px; font-weight: 500; text-transform: uppercase; letter-spacing: 2px;">Spatial Tactile Intelligence</div>
            </div>

            {/* Window 1: Connection & Config */}
            <div class="node-card" style="position: absolute; left: 20px; top: 100px; width: 320px; pointer-events: auto; background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(10px);">
                <div class="node-header" style="background: #6366f1; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between;">
                    <span>CONFIGURATION</span>
                    <div style={`width: 8px; height: 8px; border-radius: 50%; background: ${isConnected ? '#10b981' : '#ef4444'}; align-self: center; box-shadow: 0 0 8px ${isConnected ? '#10b981' : '#ef4444'};`}></div>
                </div>
                <div class="node-body" style="padding: 16px;">
                    <div style="margin-bottom: 12px;">
                        <label style="font-size: 9px; color: #94a3b8; margin-bottom: 4px; display: block;">APP IDENTIFIER</label>
                        <input id="bhaptics-appid" type="text" value={localStorage.getItem('B3JS_BHAPTICS_APP_ID') || 'com.b3js.engine'} 
                               style="width: 100%; background: #020617; border: 1px solid #334155; border-radius: 4px; padding: 8px; color: #fff; font-size: 12px;" />
                    </div>
                    <div style="margin-bottom: 16px;">
                        <label style="font-size: 9px; color: #94a3b8; margin-bottom: 4px; display: block;">API KEY</label>
                        <input id="bhaptics-apikey" type="password" value={localStorage.getItem('B3JS_BHAPTICS_API_KEY') || ''} 
                               style="width: 100%; background: #020617; border: 1px solid #334155; border-radius: 4px; padding: 8px; color: #fff; font-size: 12px;" />
                    </div>
                    <button onClick={handleUpdate} style="width: 100%; padding: 10px; background: #6366f1; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 11px;">
                        {isConnected ? 'RECONNECT PLAYER' : 'CONNECT TO PLAYER'}
                    </button>
                    <div style="margin-top: 10px; font-size: 9px; color: #475569; text-align: center;">Target Port: 15881 (Local)</div>
                </div>
            </div>

            {/* Window 2: Device Map */}
            <div class="node-card" style="position: absolute; left: 360px; top: 100px; width: 320px; pointer-events: auto; background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(10px);">
                <div class="node-header" style="background: #10b981; border-bottom: 1px solid rgba(255,255,255,0.1);">ACTIVE DEVICE MAP</div>
                <div class="node-body" style="padding: 16px; min-height: 120px;">
                    {devices.length === 0 ? (
                        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100px; color: #475569;">
                            <div style="font-size: 24px; margin-bottom: 8px;">📡</div>
                            <div style="font-size: 10px; font-weight: 600;">NO DEVICES DETECTED</div>
                        </div>
                    ) : (
                        <div style="display: flex; flex-direction: column; gap: 8px;">
                            {devices.map((d: any) => (
                                <div style="display: flex; justify-content: space-between; align-items: center; background: #020617; border: 1px solid #1e293b; padding: 8px 12px; border-radius: 6px;">
                                    <div>
                                        <div style="font-size: 12px; font-weight: bold; color: #fff;">{d.deviceName || d.position}</div>
                                        <div style="font-size: 9px; color: #64748b;">ID: {d.address || 'Local'}</div>
                                    </div>
                                    <div style="width: 6px; height: 6px; border-radius: 50%; background: #10b981; box-shadow: 0 0 6px #10b981;"></div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Window 3: Diagnostics & Testing */}
            <div class="node-card" style="position: absolute; left: 700px; top: 100px; width: 320px; pointer-events: auto; background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(10px);">
                <div class="node-header" style="background: #a855f7; border-bottom: 1px solid rgba(255,255,255,0.1);">HARDWARE DIAGNOSTICS</div>
                <div class="node-body" style="padding: 16px;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                        <button onClick={() => testHaptic('Vest')} style="padding: 8px; background: rgba(255,255,255,0.05); border: 1px solid #334155; color: #fff; font-size: 10px; border-radius: 4px; cursor: pointer;">Vest Body</button>
                        <button onClick={() => testHaptic('Head')} style="padding: 8px; background: rgba(255,255,255,0.05); border: 1px solid #334155; color: #fff; font-size: 10px; border-radius: 4px; cursor: pointer;">Head Band</button>
                        <button onClick={() => testHaptic('HandL')} style="padding: 8px; background: rgba(255,255,255,0.05); border: 1px solid #334155; color: #fff; font-size: 10px; border-radius: 4px; cursor: pointer;">Hand L</button>
                        <button onClick={() => testHaptic('HandR')} style="padding: 8px; background: rgba(255,255,255,0.05); border: 1px solid #334155; color: #fff; font-size: 10px; border-radius: 4px; cursor: pointer;">Hand R</button>
                        <button onClick={() => testHaptic('FootL')} style="padding: 8px; background: rgba(255,255,255,0.05); border: 1px solid #334155; color: #fff; font-size: 10px; border-radius: 4px; cursor: pointer;">Foot L (Feet)</button>
                        <button onClick={() => testHaptic('FootR')} style="padding: 8px; background: rgba(255,255,255,0.05); border: 1px solid #334155; color: #fff; font-size: 10px; border-radius: 4px; cursor: pointer;">Foot R (Feet)</button>
                    </div>
                    <button onClick={() => engine?.haptics?.stopAll()} 
                            style="margin-top: 12px; width: 100%; padding: 10px; background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; color: #ef4444; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 10px;">
                        EMERGENCY KILL
                    </button>
                </div>
            </div>

            {/* Hint Overlay */}
            <div style="position: absolute; bottom: 20px; right: 20px; color: #475569; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">
                B3JS Engine v2.4.0 • Haptic Bridge Protocol v3.1
            </div>

        </div>
    );
};
