import * as webjsx from 'webjsx';

interface RoboticsPanelProps {
    engine: any; // B3Engine
}

export const RoboticsPanel = ({ engine }: RoboticsPanelProps) => {
    if (!engine) return <div />;

    const status = engine.robotics?.getStatus() || 'Disconnected';
    const telemetry = engine.robotics?.getTelemetry();
    const defaultUri = 'ws://localhost:9090';

    const handleConnect = () => {
        const uriInput = document.getElementById('robotics-uri-input') as HTMLInputElement;
        const uri = uriInput?.value || defaultUri;
        if (engine.robotics) {
            engine.robotics.connect(uri);
        }
    };

    return (
        <div style="padding: 15px; color: #e2e8f0; font-family: Inter, sans-serif;">
            <h3 style="margin: 0 0 15px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8;">
                🤖 Robotics Teleoperation
            </h3>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; font-size: 11px; margin-bottom: 5px; color: #64748b;">Robot WebSocket URI (rosbridge)</label>
                <div style="display: flex; gap: 8px;">
                    <input 
                        id="robotics-uri-input"
                        type="text" 
                        value={defaultUri}
                        style="flex: 1; background: #0f172a; border: 1px solid #334155; border-radius: 4px; padding: 6px 10px; color: #f8fafc; font-size: 12px;"
                    />
                    <button 
                        onClick={handleConnect}
                        style={`background: ${status === 'Connected' ? '#10b981' : '#3b82f6'}; color: white; border: none; border-radius: 4px; padding: 6px 12px; font-size: 12px; cursor: pointer; font-weight: 600;`}
                    >
                        {status === 'Connected' ? 'Connected' : 'Connect'}
                    </button>
                </div>
            </div>

            <div style="background: #0f172a; border-radius: 8px; padding: 12px; border: 1px solid #1e293b;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                    <span style="font-size: 11px; color: #94a3b8;">Connection Status</span>
                    <span style={`font-size: 11px; color: ${status === 'Connected' ? '#10b981' : '#ef4444'}; font-weight: bold;`}>
                        ● {status}
                    </span>
                </div>
                
                {telemetry && telemetry.jointStates && (
                    <div style="font-size: 11px;">
                        <div style="color: #64748b; margin-bottom: 5px;">Live Telemetry (Unitree B1)</div>
                        <div style="max-height: 100px; overflow-y: auto; border-top: 1px solid #1e293b; padding-top: 5px;">
                            {Array.from(telemetry.jointStates.entries()).map(([name, val]: any) => (
                                <div style="display: flex; justify-content: space-between; padding: 2px 0;">
                                    <span style="opacity: 0.7;">{name}</span>
                                    <span style="color: #38bdf8;">{(val as number).toFixed(3)} rad</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div style="margin-top: 15px;">
                <h4 style="font-size: 11px; color: #94a3b8; margin-bottom: 8px;">Viewfinder (Mock WebRTC)</h4>
                <div style="aspect-ratio: 16/9; background: #000; border-radius: 6px; display: flex; align-items: center; justify-content: center; position: relative; border: 1px solid #334155; overflow: hidden;">
                    <div style="position: absolute; top: 10px; left: 10px; background: rgba(239, 68, 68, 0.8); padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: bold;">
                        LIVE
                    </div>
                    <span style="color: #334155; font-size: 12px;">[ VIDEO STREAM PENDING ]</span>
                </div>
            </div>
        </div>
    );
};
