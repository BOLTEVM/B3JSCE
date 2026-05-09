import * as webjsx from 'webjsx';

export const HapticsPanel = ({ engine, onRender, isOpen, onClose }: any) => {
    if (!isOpen) return <div />;

    // Use a simple local state for tabs, persistent during open session
    if (!(window as any)._hapticsTab) (window as any)._hapticsTab = 'bhaptics';
    const activeTab = (window as any)._hapticsTab;
    const setTab = (tab: string) => { (window as any)._hapticsTab = tab; onRender(); };

    const bhapticsConnected = engine?.haptics?.getStatus();
    const bhapticsDevices = engine?.haptics?.getConnectedDevicesList() || [];
    
    const lovenseConnected = engine?.lovense?.getStatus();
    const lovenseToys = engine?.lovense?.getToys() || [];

    const protubeStatus = engine?.proTube?.getStatus() || { connected: false, device: 'None' };

    const handleBhapticsUpdate = () => {
        const appId = (document.getElementById('bhaptics-appid') as HTMLInputElement)?.value;
        const apiKey = (document.getElementById('bhaptics-apikey') as HTMLInputElement)?.value;
        engine?.haptics?.updateSettings(appId, apiKey);
        setTimeout(onRender, 500); 
    };

    const handleLovenseUpdate = () => {
        const token = (document.getElementById('lovense-token') as HTMLInputElement)?.value;
        engine?.lovense?.updateSettings(token);
        engine?.lovense?.refreshToys();
        setTimeout(onRender, 500);
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

    const tabStyle = (id: string) => `
        padding: 8px 16px;
        font-size: 11px;
        font-weight: 800;
        text-transform: uppercase;
        cursor: pointer;
        border-bottom: 2px solid ${activeTab === id ? '#6366f1' : 'transparent'};
        color: ${activeTab === id ? '#fff' : '#475569'};
        transition: all 0.2s;
    `;

    return (
        <div class="modal-overlay" onClick={onClose} style="z-index: 1000;">
            <style>{`
                .haptics-modal {
                    width: 900px;
                    max-width: 95vw;
                    height: 640px;
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
                    padding: 24px 32px 12px 32px;
                    border-bottom: 1px solid #1e293b;
                }
                .haptics-tabs {
                    display: flex;
                    gap: 12px;
                    padding: 0 32px;
                    background: #0b0e14;
                    border-bottom: 1px solid #1e293b;
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
                    overflow: hidden;
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
                }
                .init-btn {
                    width: 100%;
                    padding: 16px;
                    background: linear-gradient(135deg, #6366f1, #4f46e5);
                    color: #fff;
                    border: none;
                    border-radius: 8px;
                    font-weight: 800;
                    font-size: 11px;
                    text-transform: uppercase;
                    cursor: pointer;
                }
                .toy-card {
                    background: rgba(15, 23, 42, 0.4);
                    border: 1px solid #1e293b;
                    border-radius: 10px;
                    padding: 16px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 12px;
                }
            `}</style>

            <div class="haptics-modal" onClick={(e: any) => e.stopPropagation()}>
                <div class="haptics-header">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div>
                            <div style="font-size: 20px; font-weight: 900; color: #fff; display: flex; align-items: center; gap: 12px;">
                                <div style="width: 12px; height: 22px; background: #6366f1; border-radius: 3px;"></div>
                                HAPTIC STACK ORCHESTRATOR
                            </div>
                            <div style="font-size: 10px; color: #64748b; font-weight: 700; margin-top: 4px; letter-spacing: 2px;">MULTI-PROTOCOL HARDWARE INTERFACE</div>
                        </div>
                        <div onClick={onClose} style="width: 28px; height: 28px; border-radius: 50%; background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center; cursor: pointer; color: #64748b; font-size: 16px;">✕</div>
                    </div>
                </div>

                <div class="haptics-tabs">
                    <div style={tabStyle('bhaptics')} onClick={() => setTab('bhaptics')}>bHaptics</div>
                    <div style={tabStyle('lovense')} onClick={() => setTab('lovense')}>Lovense</div>
                    <div style={tabStyle('protube')} onClick={() => setTab('protube')}>ProTube VR</div>
                </div>

                <div class="haptics-body">
                    {/* Sidebar Configuration */}
                    <div class="config-section">
                        {activeTab === 'bhaptics' && (
                            <div style="padding: 24px; border: 1px solid #1e293b; border-radius: 12px; background: rgba(15, 23, 42, 0.4);">
                                <div class="input-group" style="margin-bottom: 20px;">
                                    <label>APPLICATION ID</label>
                                    <input id="bhaptics-appid" type="text" value={localStorage.getItem('B3JS_BHAPTICS_APP_ID') || 'com.b3js.engine'} />
                                </div>
                                <div class="input-group" style="margin-bottom: 24px;">
                                    <label>SECURE ACCESS KEY</label>
                                    <input id="bhaptics-apikey" type="password" value={localStorage.getItem('B3JS_BHAPTICS_API_KEY') || ''} placeholder="••••••••••••" />
                                </div>
                                <button class="init-btn" onClick={handleBhapticsUpdate}>
                                    {bhapticsConnected ? 'RE-SYNC HARDWARE' : 'FORCE RE-SCAN'}
                                </button>
                            </div>
                        )}

                        {activeTab === 'lovense' && (
                            <div style="padding: 24px; border: 1px solid #1e293b; border-radius: 12px; background: rgba(15, 23, 42, 0.4);">
                                <div class="input-group" style="margin-bottom: 24px;">
                                    <label>DEVELOPER TOKEN</label>
                                    <input id="lovense-token" type="password" value={localStorage.getItem('B3JS_LOVENSE_DEV_TOKEN') || ''} placeholder="Your Lovense Dev Token" />
                                </div>
                                <button class="init-btn" onClick={handleLovenseUpdate} style="background: linear-gradient(135deg, #ec4899, #db2777);">
                                    {lovenseConnected ? 'REFRESH TOYS' : 'INIT LOCAL LINK'}
                                </button>
                                <div style="margin-top: 20px; font-size: 10px; color: #64748b; line-height: 1.5;">
                                    Requires <b>Lovense Connect</b> app running on PC/Mac or Mobile. Local control uses loopback domain 127-0-0-1.lovense.club.
                                </div>
                            </div>
                        )}

                        {activeTab === 'protube' && (
                            <div style="padding: 24px; border: 1px solid #1e293b; border-radius: 12px; background: rgba(15, 23, 42, 0.4);">
                                <div style="font-size: 12px; color: #fff; font-weight: 700; margin-bottom: 12px;">WEBBluetooth Interface</div>
                                <button class="init-btn" onClick={() => engine?.proTube?.connect()} style="background: linear-gradient(135deg, #3b82f6, #2563eb);">
                                    {protubeStatus.connected ? 'DISCONNECT' : 'SCAN FOR DEVICES'}
                                </button>
                                <div style="margin-top: 16px; font-size: 10px; color: #64748b;">
                                    Device: <span style="color: #94a3b8;">{protubeStatus.device}</span>
                                </div>
                            </div>
                        )}

                        <button style="margin-top: auto; padding: 14px; background: rgba(239, 68, 68, 0.05); border: 1px solid #ef4444; color: #ef4444; border-radius: 8px; font-weight: 800; font-size: 11px; text-transform: uppercase; cursor: pointer;"
                                onClick={() => { engine?.haptics?.stopAll(); engine?.lovense?.stopAll(); }}>
                            EMERGENCY SHUTDOWN
                        </button>
                    </div>

                    {/* Main Content Area */}
                    <div class="hud-container">
                        {activeTab === 'bhaptics' && (
                            <div style="flex: 1; display: flex; flex-direction: column;">
                                <div style="padding: 24px; display: flex; justify-content: space-between;">
                                    <div>
                                        <div style="font-size: 16px; font-weight: 800; color: #fff;">BHAPTICS SPATIAL HUD</div>
                                        <div style="font-size: 10px; color: #64748b; margin-top: 4px;">Real-time node status & haptic routing</div>
                                    </div>
                                    <div style={`font-size: 12px; font-weight: 800; color: ${bhapticsConnected ? '#10b981' : '#facc15'};`}>
                                        {bhapticsConnected ? 'LINK ACTIVE' : 'SEARCHING...'}
                                    </div>
                                </div>
                                <div style="flex: 1; position: relative; display: flex; align-items: center; justify-content: center;">
                                    {/* SVG Lines */}
                                    <svg style="position: absolute; width: 100%; height: 100%; pointer-events: none;">
                                        <line x1="50%" y1="35%" x2="50%" y2="50%" stroke="#1e293b" stroke-width="2" />
                                        <line x1="50%" y1="50%" x2="35%" y2="65%" stroke="#1e293b" stroke-width="2" />
                                        <line x1="50%" y1="50%" x2="65%" y2="65%" stroke="#1e293b" stroke-width="2" />
                                    </svg>
                                    <div onClick={() => engine?.haptics?.triggerDots('Head', Array(20).fill(100))} style={`position: absolute; top: 20%; width: 60px; height: 60px; border-radius: 50%; ${limbStyle(bhapticsDevices.some((d: any) => d.position === 'Head'))}`}>HEAD</div>
                                    <div onClick={() => engine?.haptics?.triggerDots('Vest', Array(20).fill(100))} style={`position: absolute; top: 40%; width: 90px; height: 130px; border-radius: 20px; ${limbStyle(bhapticsDevices.some((d: any) => d.position === 'Vest'))}`}>VEST</div>
                                    <div onClick={() => engine?.haptics?.triggerDots('HandL', Array(20).fill(100))} style={`position: absolute; left: 20%; top: 55%; width: 50px; height: 50px; border-radius: 8px; ${limbStyle(bhapticsDevices.some((d: any) => d.position === 'HandL'))}`}>L-ARM</div>
                                    <div onClick={() => engine?.haptics?.triggerDots('HandR', Array(20).fill(100))} style={`position: absolute; right: 20%; top: 55%; width: 50px; height: 50px; border-radius: 8px; ${limbStyle(bhapticsDevices.some((d: any) => d.position === 'HandR'))}`}>R-ARM</div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'lovense' && (
                            <div style="flex: 1; padding: 32px; overflow-y: auto;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                                    <div>
                                        <div style="font-size: 16px; font-weight: 800; color: #fff;">LOVENSE DEVICE POOL</div>
                                        <div style="font-size: 10px; color: #64748b; margin-top: 4px;">Discovered toys via local Connect bridge</div>
                                    </div>
                                    <div style={`padding: 4px 10px; border-radius: 4px; font-size: 9px; font-weight: 800; background: ${lovenseConnected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'}; color: ${lovenseConnected ? '#10b981' : '#ef4444'};`}>
                                        {lovenseConnected ? 'LOCAL SERVER ONLINE' : 'SERVER OFFLINE'}
                                    </div>
                                </div>

                                {lovenseToys.length === 0 ? (
                                    <div style="height: 200px; border: 1px dashed #1e293b; border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: #334155;">
                                        <div style="font-size: 24px;">📡</div>
                                        <div style="font-size: 11px; font-weight: 600;">No toys found. Ensure Lovense Connect is open.</div>
                                    </div>
                                ) : (
                                    lovenseToys.map((toy: any) => (
                                        <div class="toy-card">
                                            <div>
                                                <div style="font-size: 13px; font-weight: 700; color: #fff;">{toy.name}</div>
                                                <div style="font-size: 10px; color: #64748b; margin-top: 2px;">{toy.type} — ID: {toy.id.substring(0, 8)}</div>
                                            </div>
                                            <div style="display: flex; align-items: center; gap: 16px;">
                                                <div style="text-align: right;">
                                                    <div style="font-size: 10px; font-weight: 800; color: #10b981;">{toy.battery}%</div>
                                                    <div style="font-size: 8px; color: #475569; text-transform: uppercase;">Battery</div>
                                                </div>
                                                <button onClick={() => engine.lovense.sendCommand('vibrate', 10, toy.id)} 
                                                        style="padding: 8px 12px; background: rgba(255,255,255,0.05); border: 1px solid #1e293b; color: #fff; border-radius: 6px; font-size: 10px; cursor: pointer;">
                                                    TEST
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}

                                <div style="margin-top: 32px; padding: 20px; background: rgba(0,0,0,0.2); border-radius: 12px; border: 1px solid #1e293b;">
                                    <div style="font-size: 11px; font-weight: 700; color: #fff; margin-bottom: 12px;">QUICK GLOBAL COMMANDS</div>
                                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                                        <button onClick={() => engine.lovense.sendCommand('vibrate', 10)} style="padding: 10px; background: #1e293b; border: none; border-radius: 6px; color: #fff; font-size: 10px; cursor: pointer;">VIBRATE ALL</button>
                                        <button onClick={() => engine.lovense.playPattern('50;100;50;100')} style="padding: 10px; background: #1e293b; border: none; border-radius: 6px; color: #fff; font-size: 10px; cursor: pointer;">PULSE ALL</button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'protube' && (
                            <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #334155;">
                                <div style="font-size: 48px; margin-bottom: 20px;">🔫</div>
                                <div style="font-size: 14px; font-weight: 700; color: #fff;">ProTubeVR ForceTube Interface</div>
                                <div style="font-size: 11px; margin-top: 8px;">Direct WebBluetooth recoil & haptic feedback</div>
                                <button onClick={() => engine.proTube?.triggerKick(1.0)} 
                                        disabled={!protubeStatus.connected}
                                        style={`margin-top: 24px; padding: 12px 24px; background: ${protubeStatus.connected ? '#6366f1' : '#1e293b'}; border: none; border-radius: 8px; color: #fff; font-weight: 800; cursor: pointer;`}>
                                    TEST RECOIL KICK
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div class="haptics-footer">
                    <div>B3JS HAPTICS CORE V2.0.0-PRO</div>
                    <div style="display: flex; gap: 24px;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <div style={`width: 6px; height: 6px; border-radius: 50%; background: ${bhapticsConnected || lovenseConnected ? '#10b981' : '#475569'};`}></div>
                            ACTIVE LINK
                        </div>
                        <div>DEVICES: {bhapticsDevices.length + lovenseToys.length}</div>
                    </div>
                </div>
            </div>
        </div>
    );
};
