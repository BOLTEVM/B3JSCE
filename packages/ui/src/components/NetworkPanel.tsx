import * as webjsx from 'webjsx';

export const NetworkPanel = ({ engine, onRender }: any) => {
    let url = "ws://localhost:8080";
    let room = "massive_room_1";

    return (
        <div style="padding: 15px; background: #1a1a1a; height: 100%; color: #ddd;">
            <div style="font-size: 14px; font-weight: bold; margin-bottom: 15px; color: #00d4ff;">
                🌐 Massive Multiplayer Networking
            </div>

            <div class="prop-row">
                <div class="prop-label">Relay URL</div>
                <input type="text" value={url} onInput={(e: any) => url = e.target.value} />
            </div>

            <div class="prop-row">
                <div class="prop-label">Room ID</div>
                <input type="text" value={room} onInput={(e: any) => room = e.target.value} />
            </div>

            <div style="display: flex; gap: 10px; margin-top: 15px;">
                <button style="flex: 1; padding: 6px; background: #00d4ff; color: #000; font-weight: bold; border: none; cursor: pointer; border-radius: 4px;"
                        onClick={() => {
                            engine.network.connect(url, room);
                            onRender();
                        }}>
                    Connect to Scene
                </button>
                <button style="flex: 1; padding: 6px; background: #e68523; color: #fff; font-weight: bold; border: none; cursor: pointer; border-radius: 4px;"
                        onClick={() => {
                            engine.network.enableVoice();
                            onRender();
                        }}>
                    🎙 Enable Spatial Voice
                </button>
            </div>

            <div style="margin-top: 20px; font-size: 9px; color: #666; font-style: italic;">
                * Spatial voice chat requires browser mic permission. <br/>
                * Voices are automatically attached to your 3D avatar.
            </div>

            <div style="margin-top: 20px; border-top: 1px solid #333; padding-top: 10px;">
                <div class="section-title">Connected Peers</div>
                <div style="margin-top: 10px; opacity: 0.5; text-align: center;">
                    Connect to see active collaborators...
                </div>
            </div>
        </div>
    );
};
