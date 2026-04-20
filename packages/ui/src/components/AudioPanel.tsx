import * as webjsx from 'webjsx';

export const AudioPanel = ({ engine }: any) => {
    const isReady = engine?.audio.isReady();

    return (
        <div style="padding: 20px; color: #ddd; display: flex; flex-direction: column; height: 100%; box-sizing: border-box;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <div>
                    <div style="font-size: 16px; font-weight: bold; color: #e68523;">Audio Orchestrator</div>
                    <div style="font-size: 10px; color: #666;">Spatial Audio & FFT Engine</div>
                </div>
                <button 
                    style={`padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; ${isReady ? 'background: #333; color: #00ff88;' : 'background: #e68523; color: white;'}`}
                    onClick={() => engine?.audio.resume()}
                >
                    {isReady ? '● Audio Active' : 'Start Audio Engine'}
                </button>
            </div>

            <div style="flex: 1; background: #111; border: 1px solid #333; border-radius: 8px; position: relative; overflow: hidden; display: flex; align-items: flex-end; padding: 10px; gap: 2px;">
                {!isReady && (
                    <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #444; font-size: 10px; text-transform: uppercase; letter-spacing: 2px;">
                        Waiting for user gesture...
                    </div>
                )}
                {/* Simplified FFT Visualizer placeholders (can be expanded with a canvas if needed) */}
                {Array.from({ length: 32 }).map((_, i) => (
                    <div style={`flex: 1; background: #e68523; opacity: ${0.2 + (i/32) * 0.5}; height: ${Math.random() * 80}%; border-radius: 2px 2px 0 0; transition: height 0.1s;`}></div>
                ))}
            </div>

            <div style="margin-top: 15px; display: flex; gap: 20px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <label style="font-size: 10px; color: #888;">Spatial Mode:</label>
                    <select 
                        style="background: #222; color: #fff; border: 1px solid #444; font-size: 10px;"
                        onInput={(e: any) => engine?.audio.setStereo(e.target.value === 'stereo')}
                    >
                        <option value="stereo">Full Stereo (Spatial)</option>
                        <option value="mono">Mono Mixdown</option>
                    </select>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 8px; height: 8px; border-radius: 50%; background: #00ff88;"></div>
                    <span style="font-size: 10px;">FFT: 128 Active Bins</span>
                </div>
            </div>
        </div>
    );
};
