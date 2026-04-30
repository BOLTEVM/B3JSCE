import * as webjsx from 'webjsx';

export const DocumentationModal = ({ isOpen, onClose }: any) => {
    if (!isOpen) return <div />;

    return (
        <div class="modal-overlay" onClick={onClose} style="z-index: 10001;">
            <div class="modal-content documentation-modal" onClick={(e: any) => e.stopPropagation()} style="max-width: 800px; height: 80vh; overflow-y: auto; padding: 40px; background: #0f172a; color: #f1f5f9; font-family: 'Inter', sans-serif;">
                <div class="modal-header" style="margin-bottom: 30px; border-bottom: 1px solid #1e293b; padding-bottom: 20px;">
                    <div style="font-size: 28px; font-weight: 900; background: linear-gradient(90deg, #00d4ff, #00ff88); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">📖 B3JS Engine Documentation</div>
                    <span class="close-btn" onClick={onClose} style="font-size: 24px; cursor: pointer; color: #64748b;">✕</span>
                </div>

                <div class="doc-section">
                    <h2 style="color: #38bdf8; border-bottom: 2px solid #38bdf8; display: inline-block; padding-right: 20px; margin-bottom: 15px;">1. Viewport Navigation</h2>
                    <p style="line-height: 1.6; opacity: 0.9;">The B3JS Viewport is an industry-standard 3D workspace. Use the following mouse interactions to navigate the environment:</p>
                    <ul style="list-style: none; padding: 0;">
                        <li style="margin-bottom: 10px;"><strong style="color: #00ff88;">Orbit:</strong> Hold <kbd style="background: #334155; padding: 2px 6px; border-radius: 4px;">Shift</kbd> + Left Mouse Click and drag to rotate the camera.</li>
                        <li style="margin-bottom: 10px;"><strong style="color: #00ff88;">Zoom:</strong> Use the Mouse Wheel to adjust the camera's FOV (Field of View).</li>
                        <li style="margin-bottom: 10px;"><strong style="color: #00ff88;">Selection:</strong> Single Left Click on any object to select it.</li>
                        <li style="margin-bottom: 10px;"><strong style="color: #00ff88;">Focus (Frame):</strong> Double Left Click on an object to instantly center and zoom the camera onto it.</li>
                    </ul>
                </div>

                <div class="doc-section" style="margin-top: 40px;">
                    <h2 style="color: #fb7185; border-bottom: 2px solid #fb7185; display: inline-block; padding-right: 20px; margin-bottom: 15px;">2. Professional Blender Keybinds</h2>
                    <p style="line-height: 1.6; opacity: 0.9;">We have implemented high-leverage Blender shortcuts to ensure a fast, standard workflow for 3D artists. Scene-editing shortcuts are paused while a modal is open or while typing into an input, select, textarea, or editable field.</p>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; background: #1e293b; padding: 20px; border-radius: 12px;">
                        <div>
                            <div style="margin-bottom: 8px;"><kbd style="background: #0f172a; padding: 2px 6px; border-radius: 4px;">G</kbd> : Grab (Translation Mode)</div>
                            <div style="margin-bottom: 8px;"><kbd style="background: #0f172a; padding: 2px 6px; border-radius: 4px;">R</kbd> : Rotate Mode</div>
                            <div style="margin-bottom: 8px;"><kbd style="background: #0f172a; padding: 2px 6px; border-radius: 4px;">S</kbd> : Scale Mode</div>
                        </div>
                        <div>
                            <div style="margin-bottom: 8px;"><kbd style="background: #0f172a; padding: 2px 6px; border-radius: 4px;">Shift + D</kbd> : Duplicate Selected Object</div>
                            <div style="margin-bottom: 8px;"><kbd style="background: #0f172a; padding: 2px 6px; border-radius: 4px;">X</kbd> or <kbd style="background: #0f172a; padding: 2px 6px; border-radius: 4px;">Delete</kbd> : Remove Object</div>
                            <div style="margin-bottom: 8px;"><kbd style="background: #0f172a; padding: 2px 6px; border-radius: 4px;">F</kbd> : Frame / Focus Selection</div>
                        </div>
                    </div>
                </div>

                <div class="doc-section" style="margin-top: 40px;">
                    <h2 style="color: #facc15; border-bottom: 2px solid #facc15; display: inline-block; padding-right: 20px; margin-bottom: 15px;">3. Help Modal & Window Controls</h2>
                    <p style="line-height: 1.6; opacity: 0.9;">The documentation window is always available from the editor shell, including when another editor panel has focus.</p>
                    <ul style="list-style: none; padding: 0;">
                        <li style="margin-bottom: 10px;"><strong style="color: #00ff88;">Open Documentation:</strong> Press <kbd style="background: #334155; padding: 2px 6px; border-radius: 4px;">F12</kbd> or choose <strong>Help - Documentation</strong> from the menu bar.</li>
                        <li style="margin-bottom: 10px;"><strong style="color: #00ff88;">Close Modal:</strong> Press <kbd style="background: #334155; padding: 2px 6px; border-radius: 4px;">Esc</kbd>, click the close control, or click outside the modal content.</li>
                        <li style="margin-bottom: 10px;"><strong style="color: #00ff88;">Shortcut Safety:</strong> While any modal is open, object-editing shortcuts such as <kbd style="background: #334155; padding: 2px 6px; border-radius: 4px;">Delete</kbd>, <kbd style="background: #334155; padding: 2px 6px; border-radius: 4px;">G</kbd>, <kbd style="background: #334155; padding: 2px 6px; border-radius: 4px;">R</kbd>, and <kbd style="background: #334155; padding: 2px 6px; border-radius: 4px;">S</kbd> are ignored so the modal does not accidentally modify the scene.</li>
                        <li style="margin-bottom: 10px;"><strong style="color: #00ff88;">Focus Handling:</strong> The editor checks inside its Shadow DOM before running shortcuts, so editing property fields or settings controls will not delete objects or change transform modes.</li>
                    </ul>
                </div>

                <div class="doc-section" style="margin-top: 40px;">
                    <h2 style="color: #a78bfa; border-bottom: 2px solid #a78bfa; display: inline-block; padding-right: 20px; margin-bottom: 15px;">4. ECS Logic & Node System</h2>
                    <p style="line-height: 1.6; opacity: 0.9;">B3JS follows an Entity-Component-System (ECS) architecture. Logic is defined via Nodal Logic Bricks:</p>
                    <ul style="list-style: none; padding: 0;">
                        <li style="margin-bottom: 15px;">
                            <strong style="color: #00ff88;">Sensors:</strong> Triggered by environmental factors (Proximity, Keyboard, Web3 Events).
                        </li>
                        <li style="margin-bottom: 15px;">
                            <strong style="color: #38bdf8;">Controllers:</strong> Evaluate logic (AND, OR, Python Scripts) to filter sensor data.
                        </li>
                        <li style="margin-bottom: 15px;">
                            <strong style="color: #fb7185;">Actuators:</strong> Execute physical or system changes (Motion, Inventory, Combat).
                        </li>
                    </ul>
                </div>

                <div class="doc-section" style="margin-top: 40px;">
                    <h2 style="color: #22d3ee; border-bottom: 2px solid #22d3ee; display: inline-block; padding-right: 20px; margin-bottom: 15px;">5. Spatial Finance (XR)</h2>
                    <p style="line-height: 1.6; opacity: 0.9;">The engine supports immersive Web3 workflows:</p>
                    <ul style="list-style: none; padding: 0;">
                        <li style="margin-bottom: 10px;"><strong style="color: #00ff88;">Bolt Tablet:</strong> Spawnable in-scene outliner for hierarchical management in XR.</li>
                        <li style="margin-bottom: 10px;"><strong style="color: #00ff88;">Swap Scale:</strong> A procedural 3D scale for executing asset swaps and verifying liquidity balances.</li>
                        <li style="margin-bottom: 10px;"><strong style="color: #00ff88;">Orderbooks:</strong> High-performance matching engine logic for limit order placement via the economics subsystem.</li>
                    </ul>
                </div>

                <div style="margin-top: 60px; text-align: center; font-size: 12px; opacity: 0.5; border-top: 1px solid #1e293b; padding-top: 20px;">
                    Press <kbd style="background: #334155; padding: 2px 6px; border-radius: 4px;">F12</kbd> (or the Help menu) to return to this documentation at any time.
                </div>
            </div>
        </div>
    );
};
