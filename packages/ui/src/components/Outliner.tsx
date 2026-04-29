import * as webjsx from 'webjsx';

export const Outliner = ({ 
    objects, 
    selectedObjectId, 
    onSelect, 
    onDelete 
}: any) => {
    const renderTree = (obj: any) => (
        <div key={obj.id}>
            <div class={`tree-item ${selectedObjectId === obj.id ? 'selected' : ''}`}
                onClick={(e: MouseEvent) => {
                    e.stopPropagation();
                    onSelect(obj.id);
                }}>
                
                {/* Visibility Toggle (Eyeball) */}
                <span class="visibility-toggle" 
                    onClick={(e: MouseEvent) => {
                        e.stopPropagation();
                        obj.visible = !obj.visible;
                        onSelect(selectedObjectId); // Trigger re-render
                    }}
                    style={`margin-right: 4px; cursor: pointer; opacity: ${obj.visible ? 1 : 0.3};`}>
                    {obj.visible ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                        </svg>
                    ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                    )}
                </span>

                {/* Lock Toggle */}
                <span class="lock-toggle"
                    onClick={(e: MouseEvent) => {
                        e.stopPropagation();
                        obj.locked = !obj.locked;
                        onSelect(selectedObjectId);
                    }}
                    style={`margin-right: 8px; cursor: pointer; opacity: ${obj.locked ? 1 : 0.2}; color: ${obj.locked ? '#facc15' : 'inherit'};`}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        {obj.locked ? (
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        ) : (
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        )}
                        <path d={obj.locked ? "M7 11V7a5 5 0 0 1 10 0v4" : "M7 11V7a5 5 0 0 1 9.9-1"} />
                    </svg>
                </span>

                <span style="flex: 1;">{obj.name}</span>
                <span class="delete-btn" style="opacity: 0.2;" onClick={(e: MouseEvent) => {
                    e.stopPropagation();
                    onDelete(obj.id, obj.name);
                }}>✕</span>
            </div>
            {obj.children.length > 0 && (
                <div class="tree-indent">
                    {obj.children.map((child: any) => renderTree(child))}
                </div>
            )}
        </div>
    );

    return (
        <div style="min-height: 200px; height: 100%;" onClick={() => onSelect(null)}>
            {objects.length > 0 ? (
                objects.filter((o: any) => !o.parent).map((obj: any) => renderTree(obj))
            ) : (
                <div style="padding: 20px; text-align: center; opacity: 0.3;">Loading objects...</div>
            )}
        </div>
    );
};
