import * as webjsx from 'webjsx';

/**
 * MiningPanel: Multi-substrate telemetry dashboard.
 * Optimized for the B3JS manual render lifecycle.
 */
export const MiningPanel = ({ engine }: any) => {
    // We use a global-on-window strategy similar to other engine panels 
    // for state that must persist across editor re-renders without hooks.
    const activeTab = (window as any)._B3_ACTIVE_MINING_TAB || 'fractal';
    const useRemote = engine?.mining?.isRemote(activeTab.toUpperCase()) ?? false;

    const setActiveTab = (tab: string) => {
        (window as any)._B3_ACTIVE_MINING_TAB = tab;
        (window as any).B3_EDITOR_INSTANCE?.render();
    };

    const toggleRemote = (val: boolean) => {
        if (engine && engine.mining) {
            engine.mining.setRemote(activeTab.toUpperCase(), val);
        }
        (window as any).B3_EDITOR_INSTANCE?.render();
    };

    const socket = engine?.mining.getSocket(activeTab.toUpperCase());
    const data = socket ? socket.telemetry : { hashrate: 0, shares_accepted: 0, shares_rejected: 0, uptime: 0, running: false };
    
    const statusText = data.running ? 'ACTIVE' : 'OFFLINE';
    const statusColor = data.running ? '#00ff88' : '#ff3366';

    const getTabColor = (tab: string) => {
        switch (tab) {
            case 'fractal': return '#FFC107'; // Amber
            case 'quai': return '#DC143C';    // Crimson
            case 'qrl': return '#FF5722';     // Deep Orange
            default: return '#00d4ff';
        }
    };

    return (
        <div style="padding: 12px; background: #0a0c1c; height: 100%; color: #eee; font-family: 'Segoe UI', sans-serif; box-sizing: border-box;">
            {/* Tab Bar */}
            <div style="display: flex; gap: 6px; margin-bottom: 12px; border-bottom: 1px solid #1a1b2e; padding-bottom: 6px;">
                {['fractal', 'quai', 'qrl'].map(tab => {
                    const tabColor = getTabColor(tab);
                    return (
                        <button 
                            onClick={() => setActiveTab(tab)}
                            style={`
                                background: ${activeTab === tab ? tabColor + '22' : 'transparent'}; 
                                border: 1px solid ${activeTab === tab ? tabColor : '#222'}; 
                                color: ${activeTab === tab ? tabColor : '#666'}; 
                                padding: 3px 10px; border-radius: 4px; cursor: pointer; 
                                text-transform: uppercase; font-size: 8px; font-weight: 800;
                                letter-spacing: 0.5px;
                            `}
                        >
                            {tab}
                        </button>
                    );
                })}
            </div>

            {/* Main Metrics Area */}
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div style="display: flex; gap: 24px;">
                    <div>
                        <div style="font-size: 8px; opacity: 0.4; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2px;">Hashrate</div>
                        <div style="font-size: 18px; font-weight: 800; color: #00d4ff; font-family: monospace;">
                            {data.hashrate.toLocaleString(undefined, { minimumFractionDigits: 2 })} 
                            <small style="font-size: 9px; margin-left: 4px; opacity: 0.6; font-weight: normal;">{activeTab === 'qrl' ? 'H/s' : 'MH/s'}</small>
                        </div>
                    </div>
                    <div>
                        <div style="font-size: 8px; opacity: 0.4; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2px;">Shares (A/R)</div>
                        <div style="font-size: 18px; font-weight: 800; color: #ddd; font-family: monospace;">
                            {data.shares_accepted} 
                            <small style="font-size: 9px; margin-left: 4px; opacity: 0.3; font-weight: normal;">/ {data.shares_rejected}</small>
                        </div>
                    </div>
                    <div>
                        <div style="font-size: 8px; opacity: 0.4; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2px;">Runtime</div>
                        <div style={`font-size: 18px; font-weight: 800; color: ${statusColor};`}>
                            {statusText}
                        </div>
                    </div>
                </div>

                {/* Remote Node Toggle & URL Input */}
                <div style="display: flex; align-items: center; gap: 8px; background: #131425; padding: 6px 10px; border-radius: 4px; border: 1px solid #1e203a; margin-top: -4px;">
                    <input 
                        type="checkbox" 
                        id="chk-remote" 
                        checked={useRemote} 
                        onInput={(e: any) => toggleRemote(e.target.checked)} 
                        style="cursor: pointer;" 
                    />
                    <label for="chk-remote" style="font-size: 8px; font-weight: 700; color: #8892b0; cursor: pointer; user-select: none;">REMOTE NODE</label>
                    {useRemote && (
                        <input 
                            type="text" 
                            placeholder="ws://ip:port" 
                            value={(window as any)[`_B3_REMOTE_URL_${activeTab.toUpperCase()}`] || ''}
                            onInput={(e: any) => {
                                (window as any)[`_B3_REMOTE_URL_${activeTab.toUpperCase()}`] = e.target.value;
                                if (engine && engine.mining && engine.mining.setRemoteUrl) {
                                    engine.mining.setRemoteUrl(activeTab.toUpperCase(), e.target.value);
                                }
                            }}
                            style="background: #0a0c1c; border: 1px solid #2e304a; color: #eee; font-size: 8px; padding: 3px 6px; border-radius: 2px; width: 120px; outline: none; font-family: monospace;"
                        />
                    )}
                </div>
            </div>

            {/* Footer Status Bar */}
            <div style="margin-top: 14px; pt: 8px; font-size: 8px; opacity: 0.25; text-transform: uppercase; letter-spacing: 1px; display: flex; justify-content: space-between; border-top: 1px solid #1a1b2e; padding-top: 6px;">
                <span>Uptime: {Math.floor(data.uptime / 60)}m {data.uptime % 60}s</span>
                <span>Substrate Engine V4.1.2_H | BOLTEVM_WATCHDOG_ON</span>
            </div>
        </div>
    );
};
