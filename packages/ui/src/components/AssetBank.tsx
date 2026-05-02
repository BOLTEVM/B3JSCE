/** @jsx webjsx.h */
import * as webjsx from 'webjsx';
import { ASSET_BANK } from '@b3js/engine';

let searchFilter = '';
let openCategory: string | null = 'Primitives'; // Default open category
let aiTranscript = '';
let aiResponse = '';
let isListening = false;
let isInventoryView = false; 

export const AssetBank = ({ engine, onRender }: any) => {
    const categories = ['Furniture', 'Props', 'Primitives', 'Web3', 'Lights', 'Robotics', 'Pickups'];
    
    const filtered = ASSET_BANK.filter(a => {
        const matchesSearch = a.name.toLowerCase().includes(searchFilter.toLowerCase()) || 
                             a.category.toLowerCase().includes(searchFilter.toLowerCase()) ||
                             (a.description && a.description.toLowerCase().includes(searchFilter.toLowerCase()));
        return matchesSearch;
    });

    const toggleAI = () => {
        engine.voiceManager.toggle(
            (text: string, resp: string) => {
                aiTranscript = text;
                aiResponse = resp;
                if (onRender) onRender();
                setTimeout(() => {
                    aiTranscript = '';
                    aiResponse = '';
                    if (onRender) onRender();
                }, 4000);
            },
            (status: boolean) => {
                isListening = status;
                if (onRender) onRender();
            }
        );
    };

    const spawn = async (id: string) => {
        await engine.spawnAsset(id);
    };

    return (
        <div style="width: 100%; height: 100%; display: flex; flex-direction: column; background: #0a0a0a; position: relative; overflow: hidden; font-family: 'Inter', sans-serif; border-left: 1px solid #1a1a1a;">
            
            {/* Header / Search */}
            <div style="padding: 16px; border-bottom: 1px solid #1a1a1a; display: flex; flex-direction: column; gap: 12px; background: rgba(0,0,0,0.4); backdrop-filter: blur(20px);">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                    <span style="font-size: 10px; font-weight: 900; color: #555; text-transform: uppercase; letter-spacing: 1.5px;">Asset Catalog</span>
                    <button 
                        onClick={() => { isInventoryView = !isInventoryView; if(onRender) onRender(); }}
                        style={`
                            background: ${isInventoryView ? '#6366f1' : 'transparent'};
                            border: 1px solid ${isInventoryView ? '#6366f1' : '#333'}; 
                            border-radius: 4px; color: ${isInventoryView ? '#fff' : '#888'}; padding: 4px 8px;
                            font-size: 8px; font-weight: 800; cursor: pointer; text-transform: uppercase;
                            letter-spacing: 0.5px; transition: all 0.2s;
                        `}>
                        {isInventoryView ? 'Inventory' : 'Editor'}
                    </button>
                </div>

                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="flex: 1; position: relative;">
                        <input type="text" placeholder="Search 3D library..." 
                               style={`width: 100%; padding: 10px 15px; background: #000; border: 1px solid #222; color: #fff; border-radius: 8px; font-size: 11px; outline: none; transition: all 0.2s; border-color: ${searchFilter ? '#6366f1' : '#222'};`}
                               value={searchFilter}
                               onInput={(e: any) => {
                                   searchFilter = e.target.value;
                                   if (onRender) onRender();
                               }} />
                        {searchFilter && (
                            <div onClick={() => { searchFilter = ''; if(onRender) onRender(); }} 
                                 style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); cursor: pointer; color: #555; font-size: 12px; font-weight: 800;">✕</div>
                        )}
                    </div>
                    
                    <button 
                        onClick={toggleAI}
                        class={isListening ? 'voice-btn-active' : ''}
                        style={`
                            width: 36px; height: 36px; border-radius: 50%; border: none; cursor: pointer;
                            display: flex; align-items: center; justify-content: center; font-size: 18px;
                            background: ${isListening ? 'linear-gradient(135deg, #ef4444, #ec4899)' : 'linear-gradient(135deg, #333, #222)'};
                            box-shadow: ${isListening ? '0 0 20px rgba(239, 68, 68, 0.3)' : '0 4px 10px rgba(0,0,0,0.3)'};
                            transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                            transform: ${isListening ? 'scale(1.1)' : 'scale(1)'};
                            color: ${isListening ? '#fff' : '#666'};
                        `}>
                        {isListening ? '🎙️' : '🤖'}
                    </button>
                </div>
            </div>

            {/* Accordion List */}
            <div style="flex: 1; overflow-y: auto; padding: 10px; scrollbar-width: thin;">
                {categories.map(cat => {
                    const catItems = filtered.filter(i => i.category === cat);
                    if (catItems.length === 0 && searchFilter) return null;
                    const isOpen = openCategory === cat || searchFilter.length > 0;

                    return (
                        <div style="margin-bottom: 12px;">
                            {/* Accordion Header */}
                            <div 
                                onClick={() => { openCategory = (openCategory === cat ? null : cat); if (onRender) onRender(); }}
                                style={`
                                    display: flex; align-items: center; justify-content: space-between;
                                    padding: 8px 12px; background: ${isOpen ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.02)'};
                                    border-radius: 8px; cursor: pointer; transition: all 0.2s;
                                    border: 1px solid ${isOpen ? 'rgba(99,102,241,0.2)' : 'transparent'};
                                `}>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style={`font-size: 8px; transition: transform 0.2s; transform: rotate(${isOpen ? '90deg' : '0deg'}); color: #555;`}>▶</span>
                                    <span style={`font-size: 10px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; color: ${isOpen ? '#fff' : '#666'};`}>
                                        {cat}
                                    </span>
                                </div>
                                <span style="font-size: 9px; color: #444; font-weight: 900;">{catItems.length}</span>
                            </div>

                            {/* Accordion Content */}
                            {isOpen && (
                                <div style="padding: 6px 0 0 10px; display: flex; flex-direction: column; gap: 4px; animation: slideIn 0.2s ease-out;">
                                    {catItems.map(item => (
                                        <div 
                                            onClick={() => spawn(item.id)}
                                            class="asset-list-item"
                                            style="display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 8px; cursor: pointer; transition: all 0.15s; position: relative; overflow: hidden;">
                                            
                                            <div style="font-size: 20px; min-width: 30px; display: flex; justify-content: center;">{item.icon}</div>
                                            
                                            <div style="flex: 1; display: flex; flex-direction: column; gap: 1px;">
                                                <div style="font-size: 11px; font-weight: 700; color: #ddd;">{item.name}</div>
                                                <div style="font-size: 9px; color: #555; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{item.description}</div>
                                                
                                                {isInventoryView && item.inventory && (
                                                    <div style="margin-top: 4px; display: flex; gap: 4px;">
                                                        <span style="font-size: 8px; color: #6366f1; background: #6366f111; padding: 1px 4px; border-radius: 3px;">{item.inventory.weight}KG</span>
                                                        {item.inventory.stackable && <span style="font-size: 8px; color: #f59e0b; background: #f59e0b11; padding: 1px 4px; border-radius: 3px;">STACK</span>}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Quick Actions overlay on hover via CSS */}
                                            <div class="item-action-hint" style="font-size: 16px; opacity: 0; transform: translateX(10px); transition: all 0.2s;">✨</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Footer Tip */}
            <div style="padding: 12px; background: rgba(0,0,0,0.3); border-top: 1px solid #1a1a1a; display: flex; flex-direction: column; gap: 5px;">
                <div style="font-size: 9px; color: #444; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; text-align: center;">
                    Click to Spawn at Center
                </div>
                {engine.isAdmin && (
                    <div style="display: flex; align-items: center; justify-content: center; gap: 6px;">
                        <span style="font-size: 8px; font-weight: 800; color: #333;">Allow Player AI</span>
                        <input type="checkbox" 
                               style="width: 10px; height: 10px;"
                               checked={engine.allowPlayerVoiceAI} 
                               onChange={() => { engine.allowPlayerVoiceAI = !engine.allowPlayerVoiceAI; if (onRender) onRender(); }} />
                    </div>
                )}
            </div>

            {/* AI HUD Overlay */}
            {(isListening || aiTranscript) && (
                <div style={`
                    position: absolute; left: 50%; bottom: 80px; transform: translateX(-50%);
                    width: 90%; background: rgba(10, 10, 15, 0.95); border: 1px solid rgba(99, 102, 241, 0.2);
                    border-radius: 12px; padding: 15px; backdrop-filter: blur(20px); z-index: 100;
                    display: flex; flex-direction: column; gap: 8px; box-shadow: 0 10px 40px rgba(0,0,0,0.8);
                    animation: slideUp 0.3s ease-out;
                `}>
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div class={isListening ? 'listening-indicator' : ''} style={`width: 6px; height: 6px; border-radius: 50%; background: ${isListening ? '#ef4444' : '#6366f1'};`}></div>
                            <span style="font-size: 9px; font-weight: 900; color: #555; text-transform: uppercase; letter-spacing: 1px;">
                                {isListening ? 'Listening...' : 'Processed'}
                            </span>
                        </div>
                    </div>
                    
                    <div style="font-size: 13px; color: #fff; font-weight: 500; line-height: 1.4; font-style: italic;">
                        "{aiTranscript || '...'}"
                    </div>
                    
                    {aiResponse && (
                        <div style="font-size: 11px; color: #6366f1; font-weight: 700; border-top: 1px solid #222; padding-top: 8px; display: flex; align-items: center; gap: 6px;">
                            <span style="font-size: 14px;">✨</span> {aiResponse}
                        </div>
                    )}
                </div>
            )}

            <style>{`
                @keyframes slideIn {
                    from { opacity: 0; transform: translateY(-5px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes slideUp {
                    from { opacity: 0; transform: translate(-50%, 10px); }
                    to { opacity: 1; transform: translate(-50%, 0); }
                }
                @keyframes pulse {
                    0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
                    70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
                }
                .voice-btn-active {
                    animation: pulse 2s infinite !important;
                }
                .listening-indicator {
                    animation: pulse 1s infinite;
                }
                .asset-list-item:hover {
                    background: rgba(255,255,255,0.05) !important;
                }
                .asset-list-item:hover .item-action-hint {
                    opacity: 1 !important;
                    transform: translateX(0) !important;
                }
                .asset-list-item:active {
                    background: rgba(99,102,241,0.1) !important;
                    transform: scale(0.98);
                }
            `}</style>
        </div>
    );
};
