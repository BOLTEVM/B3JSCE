import * as webjsx from 'webjsx';

export const SettingsModal = ({ isOpen, onClose }: any) => {
    if (!isOpen) return <div />;

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
