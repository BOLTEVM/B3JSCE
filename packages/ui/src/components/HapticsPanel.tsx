import * as webjsx from 'webjsx';

export const HapticsPanel = ({ engine, onRender, isOpen, onClose }: any) => {
    if (!isOpen) return <div />;

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

    const limbStyle = (active: boolean) => `
        border: 1px solid ${active ? '#6366f1' : '#1e293b'};
        background: ${active ? 'rgba(99, 102, 241, 0.1)' : 'rgba(15, 23, 42, 0.6)'};
        color: ${active ? '#fff' : '#64748b'};
        transition: all 0.2s;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: 800;
        text-transform: uppercase;
    `;

    return (
        <div class="modal-overlay" onClick={onClose} style="z-index: 1000;">
            <style>{`
                .haptics-modal {
                    width: 900px;
                    max-width: 95vw;
                    height: 600px;
                    background: #0b0e14;
                    border: 1px solid #1e293b;
                    border-radius: 16px;
                    box-shadow: 0 24px 48px rgba(0,0,0,0.8);
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    font-family: 'Inter', sans-serif;
                }
                .haptics-header {
                    padding: 24px 32px;
                    border-bottom: 1px solid #1e293b;
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                }
                .haptics-body {
                    flex: 1;
                    display: grid;
                    grid-template-columns: 320px 1fr;
                    gap: 32px;
                    padding: 32px;
                }
                .haptics-footer {
                    padding: 12px 32px;
                    background: #020617;
                    border-top: 1px solid #1e293b;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-size: 10px;
                    color: #475569;
                    font-weight: 600;
                }
                .config-section {
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                }
                .hud-container {
                    background: rgba(2, 6, 23, 0.5);
                    border: 1px solid #1e293b;
                    border-radius: 12px;
                    position: relative;
                    display: flex;
                    flex-direction: column;
                }
                .hud-diagram {
                    flex: 1;
                    position: relative;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .input-group label {
                    display: block;
                    font-size: 10px;
                    color: #64748b;
                    font-weight: 700;
                    text-transform: uppercase;
                    margin-bottom: 8px;
                    letter-spacing: 1px;
                }
                .input-group input {
                    width: 100%;
                    background: #020617;
                    border: 1px solid #1e293b;
                    border-radius: 8px;
                    padding: 12px;
                    color: #fff;
                    font-size: 13px;
                    outline: none;
                    transition: border-color 0.2s;
                }
                .input-group input:focus {
                    border-color: #6366f1;
                }
                .init-btn {
                    width: 100%;
                    padding: 16px;
                    background: linear-gradient(135deg, #6366f1, #4f46e5);
                    color: #fff;
                    border: none;
                    border-radius: 8px;
                    font-weight: 800;
                    font-size: 13px;
                    text-transform: uppercase;
                    cursor: pointer;
                    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
                    transition: transform 0.1s;
                }
                .init-btn:active { transform: scale(0.98); }
                .emergency-btn {
                    margin-top: auto;
                    padding: 14px;
                    background: rgba(239, 68, 68, 0.05);
                    border: 1px solid #ef4444;
                    color: #ef4444;
                    border-radius: 8px;
                    font-weight: 800;
                    font-size: 11px;
                    text-transform: uppercase;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .emergency-btn:hover { background: rgba(239, 68, 68, 0.15); }
            `}</style>

            <div class="haptics-modal" onClick={(e: any) => e.stopPropagation()}>
                <div class="haptics-header">
                    <div>
                        <div style="font-size: 22px; font-weight: 900; color: #fff; display: flex; align-items: center; gap: 12px;">
                            <div style="width: 14px; height: 24px; background: #6366f1; border-radius: 3px;"></div>
                            BHAPTICS HARDWARE ORCHESTRATOR
                        </div>
                        <div style="font-size: 10px; color: #64748b; font-weight: 700; margin-top: 6px; letter-spacing: 2px;">SPATIAL FEEDBACK CONTROLLER V1.2.4</div>
                    </div>
                    <div onClick={onClose} style="width: 32px; height: 32px; border-radius: 50%; background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center; cursor: pointer; color: #64748b; font-size: 18px;">✕</div>
                </div>

                <div class="haptics-body">
                    <div class="config-section">
                        <div style="padding: 24px; border: 1px solid #1e293b; border-radius: 12px; background: rgba(15, 23, 42, 0.4);">
                            <div class="input-group" style="margin-bottom: 20px;">
                                <label>APPLICATION ID</label>
                                <input id="bhaptics-appid" type="text" value={localStorage.getItem('B3JS_BHAPTICS_APP_ID') || 'com.b3js.engine'} />
                            </div>
                            <div class="input-group" style="margin-bottom: 24px;">
                                <label>SECURE ACCESS KEY</label>
                                <input id="bhaptics-apikey" type="password" value={localStorage.getItem('B3JS_BHAPTICS_API_KEY') || ''} placeholder="••••••••••••" />
                            </div>
                            <button class="init-btn" onClick={handleUpdate}>
                                {isConnected ? 'RE-SYNC HARDWARE' : 'FORCE RE-SCAN HARDWARE'}
                            </button>
                        </div>

                        <div style="padding: 20px; border: 1px solid #1e293b; border-radius: 12px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                                <span style="font-size: 10px; font-weight: 700; color: #64748b; letter-spacing: 1px;">ACTIVE STACK</span>
                                <span style={`font-size: 10px; font-weight: 800; color: ${isConnected ? '#10b981' : '#facc15'}; text-transform: uppercase;`}>
                                    {isConnected ? 'CONNECTED' : 'AUTO-SCANNING'}
                                </span>
                            </div>
                            <div style="height: 60px; border: 1px dashed #1e293b; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                                <div style="font-size: 10px; color: #334155; font-style: italic;">
                                    {isConnected ? `${devices.length} Devices in active routing table` : 'Searching for local BHaptics Player...'}
                                </div>
                            </div>
                        </div>

                        <button class="emergency-btn" onClick={() => engine?.haptics?.stopAll()}>
                            EMERGENCY SHUTDOWN
                        </button>
                    </div>

                    <div class="hud-container">
                        <div style="padding: 24px 32px; display: flex; justify-content: space-between; align-items: flex-start;">
                            <div>
                                <div style="font-size: 16px; font-weight: 800; color: #fff; letter-spacing: 1px;">SPATIAL DISTRIBUTION HUD</div>
                                <div style="font-size: 10px; color: #64748b; margin-top: 4px;">Real-time node status & haptic routing</div>
                            </div>
                            <div style="display: flex; gap: 24px;">
                                <div>
                                    <div style="font-size: 9px; font-weight: 700; color: #475569; text-transform: uppercase; text-align: right;">LATENCY</div>
                                    <div style="font-size: 16px; font-weight: 800; color: #1e293b; text-align: right;">-- ms</div>
                                </div>
                                <div>
                                    <div style="font-size: 9px; font-weight: 700; color: #475569; text-transform: uppercase; text-align: right;">X-LINK</div>
                                    <div style={`font-size: 16px; font-weight: 800; color: ${isConnected ? '#00ff88' : '#ef4444'}; text-align: right;`}>{isConnected ? 'ACTIVE' : 'IDLE'}</div>
                                </div>
                            </div>
                        </div>

                        <div class="hud-diagram">
                            {/* SVG Lines */}
                            <svg style="position: absolute; width: 100%; height: 100%; pointer-events: none;">
                                <line x1="50%" y1="35%" x2="50%" y2="50%" stroke="#1e293b" stroke-width="2" />
                                <line x1="50%" y1="50%" x2="35%" y2="65%" stroke="#1e293b" stroke-width="2" />
                                <line x1="50%" y1="50%" x2="65%" y2="65%" stroke="#1e293b" stroke-width="2" />
                                <line x1="35%" y1="65%" x2="35%" y2="75%" stroke="#1e293b" stroke-width="2" />
                                <line x1="65%" y1="65%" x2="65%" y2="75%" stroke="#1e293b" stroke-width="2" />
                            </svg>

                            {/* Head */}
                            <div onClick={() => testHaptic('Head')} 
                                 style={`position: absolute; top: 20%; width: 60px; height: 60px; border-radius: 50%; ${limbStyle(devices.some((d: any) => d.position === 'Head'))}`}>
                                HEAD
                            </div>

                            {/* Vest */}
                            <div onClick={() => testHaptic('Vest')} 
                                 style={`position: absolute; top: 40%; width: 100px; height: 140px; border-radius: 20px; ${limbStyle(devices.some((d: any) => d.position === 'Vest'))}`}>
                                VEST
                            </div>

                            {/* Arms/Hands */}
                            <div onClick={() => testHaptic('HandL')} 
                                 style={`position: absolute; left: 25%; top: 60%; width: 60px; height: 60px; border-radius: 8px; ${limbStyle(devices.some((d: any) => d.position === 'HandL'))}`}>
                                L-GLOVE
                            </div>
                            <div onClick={() => testHaptic('HandR')} 
                                 style={`position: absolute; right: 25%; top: 60%; width: 60px; height: 60px; border-radius: 8px; ${limbStyle(devices.some((d: any) => d.position === 'HandR'))}`}>
                                R-GLOVE
                            </div>

                            {/* Feet */}
                            <div onClick={() => testHaptic('FootL')} 
                                 style={`position: absolute; left: 35%; bottom: 10%; width: 50px; height: 40px; border-radius: 6px; ${limbStyle(devices.some((d: any) => d.position === 'FootL'))}`}>
                                L-FOOT
                            </div>
                            <div onClick={() => testHaptic('FootR')} 
                                 style={`position: absolute; right: 35%; bottom: 10%; width: 50px; height: 40px; border-radius: 6px; ${limbStyle(devices.some((d: any) => d.position === 'FootR'))}`}>
                                R-FOOT
                            </div>
                        </div>

                        <div style="padding: 20px 32px; border-top: 1px solid #1e293b; display: flex; gap: 12px; overflow-x: auto;">
                            {devices.map((d: any) => (
                                <div style="flex-shrink: 0; padding: 6px 12px; background: rgba(0,0,0,0.3); border: 1px solid #1e293b; border-radius: 4px; font-size: 9px; color: #475569; display: flex; align-items: center; gap: 6px;">
                                    <div style="width: 4px; height: 4px; border-radius: 50%; background: #10b981;"></div>
                                    {d.deviceName || d.position}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div class="haptics-footer">
                    <div>B3JS HAPTICS CORE V1.2.4-STABLE</div>
                    <div style="display: flex; gap: 24px;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <div style={`width: 6px; height: 6px; border-radius: 50%; background: ${isConnected ? '#10b981' : '#475569'};`}></div>
                            WS LINK ACTIVE
                        </div>
                        <div>STACK: {devices.length}</div>
                    </div>
                </div>
            </div>
        </div>
    );
};
