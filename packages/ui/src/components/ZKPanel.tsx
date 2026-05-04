import * as webjsx from 'webjsx';
import type { ZKManager, VoiceMicMode } from '@b3js/zk';

export const ZKPanel = ({ engine, onRender }: any) => {
    const zk = engine?.zk as ZKManager | undefined;
    if (!zk) {
        return <div style="padding: 15px; color: #ff3366;">ZKManager not initialized.</div>;
    }

    const config = zk.config;
    const social = engine.social;
    const proximity = engine.proximity;

    const commitLogs = zk.commitmentStore?.getCommitmentLog() || [];
    const recentCommits = commitLogs.slice(-10);
    
    // Chat channel state (closure-based since webjsx re-renders)
    const activeChatChannel = (engine as any)._zkPanelChatChannel || 'public';
    
    const getBadgeColor = (type: string) => {
        if (type === 'position') return '#00d4ff';
        if (type === 'inventory') return '#f6ad55';
        if (type === 'bid') return '#a78bfa';
        return '#888';
    };

    const micModeLabel = (mode: VoiceMicMode) => {
        switch (mode) {
            case 'proximity': return '📡 Proximity';
            case 'broadcast': return '📢 Broadcast';
            case 'zone': return '🔒 Zone';
            case 'push_to_talk': return '🎤 Push-to-Talk';
            case 'muted': return '🔇 Muted';
            default: return mode;
        }
    };

    const micModeColor = (mode: VoiceMicMode) => {
        switch (mode) {
            case 'proximity': return '#00ff88';
            case 'broadcast': return '#ffd700';
            case 'zone': return '#00d4ff';
            case 'push_to_talk': return '#f6ad55';
            case 'muted': return '#ff3366';
            default: return '#888';
        }
    };

    const currentMicMode: VoiceMicMode = social?.voiceMicMode || 'proximity';
    const isVoiceEnabled = social?.voiceEnabled || false;
    const isAdminMuted = social?.voiceAdminMuted || false;
    const nearbyCount = social?.nearbyPlayers?.size || 0;
    const isAdmin = proximity?.isAdmin || false;

    const setChatChannel = (ch: string) => {
        (engine as any)._zkPanelChatChannel = ch;
        onRender();
    };

    return (
        <div style="padding: 12px; background: #1a1a1a; height: 100%; color: #ddd; overflow-y: auto; display: flex; flex-direction: column; gap: 14px;">
            {/* Header */}
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; padding-bottom: 8px;">
                <div style="font-size: 13px; font-weight: bold; color: #00ff88;">
                    🛡️ ZK Privacy Worlds
                </div>
                <div style="display: flex; gap: 10px; font-size: 9px;">
                    <span style={`color: ${zk['poseidon'] ? '#00ff88' : '#888'}`}>Poseidon</span>
                    <span style={`color: ${zk['worker'] ? '#00ff88' : '#888'}`}>Worker</span>
                    <span style={`color: ${isVoiceEnabled ? '#00ff88' : '#888'}`}>Voice</span>
                    <span style="color: #aaa;">Nearby: {nearbyCount}</span>
                </div>
            </div>

            {/* 1. World Config */}
            <div>
                <div style="color: #aaa; margin-bottom: 6px; font-weight: bold; font-size: 10px; text-transform: uppercase; letter-spacing: 1px;">World Config</div>
                <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                    <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; font-size: 10px;">
                        <input type="checkbox" checked={config.fogOfWar} onChange={(e: any) => { config.fogOfWar = e.target.checked; onRender(); }} />
                        Fog of War
                    </label>
                    <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; font-size: 10px;">
                        <input type="checkbox" checked={config.sealedInventory} onChange={(e: any) => { config.sealedInventory = e.target.checked; onRender(); }} />
                        Sealed Inventory
                    </label>
                    <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; font-size: 10px;">
                        <input type="checkbox" checked={config.sealedBids} onChange={(e: any) => { config.sealedBids = e.target.checked; onRender(); }} />
                        Sealed Bids
                    </label>
                </div>
                <div class="prop-row" style="margin-top: 6px; display: flex; align-items: center; gap: 8px;">
                    <div style="font-size: 10px; color: #888; min-width: 70px;">Grid Resolution</div>
                    <input type="range" min="5" max="50" step="5" value={config.gridResolution.toString()} 
                        style="flex: 1; accent-color: #00ff88;"
                        onInput={(e: any) => { config.gridResolution = parseInt(e.target.value); onRender(); }} />
                    <span style="font-size: 10px; min-width: 25px; text-align: right;">{config.gridResolution}u</span>
                </div>
            </div>

            {/* 2. Voice Controls */}
            <div>
                <div style="color: #aaa; margin-bottom: 6px; font-weight: bold; font-size: 10px; text-transform: uppercase; letter-spacing: 1px;">Voice Chat</div>
                
                {/* Admin Muted Banner */}
                {isAdminMuted && (
                    <div style="background: #3b0a0a; border: 1px solid #ff3366; border-radius: 4px; padding: 6px 10px; margin-bottom: 8px; font-size: 10px; color: #ff6688;">
                        🔇 You have been muted by the lobby admin.
                    </div>
                )}

                <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
                    {/* Enable/Disable Mic */}
                    <button 
                        style={`padding: 4px 10px; border: 1px solid ${isVoiceEnabled ? '#00ff88' : '#555'}; background: ${isVoiceEnabled ? '#0a2a15' : '#222'}; color: ${isVoiceEnabled ? '#00ff88' : '#888'}; border-radius: 4px; cursor: pointer; font-size: 10px;`}
                        onClick={() => {
                            if (isVoiceEnabled) {
                                proximity?.disableVoice();
                            } else {
                                proximity?.enableVoice();
                            }
                            onRender();
                        }}>
                        {isVoiceEnabled ? '🎙️ Mic ON' : '🎙️ Mic OFF'}
                    </button>

                    {/* Mic Mode Selector */}
                    <select 
                        style={`padding: 3px 6px; background: #222; border: 1px solid #444; color: ${micModeColor(currentMicMode)}; border-radius: 4px; font-size: 10px; cursor: pointer;`}
                        value={currentMicMode}
                        onChange={(e: any) => {
                            social?.setMicMode(e.target.value, isAdmin);
                            onRender();
                        }}>
                        <option value="proximity">📡 Proximity</option>
                        <option value="zone">🔒 Zone</option>
                        <option value="push_to_talk">🎤 Push-to-Talk (V)</option>
                        <option value="muted">🔇 Muted</option>
                        {(isAdmin || social?.hasBroadcastPermission) && (
                            <option value="broadcast">📢 Broadcast</option>
                        )}
                    </select>

                    {/* PTT Indicator */}
                    {currentMicMode === 'push_to_talk' && (
                        <span style={`font-size: 10px; padding: 2px 6px; border-radius: 10px; background: ${social?.pttActive ? '#00ff88' : '#333'}; color: ${social?.pttActive ? '#000' : '#666'};`}>
                            {social?.pttActive ? 'PTT ACTIVE' : 'Hold V'}
                        </span>
                    )}

                    {/* Broadcast Indicator */}
                    {currentMicMode === 'broadcast' && (
                        <span style="font-size: 10px; padding: 2px 6px; border-radius: 10px; background: #ffd700; color: #000; font-weight: bold; animation: pulse 1s infinite;">
                            📢 BROADCASTING
                        </span>
                    )}
                </div>

                {/* Volume Slider */}
                <div style="display: flex; align-items: center; gap: 8px; margin-top: 6px;">
                    <span style="font-size: 10px; color: #888; min-width: 50px;">Volume</span>
                    <input type="range" min="0" max="100" value={((proximity?.outputVolume || 1) * 100).toString()}
                        style="flex: 1; accent-color: #00d4ff;"
                        onInput={(e: any) => { if (proximity) proximity.outputVolume = parseInt(e.target.value) / 100; }} />
                    <span style="font-size: 10px; min-width: 25px; text-align: right;">{Math.round((proximity?.outputVolume || 1) * 100)}%</span>
                </div>

                {/* Active Peers */}
                {proximity && proximity.activePeerCount > 0 && (
                    <div style="font-size: 10px; color: #00d4ff; margin-top: 4px;">
                        🔊 {proximity.activePeerCount} active voice peer{proximity.activePeerCount > 1 ? 's' : ''}
                    </div>
                )}
            </div>

            {/* 3. Commitment Log */}
            <div>
                <div style="color: #aaa; margin-bottom: 6px; font-weight: bold; font-size: 10px; text-transform: uppercase; letter-spacing: 1px;">Local Commitment Vault</div>
                <div style="background: #111; border: 1px solid #333; border-radius: 4px; padding: 8px; min-height: 50px; max-height: 90px; overflow-y: auto; font-family: monospace; font-size: 9px;">
                    {recentCommits.length === 0 ? (
                        <div style="opacity: 0.5; text-align: center; margin-top: 12px;">No commitments generated yet.</div>
                    ) : recentCommits.map((c: any) => (
                        <div style="display: flex; justify-content: space-between; margin-bottom: 2px; border-bottom: 1px solid #222; padding-bottom: 2px;">
                            <span style={`color: ${getBadgeColor(c.type)}; background: #222; padding: 0 4px; border-radius: 2px;`}>{c.type}</span>
                            <span style="color: #00ff88;">{c.hash.substring(0, 14)}...</span>
                            <span style="color: #666;">{new Date(c.timestamp).toLocaleTimeString()}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* 4. Active Zones */}
            <div>
                <div style="color: #aaa; margin-bottom: 6px; font-weight: bold; font-size: 10px; text-transform: uppercase; letter-spacing: 1px;">Active Privacy Zones</div>
                {zk.activeZones.length === 0 ? (
                    <div style="font-size: 10px; color: #555; font-style: italic;">No active zones.</div>
                ) : (
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        {zk.activeZones.map(z => (
                            <div style="background: #222; padding: 6px; border-radius: 4px; border-left: 3px solid #00ff88;">
                                <div style="display: flex; justify-content: space-between;">
                                    <span style="font-weight: bold; font-size: 10px;">{z.name}</span>
                                    <span style="font-size: 9px; background: #333; padding: 1px 5px; border-radius: 10px;">{z.policy}</span>
                                </div>
                                <div style="font-size: 9px; color: #888; margin-top: 2px;">
                                    R:{z.radius}u | ({z.center.x.toFixed(0)}, {z.center.y.toFixed(0)}, {z.center.z.toFixed(0)})
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* 5. Social & Chat */}
            {social && (
                <div style="flex: 1; display: flex; flex-direction: column;">
                    <div style="color: #aaa; margin-bottom: 6px; font-weight: bold; font-size: 10px; text-transform: uppercase; letter-spacing: 1px;">ZK Encrypted Chat</div>
                    
                    {/* Friends */}
                    <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                        <div style="flex: 1; background: #111; padding: 6px; border-radius: 4px; border: 1px solid #333;">
                            <div style="font-size: 9px; color: #888; margin-bottom: 4px;">Friends ({social.getFriends('accepted').length})</div>
                            <div style="max-height: 40px; overflow-y: auto;">
                                {social.getFriends('accepted').map((f: any) => (
                                    <div style="font-size: 10px; display: flex; justify-content: space-between;">
                                        <span>{f.displayName}</span>
                                        <span style={`color: ${f.online ? '#00ff88' : '#555'}`}>●</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Channel Tabs */}
                    <div style="display: flex; background: #222; border-radius: 4px 4px 0 0; overflow: hidden;">
                        {['public', 'proximity', 'friends', 'whisper'].map(ch => (
                            <div 
                                style={`padding: 4px 10px; font-size: 10px; cursor: pointer; border-bottom: 2px solid ${activeChatChannel === ch ? '#00ff88' : 'transparent'}; color: ${activeChatChannel === ch ? '#00ff88' : '#888'}; flex: 1; text-align: center;`}
                                onClick={() => setChatChannel(ch)}>
                                {ch === 'proximity' ? '📍 Near' : ch === 'public' ? '🌐 Public' : ch === 'friends' ? '👥 Friends' : '💬 Whisper'}
                            </div>
                        ))}
                    </div>

                    {/* Chat Messages */}
                    <div style="flex: 1; min-height: 70px; max-height: 110px; overflow-y: auto; padding: 6px; font-size: 10px; display: flex; flex-direction: column; gap: 4px; background: #111; border: 1px solid #333; border-top: none;">
                        {social.getMessages(activeChatChannel, 15).map((m: any) => (
                            <div>
                                <span style="color: #a78bfa;">{m.senderName}: </span>
                                <span style="color: #ccc;">{m.content || '[encrypted]'}</span>
                                {m.verified ? (
                                    <span style="color: #00ff88; margin-left: 4px; font-size: 8px;" title={`Commitment: ${m.commitment}`}>✓</span>
                                ) : (
                                    <span style="color: #ff3366; margin-left: 4px; font-size: 8px;">⚠</span>
                                )}
                                {activeChatChannel === 'proximity' && social.nearbyPlayers.has(m.senderIdentity) && (
                                    <span style="color: #00d4ff; margin-left: 4px; font-size: 8px;">
                                        {social.nearbyPlayers.get(m.senderIdentity)?.distance.toFixed(0)}u
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Chat Input */}
                    <div style="display: flex; border: 1px solid #333; border-top: none; border-radius: 0 0 4px 4px; overflow: hidden;">
                        <input type="text" placeholder={`Send ${activeChatChannel} message...`}
                            style="flex: 1; background: #1a1a1a; border: none; padding: 6px 8px; color: #fff; font-size: 10px; outline: none;"
                            onKeyDown={(e: any) => {
                                if (e.key === 'Enter' && e.target.value.trim()) {
                                    const lobbyId = engine.spacetime?.activeLobbyId || 'local';
                                    if (activeChatChannel === 'proximity') {
                                        social.sendProximityMessage(e.target.value, lobbyId);
                                    } else {
                                        social.sendMessage(e.target.value, activeChatChannel, lobbyId);
                                    }
                                    e.target.value = '';
                                    onRender();
                                }
                            }}
                        />
                    </div>
                </div>
            )}

            {/* 6. Admin Voice Controls */}
            {isAdmin && (
                <div style="border-top: 1px solid #333; padding-top: 10px;">
                    <div style="color: #ffd700; margin-bottom: 6px; font-weight: bold; font-size: 10px; text-transform: uppercase; letter-spacing: 1px;">⚡ Admin Voice Controls</div>
                    
                    <div style="display: flex; gap: 6px; margin-bottom: 8px;">
                        <button 
                            style="padding: 4px 10px; background: #3b0a0a; border: 1px solid #ff3366; color: #ff6688; border-radius: 4px; cursor: pointer; font-size: 10px;"
                            onClick={() => { proximity?.adminGlobalMute(); onRender(); }}>
                            🔇 Global Mute
                        </button>
                        <button 
                            style="padding: 4px 10px; background: #0a2a15; border: 1px solid #00ff88; color: #00ff88; border-radius: 4px; cursor: pointer; font-size: 10px;"
                            onClick={() => { proximity?.adminGlobalUnmute(); onRender(); }}>
                            🔊 Unmute All
                        </button>
                    </div>

                    {/* Voice Policy */}
                    <div style="font-size: 10px; color: #888; margin-bottom: 4px;">Lobby Voice Policy</div>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap; font-size: 10px;">
                        <label style="display: flex; align-items: center; gap: 3px; cursor: pointer;">
                            <input type="checkbox" checked={config.voicePolicy.proximityEnabled} 
                                onChange={(e: any) => { config.voicePolicy.proximityEnabled = e.target.checked; onRender(); }} />
                            Proximity
                        </label>
                        <label style="display: flex; align-items: center; gap: 3px; cursor: pointer;">
                            <input type="checkbox" checked={config.voicePolicy.zoneVoiceEnabled} 
                                onChange={(e: any) => { config.voicePolicy.zoneVoiceEnabled = e.target.checked; onRender(); }} />
                            Zone Voice
                        </label>
                        <label style="display: flex; align-items: center; gap: 3px; cursor: pointer;">
                            <input type="checkbox" checked={config.voicePolicy.pttRequired} 
                                onChange={(e: any) => { config.voicePolicy.pttRequired = e.target.checked; onRender(); }} />
                            PTT Required
                        </label>
                        <label style="display: flex; align-items: center; gap: 3px; cursor: pointer;">
                            <input type="checkbox" checked={config.voicePolicy.broadcastAllowed} 
                                onChange={(e: any) => { config.voicePolicy.broadcastAllowed = e.target.checked; onRender(); }} />
                            Broadcast
                        </label>
                    </div>
                </div>
            )}
        </div>
    );
};
