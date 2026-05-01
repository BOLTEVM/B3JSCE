/** @jsx webjsx.h */
import * as webjsx from 'webjsx';
import { ASSET_BANK } from '@b3js/engine';
import { VoiceManager } from '../services/VoiceManager';

let searchFilter = '';
let activeCategory = 'All';
let aiTranscript = '';
let aiResponse = '';
let isListening = false;
let isInventoryView = false; // Phase 4: Toggle between Editor and Inventory stats
let voiceManager: VoiceManager | null = null;

export const AssetBank = ({ engine, onRender }: any) => {
    if (!voiceManager) {
        voiceManager = new VoiceManager(engine);
    }

    const categories = ['All', 'Furniture', 'Props', 'Primitives', 'Web3', 'Lights', 'Robotics', 'Pickups'];
    
    const filtered = ASSET_BANK.filter(a => {
        const matchesSearch = a.name.toLowerCase().includes(searchFilter.toLowerCase()) || 
                             a.category.toLowerCase().includes(searchFilter.toLowerCase());
        const matchesCat = activeCategory === 'All' || a.category === activeCategory;
        return matchesSearch && matchesCat;
    });

    const toggleAI = () => {
        voiceManager?.toggle(
            (text, resp) => {
                aiTranscript = text;
                aiResponse = resp;
                if (onRender) onRender();
                setTimeout(() => {
                    aiTranscript = '';
                    aiResponse = '';
                    if (onRender) onRender();
                }, 4000);
            },
            (status) => {
                isListening = status;
                if (onRender) onRender();
            }
        );
    };

    const spawn = async (id: string) => {
        await engine.spawnAsset(id);
    };

    return (
        <div style="width: 100%; height: 100%; display: flex; flex-direction: column; background: #111; position: relative; overflow: hidden; font-family: 'Inter', sans-serif;">
            
            {/* Header / Search */}
            <div style="padding: 16px; border-bottom: 1px solid #222; display: flex; align-items: center; gap: 15px; background: rgba(255,255,255,0.01); backdrop-filter: blur(10px);">
                <div style="flex: 1; position: relative;">
                    <input type="text" placeholder="Search 3D library..." 
                           style="width: 100%; padding: 10px 15px; background: #000; border: 1px solid #333; color: #fff; border-radius: 8px; font-size: 11px; outline: none; transition: border-color 0.2s;"
                           value={searchFilter}
                           onInput={(e: any) => {
                               searchFilter = e.target.value;
                               if (onRender) onRender();
                           }} />
                </div>

                {/* View Toggle (Phase 4) */}
                <button 
                    onClick={() => { isInventoryView = !isInventoryView; if(onRender) onRender(); }}
                    style={`
                        background: ${isInventoryView ? '#6366f1' : '#222'};
                        border: 1px solid #444; border-radius: 6px; color: #fff; padding: 8px 12px;
                        font-size: 9px; font-weight: 800; cursor: pointer; text-transform: uppercase;
                        letter-spacing: 0.5px; transition: all 0.2s;
                    `}>
                    {isInventoryView ? 'Inventory View' : 'Editor View'}
                </button>
                
                {/* Voice AI Button */}
                <div style="display: flex; align-items: center; gap: 10px;">
                    {engine.isAdmin && (
                        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 2px;">
                            <span style="font-size: 8px; font-weight: 800; color: #555; text-transform: uppercase;">Player AI</span>
                            <input type="checkbox" 
                                   checked={engine.allowPlayerVoiceAI} 
                                   onChange={() => { engine.allowPlayerVoiceAI = !engine.allowPlayerVoiceAI; if (onRender) onRender(); }} />
                        </div>
                    )}
                    <button 
                        onClick={toggleAI}
                        class={isListening ? 'voice-btn-active' : ''}
                        style={`
                            width: 40px; height: 40px; border-radius: 50%; border: none; cursor: pointer;
                            display: flex; align-items: center; justify-content: center; font-size: 20px;
                            background: ${isListening ? 'linear-gradient(135deg, #ef4444, #ec4899)' : 'linear-gradient(135deg, #6366f1, #a855f7)'};
                            box-shadow: ${isListening ? '0 0 25px rgba(239, 68, 68, 0.4)' : '0 10px 20px rgba(0,0,0,0.4)'};
                            transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                            transform: ${isListening ? 'scale(1.1)' : 'scale(1)'};
                        `}>
                        {isListening ? '🎙️' : '🤖'}
                    </button>
                </div>
            </div>

            {/* Categories */}
            <div style="display: flex; gap: 10px; padding: 12px 16px; overflow-x: auto; scrollbar-width: none; background: rgba(0,0,0,0.2);">
                {categories.map(cat => (
                    <button 
                        onClick={() => { activeCategory = cat; if (onRender) onRender(); }}
                        style={`
                            padding: 6px 14px; border-radius: 6px; font-size: 10px; font-weight: 800; white-space: nowrap; cursor: pointer;
                            border: 1px solid ${activeCategory === cat ? '#6366f1' : '#333'};
                            background: ${activeCategory === cat ? '#6366f1' : 'rgba(255,255,255,0.02)'};
                            color: ${activeCategory === cat ? '#fff' : '#888'};
                            text-transform: uppercase; letter-spacing: 0.5px; transition: all 0.2s;
                        `}>
                        {cat}
                    </button>
                ))}
            </div>

            {/* Main Grid */}
            <div style="flex: 1; padding: 20px; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 20px; align-content: start;">
                {filtered.map(item => (
                    <div 
                        onClick={() => spawn(item.id)}
                        class="asset-card"
                        style="background: #181818; border: 1px solid #222; border-radius: 14px; padding: 15px; cursor: pointer; transition: all 0.2s; display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; position: relative; overflow: hidden;">
                        
                        <div style="font-size: 38px; filter: drop-shadow(0 8px 15px rgba(0,0,0,0.6)); transition: transform 0.2s;">{item.icon}</div>
                        
                        <div style="width: 100%;">
                            <div style="font-size: 11px; font-weight: 800; color: #fff; letter-spacing: 0.2px;">{item.name}</div>
                            
                            {/* Inventory Stats Overlay (Phase 4) */}
                            {isInventoryView && item.inventory ? (
                                <div style="margin-top: 8px; display: flex; flex-wrap: wrap; justify-content: center; gap: 4px;">
                                    <span style="background: #222; color: #6366f1; padding: 2px 6px; border-radius: 4px; font-size: 8px; font-weight: 900; border: 1px solid #6366f144;">
                                        {item.inventory.weight}KG
                                    </span>
                                    <span style="background: #222; color: #10b981; padding: 2px 6px; border-radius: 4px; font-size: 8px; font-weight: 900; border: 1px solid #10b98144;">
                                        {item.inventory.category}
                                    </span>
                                    {item.inventory.stackable && (
                                        <span style="background: #222; color: #f59e0b; padding: 2px 6px; border-radius: 4px; font-size: 8px; font-weight: 900; border: 1px solid #f59e0b44;">
                                            STACK
                                        </span>
                                    )}
                                </div>
                            ) : (
                                <div style="font-size: 9px; color: #555; margin-top: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">{item.category}</div>
                            )}
                        </div>
                        
                        {/* Hover Overlay */}
                        <div class="card-overlay" style="position: absolute; inset: 0; background: linear-gradient(to bottom, transparent, rgba(99,102,241,0.2)); opacity: 0; transition: opacity 0.2s;"></div>
                    </div>
                ))}
            </div>

            {/* AI HUD Overlay */}
            {(isListening || aiTranscript) && (
                <div style={`
                    position: absolute; left: 50%; bottom: 25px; transform: translateX(-50%);
                    width: 92%; max-width: 420px; background: rgba(10, 10, 15, 0.95); border: 1px solid rgba(99, 102, 241, 0.3);
                    border-radius: 20px; padding: 20px; backdrop-filter: blur(30px); z-index: 100;
                    display: flex; flex-direction: column; gap: 10px; box-shadow: 0 30px 60px rgba(0,0,0,0.9);
                    animation: slideUp 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                `}>
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div class={isListening ? 'listening-indicator' : ''} style={`width: 10px; height: 10px; border-radius: 50%; background: ${isListening ? '#ef4444' : '#6366f1'};`}></div>
                            <span style="font-size: 10px; font-weight: 900; color: #666; text-transform: uppercase; letter-spacing: 1px;">
                                {isListening ? 'AI Pulse Active' : 'Response Latency: 42ms'}
                            </span>
                        </div>
                        <div style="font-size: 10px; color: #444; font-weight: 800;">B3JS-AI-V1</div>
                    </div>
                    
                    <div style="font-size: 15px; color: #fff; font-weight: 600; line-height: 1.4;">
                        "{aiTranscript || 'Standing by for spatial command...'}"
                    </div>
                    
                    {aiResponse && (
                        <div style="font-size: 12px; color: #6366f1; font-weight: 700; border-top: 1px solid #222; padding-top: 12px; display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 16px;">✨</span> {aiResponse}
                        </div>
                    )}
                </div>
            )}

            <style>{`
                @keyframes pulse {
                    0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.4); }
                    70% { transform: scale(1.05); box-shadow: 0 0 0 15px rgba(99, 102, 241, 0); }
                    100% { transform: scale(1); }
                }
                @keyframes slideUp {
                    from { transform: translate(-50%, 50px); opacity: 0; }
                    to { transform: translate(-50%, 0); opacity: 1; }
                }
                .voice-btn-active {
                    animation: pulse 2s infinite !important;
                }
                .listening-indicator {
                    animation: pulse 1s infinite;
                }
                .asset-card:hover {
                    background: #222 !important;
                    border-color: #6366f1 !important;
                    transform: translateY(-5px);
                    box-shadow: 0 15px 30px rgba(0,0,0,0.5);
                }
                .asset-card:hover div {
                    transform: scale(1.1);
                }
                .asset-card:hover .card-overlay {
                    opacity: 1 !important;
                }
            `}</style>
        </div>
    );
};
