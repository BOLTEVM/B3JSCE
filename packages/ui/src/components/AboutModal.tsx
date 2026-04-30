import * as webjsx from 'webjsx';

export const AboutModal = ({ isOpen, onClose }: any) => {
    if (!isOpen) return <div />;

    return (
        <div class="modal-overlay" onClick={onClose} style="z-index: 10001;">
            <div class="modal-content" onClick={(e: any) => e.stopPropagation()} style="max-width: 500px; text-align: center; padding: 50px; background: #0f172a; color: #f1f5f9;">
                <img src="./0logov3.png" width="120" style="margin-bottom: 20px; filter: drop-shadow(0 0 15px #00d4ff);" />
                <h1 style="font-size: 24px; font-weight: 900; margin-bottom: 5px;">B3JS Engine</h1>
                <div style="font-size: 14px; opacity: 0.6; margin-bottom: 25px;">The Next-Generation Web3-Native 3D Engine</div>
                
                <div style="background: #1e293b; padding: 20px; border-radius: 12px; margin-bottom: 30px; text-align: left; font-size: 13px;">
                    <div style="margin-bottom: 10px;"><strong>Version:</strong> 1.0.4-stable (Boltevm Release)</div>
                    <div style="margin-bottom: 10px;"><strong>Kernel:</strong> Three.js R160 / Cannon-es 0.20</div>
                    <div style="margin-bottom: 10px;"><strong>Logic System:</strong> B3 Nodal Logic V2</div>
                    <div style="margin-bottom: 10px;"><strong>Multiplayer:</strong> SpacetimeDB Real-time Sync</div>
                </div>

                <p style="font-size: 12px; line-height: 1.6; opacity: 0.8; margin-bottom: 30px;">
                    B3JS is built for the decentralized world, enabling high-fidelity 3D experiences with native Web3 integration and high-performance ECS logic.
                </p>

                <button onClick={onClose} style="background: #00d4ff; color: #000; border: none; padding: 12px 30px; border-radius: 6px; font-weight: bold; cursor: pointer;">CLOSE</button>
                
                <div style="margin-top: 40px; font-size: 10px; opacity: 0.4;">
                    © 2026 B3JS Team. All rights reserved.
                </div>
            </div>
        </div>
    );
};
