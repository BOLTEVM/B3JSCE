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
                onClick={() => onSelect(obj.id)}>
                <span class="icon" style="width: 6px; height: 6px; border-radius: 50%; background: #666; display: inline-block;"></span>
                <span style="flex: 1; margin-left: 8px;">{obj.name}</span>
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
        <div>
            {objects.length > 0 ? (
                objects.filter((o: any) => !o.parent).map((obj: any) => renderTree(obj))
            ) : (
                <div style="padding: 20px; text-align: center; opacity: 0.3;">Loading objects...</div>
            )}
        </div>
    );
};
