import * as webjsx from 'webjsx';
import type { ZKManager } from '@b3js/zk';

export const ZKPanel = ({ engine, onRender }: any) => {
    const zk = engine?.zk as ZKManager | undefined;
    if (!zk) {
        return <div style="padding: 15px; color: #ff3366;">ZKManager not initialized.</div>;
    }

    // Determine tabs inside ZKPanel (we can just have sections, or internal tabs)
    // For a complex panel, internal state for tabs is useful.
    // However, since UI is re-rendered on action, we store state in a singleton/closure for simplicity,
    // or rely on `onRender` completely.
    // Wait, the standard way in b3js UI is to just have sections, or use a local variable if needed.
    // We'll use local variables initialized once if possible, but actually we can just use a large scrolling panel.

    const config = zk.config;
    const social = engine.social;

    const commitLogs = zk.commitmentStore?.getCommitmentLog() || [];
    const recentCommits = commitLogs.slice(-10); // show last 10
    
    // UI Helpers
    const getBadgeColor = (type: string) => {
        if (type === 'position') return '#00d4ff';
        if (type === 'inventory') return '#f6ad55';
        if (type === 'bid') return '#a78bfa';
        return '#888';
    };

    return (
        <div style="padding: 15px; background: #1a1a1a; height: 100%; color: #ddd; overflow-y: auto; display: flex; flex-direction: column; gap: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; padding-bottom: 10px;">
                <div style="font-size: 14px; font-weight: bold; color: #00ff88;">
                    🛡️ Zero Knowledge Privacy Worlds
                </div>
                <div style="display: flex; gap: 10px; font-size: 10px;">
                    <span style={`color: ${zk['poseidon'] ? '#00ff88' : '#888'}`}>Poseidon</span>
                    <span style={`color: ${zk['worker'] ? '#00ff88' : '#888'}`}>Worker</span>
                </div>
            </div>

            {/* 1. Configuration */}
            <div>
                <div class="section-title" style="color: #ccc; margin-bottom: 10px; font-weight: bold;">World Config</div>
                <div style="display: flex; gap: 15px; flex-wrap: wrap;">
                    <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
                        <input type="checkbox" checked={config.fogOfWar} onChange={(e: any) => { config.fogOfWar = e.target.checked; onRender(); }} />
                        Fog of War
                    </label>
                    <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
                        <input type="checkbox" checked={config.sealedInventory} onChange={(e: any) => { config.sealedInventory = e.target.checked; onRender(); }} />
                        Sealed Inventory
                    </label>
                    <label style="display: flex; align-items: center; gap: 5px; cursor: pointer;">
                        <input type="checkbox" checked={config.sealedBids} onChange={(e: any) => { config.sealedBids = e.target.checked; onRender(); }} />
                        Sealed Bids
                    </label>
                </div>
                <div class="prop-row" style="margin-top: 10px;">
                    <div class="prop-label">Grid Resolution</div>
                    <input type="range" min="5" max="50" step="5" value={config.gridResolution.toString()} 
                        style="flex: 1; accent-color: #00ff88;"
                        onInput={(e: any) => { config.gridResolution = parseInt(e.target.value); onRender(); }} />
                    <span style="font-size: 10px; min-width: 25px; text-align: right;">{config.gridResolution}u</span>
                </div>
            </div>

            {/* 2. Commitment Log */}
            <div>
                <div class="section-title" style="color: #ccc; margin-bottom: 10px; font-weight: bold;">Local Commitment Vault</div>
                <div style="background: #111; border: 1px solid #333; border-radius: 4px; padding: 10px; min-height: 80px; max-height: 120px; overflow-y: auto; font-family: monospace; font-size: 10px;">
                    {recentCommits.length === 0 ? (
                        <div style="opacity: 0.5; text-align: center; margin-top: 20px;">No commitments generated yet.</div>
                    ) : recentCommits.map((c: any) => (
                        <div style="display: flex; justify-content: space-between; margin-bottom: 4px; border-bottom: 1px solid #222; padding-bottom: 2px;">
                            <span style={`color: ${getBadgeColor(c.type)}; background: #222; padding: 0 4px; border-radius: 2px;`}>{c.type}</span>
                            <span style="color: #00ff88;">{c.hash.substring(0, 14)}...</span>
                            <span style="color: #666;">{new Date(c.timestamp).toLocaleTimeString()}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* 3. Active Zones */}
            <div>
                <div class="section-title" style="color: #ccc; margin-bottom: 10px; font-weight: bold;">Active Privacy Zones</div>
                {zk.activeZones.length === 0 ? (
                    <div style="font-size: 10px; color: #666; font-style: italic;">No active zones in the current world.</div>
                ) : (
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        {zk.activeZones.map(z => (
                            <div style="background: #222; padding: 8px; border-radius: 4px; border-left: 3px solid #00ff88;">
                                <div style="display: flex; justify-content: space-between;">
                                    <span style="font-weight: bold; font-size: 11px;">{z.name}</span>
                                    <span style="font-size: 10px; background: #333; padding: 2px 6px; border-radius: 10px;">{z.policy}</span>
                                </div>
                                <div style="font-size: 10px; color: #aaa; margin-top: 4px;">
                                    Radius: {z.radius}u | Center: {z.center.x.toFixed(0)}, {z.center.y.toFixed(0)}, {z.center.z.toFixed(0)}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* 4. Social & Chat (Simplified view for panel) */}
            {social && (
                <div style="flex: 1; display: flex; flex-direction: column;">
                    <div class="section-title" style="color: #ccc; margin-bottom: 10px; font-weight: bold;">ZK Encrypted Social</div>
                    
                    <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                        <div style="flex: 1; background: #111; padding: 10px; border-radius: 4px; border: 1px solid #333;">
                            <div style="font-size: 10px; color: #888; margin-bottom: 5px;">Friends ({social.getFriends('accepted').length})</div>
                            <div style="max-height: 60px; overflow-y: auto;">
                                {social.getFriends('accepted').map((f: any) => (
                                    <div style="font-size: 11px; display: flex; justify-content: space-between;">
                                        <span>{f.displayName}</span>
                                        <span style={`color: ${f.online ? '#00ff88' : '#666'}`}>●</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div style="flex: 1; display: flex; flex-direction: column; background: #111; border: 1px solid #333; border-radius: 4px; overflow: hidden;">
                        <div style="background: #222; padding: 5px; font-size: 10px; display: flex; gap: 10px;">
                            <div style="color: #00ff88; font-weight: bold;">Public Chat</div>
                        </div>
                        <div style="flex: 1; min-height: 100px; max-height: 150px; overflow-y: auto; padding: 8px; font-size: 11px; display: flex; flex-direction: column; gap: 6px;">
                            {social.getMessages('public', 10).map((m: any) => (
                                <div>
                                    <span style="color: #a78bfa;">{m.senderName}: </span>
                                    <span style="color: #ccc;">{m.content}</span>
                                    {m.verified ? (
                                        <span style="color: #00ff88; margin-left: 5px; font-size: 9px;" title={`Commitment: ${m.commitment}`}>✓</span>
                                    ) : (
                                        <span style="color: #ff3366; margin-left: 5px; font-size: 9px;">⚠</span>
                                    )}
                                </div>
                            ))}
                        </div>
                        <div style="display: flex; border-top: 1px solid #333;">
                            <input type="text" placeholder="Send public message..." 
                                style="flex: 1; background: transparent; border: none; padding: 8px; color: #fff; font-size: 11px; outline: none;"
                                onKeyDown={(e: any) => {
                                    if (e.key === 'Enter' && e.target.value.trim()) {
                                        social.sendMessage(e.target.value, 'public', engine.spacetime.activeLobbyId || 'local');
                                        e.target.value = '';
                                        onRender();
                                    }
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
