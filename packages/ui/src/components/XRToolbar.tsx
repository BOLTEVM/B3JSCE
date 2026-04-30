import * as webjsx from 'webjsx';

export const XRToolbar = ({ 
    selectedObject, 
    transformMode,
    onAction, // (action: string, data?: any) => void
    onClose 
}: any) => {
    if (!selectedObject) return null;

    const actions = [
        { id: 'translate', icon: '✢', label: 'Move', active: transformMode === 'translate' },
        { id: 'rotate', icon: '⟳', label: 'Rotate', active: transformMode === 'rotate' },
        { id: 'scale', icon: '✥', label: 'Scale', active: transformMode === 'scale' },
        { id: 'separator', isSeparator: true },
        { id: 'duplicate', icon: '📋', label: 'Clone', color: '#60a5fa' },
        { id: 'delete', icon: '🗑️', label: 'Delete', color: '#f87171' },
    ];

    return (
        <div class="xr-toolbar-wrapper">
            <style>{`
                .xr-toolbar-wrapper {
                    background: rgba(20, 20, 20, 0.85);
                    backdrop-filter: blur(12px);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 12px;
                    padding: 8px;
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
                    pointer-events: auto;
                    user-select: none;
                    min-width: 60px;
                }
                .toolbar-item {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 10px;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 0.2s;
                    gap: 4px;
                }
                .toolbar-item:hover {
                    background: rgba(255, 255, 255, 0.1);
                    transform: scale(1.05);
                }
                .toolbar-item.active {
                    background: #3b82f633;
                    border: 1px solid #3b82f666;
                    color: #60a5fa;
                }
                .toolbar-icon {
                    font-size: 20px;
                }
                .toolbar-label {
                    font-size: 9px;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    opacity: 0.7;
                }
                .toolbar-separator {
                    height: 1px;
                    background: rgba(255, 255, 255, 0.1);
                    margin: 4px 0;
                }
                .close-btn {
                    position: absolute;
                    top: -10px;
                    right: -10px;
                    background: #222;
                    border: 1px solid #444;
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 10px;
                    cursor: pointer;
                }
            `}</style>

            <div class="close-btn" onClick={onClose}>✕</div>

            {actions.map(action => (
                action.isSeparator ? (
                    <div class="toolbar-separator" />
                ) : (
                    <div class={`toolbar-item ${action.active ? 'active' : ''}`}
                         onClick={() => onAction(action.id)}
                         style={action.color ? `color: ${action.color}` : ''}>
                        <span class="toolbar-icon">{action.icon}</span>
                        <span class="toolbar-label">{action.label}</span>
                    </div>
                )
            ))}
        </div>
    );
};
