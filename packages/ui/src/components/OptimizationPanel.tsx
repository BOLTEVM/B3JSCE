import * as webjsx from 'webjsx';

export const OptimizationPanel = ({ engine, onRender }: any) => {
    const stats = engine.optimizer.getStats();

    return (
        <div style="padding: 15px; background: #1a1a1a; height: 100%; color: #ddd;">
            <div style="font-size: 14px; font-weight: bold; margin-bottom: 15px; color: #e68523;">
                💎 Scene Optimization & Zoning
            </div>

            <div class="prop-row">
                <div class="prop-label">Optimization Mode</div>
                <select value={engine.optimizationMode} 
                        onChange={(e: any) => {
                            engine.optimizationMode = e.target.value;
                            if (engine.optimizationMode === 'auto') engine.optimizer.rebuildInstances();
                            onRender();
                        }}>
                    <option value="auto">Automatic (GPU Instancing)</option>
                    <option value="manual">Manual (Pro Baking)</option>
                </select>
            </div>

            <div class="prop-row">
                <div class="prop-label">Culling Radius</div>
                <input type="number" value={engine.zoningRadius} 
                       onChange={(e: any) => {
                           engine.zoningRadius = parseFloat(e.target.value);
                           onRender();
                       }} />
            </div>

            <div style="display: flex; gap: 10px; margin-top: 15px;">
                <button style="flex: 1; padding: 6px; background: #e68523; color: #fff; font-weight: bold; border: none; cursor: pointer; border-radius: 4px;"
                        onClick={() => {
                            engine.optimizer.rebuildInstances();
                            onRender();
                        }}>
                    📦 Bake Scene Now
                </button>
            </div>

            <div style="display: flex; gap: 10px; margin-top: 10px;">
                <button style="flex: 1; padding: 6px; background: #00d4ff; color: #fff; font-weight: bold; border: none; cursor: pointer; border-radius: 4px;"
                        onClick={() => {
                            engine.bakeNavMesh();
                            onRender();
                        }}>
                    🗺️ Bake NavMesh
                </button>
            </div>

            <div style="margin-top: 25px; border-top: 1px solid #333; padding-top: 15px;">
                <div style="font-size: 11px; font-weight: bold; margin-bottom: 10px; color: #888; text-transform: uppercase;">
                    Performance Statistics
                </div>
                
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; justify-content: space-between; font-size: 10px;">
                        <span>Total Scene Objects:</span>
                        <span style="color: #fff;">{stats.totalObjects}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 10px;">
                        <span>Instanced Batches:</span>
                        <span style="color: #e68523;">{stats.instancedGroups}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 10px;">
                        <span>GPU Instances:</span>
                        <span style="color: #00d4ff;">{stats.activeInstances}</span>
                    </div>
                </div>
            </div>

            <div style="margin-top: 20px; font-size: 9px; color: #666; font-style: italic;">
                * Mark objects as "Static" in the Properties panel to enable instancing. <br/>
                * Total Draw Calls are significantly reduced in Automatic mode.
            </div>
        </div>
    );
};
