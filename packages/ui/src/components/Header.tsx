import * as webjsx from 'webjsx';

export const Header = ({ 
    activeMenu, 
    onMenuToggle, 
    onSettingsOpen,
    renderDropdown
}: any) => {
    return (
        <div class="menu-bar" style="justify-content: space-between; width: 100%; box-sizing: border-box;">
            <div style="display: flex; align-items: center; flex: 1;">
                <img src="/0logov3.png" style="height: 18px; cursor: pointer; margin-right: 16px; margin-left: 4px;" 
                    onClick={onSettingsOpen}
                />
                {['File', 'Edit', 'Selection', 'Add', 'Help'].map(menu => (
                    <div class={`menu-item ${activeMenu === menu ? 'active' : ''}`}
                        onClick={(e: any) => {
                            e.stopPropagation();
                            onMenuToggle(activeMenu === menu ? null : menu);
                        }}>
                        {menu}
                        {activeMenu === menu && (
                            <div class="dropdown-menu">
                                {renderDropdown(menu)}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <div style="display: flex; align-items: center; padding-right: 10px;">
                <button style="background: #e68523; color: white; border: none; padding: 2px 8px; border-radius: 4px; font-size: 9px; cursor: pointer; margin-right: 8px;"
                        onClick={() => {
                            const renderer = (window as any).B3_ENGINE_INSTANCE.renderer;
                            const sessionInit = { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] };
                            navigator.xr?.requestSession('immersive-vr', sessionInit).then((s) => renderer.xr.setSession(s));
                        }}>
                    Enter VR
                </button>
                <button style="background: #00d4ff; color: #000; border: none; padding: 2px 8px; border-radius: 4px; font-size: 9px; cursor: pointer; margin-right: 16px;"
                        onClick={() => {
                            const renderer = (window as any).B3_ENGINE_INSTANCE.renderer;
                            navigator.xr?.requestSession('immersive-ar').then((s) => renderer.xr.setSession(s));
                        }}>
                    Enter AR
                </button>

                <div class={`menu-item ${activeMenu === 'Scene' ? 'active' : ''}`}
                    style="border-left: 1px solid #222; padding-left: 16px;"
                    onClick={(e: any) => {
                        e.stopPropagation();
                        onMenuToggle(activeMenu === 'Scene' ? null : 'Scene');
                    }}>
                    <span style="opacity: 0.6; margin-right: 4px;">Scene:</span> {(window as any).B3_ENGINE_INSTANCE?.activeSceneName || 'MainScene'}
                    {activeMenu === 'Scene' && (
                        <div class="dropdown-menu" style="right: 8px; left: auto;">
                            {renderDropdown('Scene')}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
