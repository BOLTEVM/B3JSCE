import * as webjsx from 'webjsx';

import { getCSharpCompileMode, setCSharpCompileMode } from '@b3js/engine';
import { COLOR_SCHEMES, getActiveScheme, setActiveScheme } from '../store/colorScheme';

export const SettingsModal = ({ isOpen, onClose, onRender, engine }: any) => {
    if (!isOpen) return <div />;

    const paletteMode = localStorage.getItem('B3JS_PALETTE_MODE') || 'list';
    const wireOpacity = localStorage.getItem('B3JS_WIRE_OPACITY') || '0.8';
    const wireColorMode = localStorage.getItem('B3JS_WIRE_COLOR_MODE') || 'typed';
    const wireCustomColor = localStorage.getItem('B3JS_WIRE_CUSTOM_COLOR') || '#e68523';
    const customAssetsUrl = localStorage.getItem('B3JS_CUSTOM_ASSETS_URL') || '';
    const activeScheme = getActiveScheme();

    const saveAssetUrl = (url: string) => {
        localStorage.setItem('B3JS_CUSTOM_ASSETS_URL', url);
        if (engine && url) {
            engine.loadCustomAssetBank(url);
        }
        onRender && onRender();
    };

    return (
        <div class="modal-overlay" onClick={onClose}>
            <div class="modal-content" onClick={(e: any) => e.stopPropagation()}>
                <div class="modal-header">
                    <div style="font-size: 18px; font-weight: bold; color: #00d4ff;">⚙ Engine Settings Dashboard</div>
                    <span class="close-btn" onClick={onClose}>✕</span>
                </div>
                
                <div class="setting-card" style="border-left-color: #00d4ff;">
                    <div class="setting-title">Rendering & Performance</div>
                    <div class="prop-row">
                        <div class="prop-label">Antialiasing</div>
                        <div class="prop-value">ENABLED (FXAA)</div>
                    </div>
                    <div class="prop-row">
                        <div class="prop-label">Physics Step</div>
                        <div class="prop-value">60Hz (Deterministic)</div>
                    </div>
                </div>

                <div class="setting-card" style="border-left-color: #00ff88;">
                    <div class="setting-title">Asset Pipeline</div>
                    <div class="prop-row" style="flex-direction: column; align-items: flex-start; gap: 8px;">
                        <div class="prop-label" style="width: 100%;">Custom Asset Bank URL</div>
                        <div style="display: flex; width: 100%; gap: 8px;">
                            <input 
                                type="text" 
                                placeholder="https://example.com/assets.json" 
                                value={customAssetsUrl} 
                                style="flex: 1; padding: 6px 10px; background: #000; border: 1px solid #333; color: #fff; font-size: 11px; border-radius: 4px; outline: none;"
                                onInput={(e: any) => {
                                    localStorage.setItem('B3JS_CUSTOM_ASSETS_URL', e.target.value);
                                    onRender && onRender();
                                }}
                            />
                            <button 
                                onClick={() => saveAssetUrl(localStorage.getItem('B3JS_CUSTOM_ASSETS_URL') || '')}
                                style="background: #00ff88; color: #000; border: none; padding: 4px 12px; border-radius: 4px; font-size: 10px; font-weight: bold; cursor: pointer;">
                                LOAD
                            </button>
                        </div>
                        <div style="font-size: 9px; color: #555;">Must be a JSON array of AssetEntry objects.</div>
                    </div>
                </div>

                <div class="setting-card" style={`border-left-color: ${activeScheme.accent};`}>
                    <div class="setting-title">World Color Scheme</div>
                    <div class="prop-row" style="flex-wrap: wrap; gap: 6px;">
                        {COLOR_SCHEMES.map((s: any) => (
                            <div
                                title={s.name}
                                onClick={() => { setActiveScheme(s.id); onRender && onRender(); }}
                                style={`
                                    width: 28px; height: 28px; border-radius: 50%; cursor: pointer;
                                    background: ${s.accent};
                                    border: 2px solid ${activeScheme.id === s.id ? '#fff' : '#333'};
                                    box-shadow: ${activeScheme.id === s.id ? `0 0 8px ${s.accent}` : 'none'};
                                    transition: all 0.15s;
                                `}
                            />
                        ))}
                    </div>
                    <div style="margin-top: 8px; font-size: 10px; color: #888;">
                        Active: <span style={`color: ${activeScheme.accent}; font-weight: bold;`}>{activeScheme.name}</span>
                    </div>
                </div>

                <div class="setting-card" style="border-left-color: #e68523;">
                    <div class="setting-title">Scene Environment</div>
                    <div class="prop-row">
                        <div class="prop-label">Gravity</div>
                        <div class="prop-value">Y: -9.82 m/s²</div>
                    </div>
                    <div class="prop-row">
                        <div class="prop-label">Grid Mode</div>
                        <div class="prop-value">Static Cartesian</div>
                    </div>
                </div>

                <div class="setting-card" style="border-left-color: #68217a;">
                    <div class="setting-title">Scripting Environment</div>
                    <div class="prop-row">
                        <div class="prop-label">C# Compilation</div>
                        <select value={getCSharpCompileMode()} onChange={(e: any) => {
                            setCSharpCompileMode(e.target.value);
                            onRender && onRender();
                        }}>
                            <option value="client">Client (WASM / Roslyn)</option>
                            <option value="server">Server (Remote API)</option>
                        </select>
                    </div>
                </div>

                <div class="setting-card" style="border-left-color: #ff3366;">
                    <div class="setting-title">Visual Scripting UI</div>
                    <div class="prop-row">
                        <div class="prop-label">Palette Style</div>
                        <select value={paletteMode} onChange={(e: any) => {
                            localStorage.setItem('B3JS_PALETTE_MODE', e.target.value);
                            onRender && onRender();
                        }}>
                            <option value="list">Raw List</option>
                            <option value="accordion">Accordions (Collapsible)</option>
                        </select>
                    </div>
                    <div class="prop-row">
                        <div class="prop-label">Wire Opacity</div>
                        <input type="range" min="0.1" max="1.0" step="0.1" value={wireOpacity} onInput={(e: any) => {
                            localStorage.setItem('B3JS_WIRE_OPACITY', e.target.value);
                            onRender && onRender();
                        }} />
                        <span style="font-size: 10px; margin-left: 8px;">{wireOpacity}</span>
                    </div>
                    <div class="prop-row">
                        <div class="prop-label">Wire Color</div>
                        <select value={wireColorMode} onChange={(e: any) => {
                            localStorage.setItem('B3JS_WIRE_COLOR_MODE', e.target.value);
                            onRender && onRender();
                        }}>
                            <option value="typed">Typed (Pin Colors)</option>
                            <option value="custom">Custom Color</option>
                        </select>
                    </div>
                    {wireColorMode === 'custom' && (
                        <div class="prop-row">
                            <div class="prop-label">Custom Hex</div>
                            <input type="color" value={wireCustomColor} onInput={(e: any) => {
                                localStorage.setItem('B3JS_WIRE_CUSTOM_COLOR', e.target.value);
                                onRender && onRender();
                            }} />
                        </div>
                    )}
                </div>

                <div class="setting-card" style="border-left-color: #00ff88;">
                    <div class="setting-title">Web3 & Node Status</div>
                    <div class="prop-row">
                        <div class="prop-label">Miner Bridge</div>
                        <div class="prop-value" style="color: #00ff88;">CONNECTED (Localhost)</div>
                    </div>
                    <div class="prop-row">
                        <div class="prop-label">Wallet</div>
                        <div class="prop-value">0x123...456 (Mock)</div>
                    </div>
                </div>

                <div style="margin-top: 20px; font-size: 10px; opacity: 0.3; text-align: center;">
                    B3JS Engine v1.0.4-stable | Build 2026.04.18
                </div>
            </div>
        </div>
    );
};

