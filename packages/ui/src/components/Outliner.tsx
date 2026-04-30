import * as webjsx from 'webjsx';

// Persistent state for expanded items
const expandedItems = new Set<string>();

export const Outliner = ({ 
    objects, 
    selectedObjectId, 
    selectedSubItem,
    onSelect, 
    onSelectSubItem,
    onDelete 
}: any) => {

    const getIcon = (type: string) => {
        switch (type) {
            case 'NPC': return '👤';
            case 'Light': return '💡';
            case 'Audio': return '🔊';
            case 'Vehicle': return '🚗';
            case 'Weapon': return '🔫';
            case 'Trigger': return '🔘';
            case 'folder': return '📂';
            case 'modifier': return '🔧';
            case 'vertexGroup': return '🧬';
            default: return '📦';
        }
    };

    const getLogicIcon = (type: string) => {
        switch (type) {
            case 'gate': return { char: '🚪', color: '#a855f7', label: 'GATE' };
            case 'elevator': return { char: '↕️', color: '#3b82f6', label: 'ELEV' };
            case 'lightcone': return { char: '✨', color: '#f43f5e', label: 'PULSE' };
            case 'collider': return { char: '🧱', color: '#888', label: 'COLL' };
            case 'mesh': return { char: '▦', color: '#34d399', label: 'MESH' };
            default: return null;
        }
    };

    const renderTree = (obj: any, isSubNode: boolean = false) => {
        const isSelected = selectedObjectId === obj.id && !selectedSubItem;
        const hasLogic = obj.logicNodes && obj.logicNodes.length > 0;
        const hasModifiers = obj.modifiers && obj.modifiers.length > 0;
        const hasVertexGroups = obj.vertexGroups && obj.vertexGroups.length > 0;
        const hasChildren = obj.children && obj.children.length > 0;
        
        const isExpanded = expandedItems.has(obj.id);
        const canExpand = hasChildren || hasLogic || hasModifiers || hasVertexGroups;

        const toggleExpand = (e: MouseEvent) => {
            e.stopPropagation();
            if (isExpanded) expandedItems.delete(obj.id);
            else expandedItems.add(obj.id);
            onSelect(selectedObjectId); // Trigger re-render
        };

        return (
            <div key={obj.id || obj.name} class="tree-container">
                <div class={`tree-item ${isSelected ? 'selected' : ''} ${isSubNode ? 'sub-node' : ''}`}
                    onClick={(e: MouseEvent) => {
                        e.stopPropagation();
                        onSelect(obj.id);
                    }}>
                    
                    {/* Expand Arrow */}
                    <span class="expand-arrow" 
                          onClick={toggleExpand}
                          style={`visibility: ${canExpand ? 'visible' : 'hidden'}; transform: rotate(${isExpanded ? '90deg' : '0deg'}); transition: transform 0.2s;`}>
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                            <path d="M9 5l7 7-7 7" />
                        </svg>
                    </span>

                    {/* Visibility Toggle */}
                    <span class="visibility-toggle" 
                        onClick={(e: MouseEvent) => {
                            e.stopPropagation();
                            obj.visible = !obj.visible;
                            onSelect(selectedObjectId);
                        }}
                        style={`opacity: ${obj.visible ? 1 : 0.3};`}>
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
                    {!isSubNode && (
                        <span class="lock-toggle"
                            onClick={(e: MouseEvent) => {
                                e.stopPropagation();
                                obj.locked = !obj.locked;
                                onSelect(selectedObjectId);
                            }}
                            style={`opacity: ${obj.locked ? 1 : 0.2}; color: ${obj.locked ? '#facc15' : 'inherit'}; cursor: pointer;`}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d={obj.locked ? "M7 11V7a5 5 0 0 1 10 0v4" : "M7 11V7a5 5 0 0 1 9.9-1"} />
                            </svg>
                        </span>
                    )}

                    <span class="type-icon">{isSubNode ? '↳' : getIcon(obj.type)}</span>
                    <span class="item-name">{obj.name}</span>

                    {/* Logic Badges */}
                    {hasLogic && !isSubNode && (
                        <div class="logic-badges">
                            {Array.from(new Set(obj.logicNodes.map((n: any) => n.type))).map((type: any) => {
                                const info = getLogicIcon(type);
                                if (!info || type === 'mesh') return null;
                                return (
                                    <span class="logic-badge" style={`color: ${info.color};`} title={info.label}>
                                        {info.char}
                                    </span>
                                );
                            })}
                        </div>
                    )}

                    {!isSubNode && (
                        <span class="delete-btn" onClick={(e: MouseEvent) => {
                            e.stopPropagation();
                            onDelete(obj.id, obj.name);
                        }}>✕</span>
                    )}
                </div>

                {/* Sub-Items (Only if expanded) */}
                {isExpanded && (
                    <>
                        {/* Internal Logic Nodes */}
                        {hasLogic && (
                            <div class="tree-indent logic-group">
                                {obj.logicNodes.map((ln: any) => {
                                    const info = getLogicIcon(ln.type);
                                    const isLnSelected = selectedSubItem?.parentId === obj.id && selectedSubItem?.type === 'logic' && selectedSubItem?.id === ln.name;
                                    return (
                                        <div class={`tree-item sub-node logic-node ${isLnSelected ? 'selected' : ''}`}
                                             onClick={(e: MouseEvent) => { e.stopPropagation(); onSelectSubItem(obj.id, 'logic', ln.name); }}>
                                            <span class="type-icon" style={`color: ${info?.color || '#888'}`}>{info?.char || '●'}</span>
                                            <span class="item-name" style="opacity: 0.8;">{ln.name}</span>
                                            <span class="logic-tag" style={`background: ${info?.color || '#444'}33; color: ${info?.color || '#ccc'}`}>
                                                {info?.label || 'NODE'}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Modifiers */}
                        {hasModifiers && (
                            <div class="tree-indent logic-group">
                                <div class="tree-item sub-node group-header" style="opacity: 0.5;">
                                    <span class="type-icon">{getIcon('folder')}</span>
                                    <span class="item-name">Modifiers</span>
                                </div>
                                {obj.modifiers.map((m: any) => {
                                    const isMSelected = selectedSubItem?.parentId === obj.id && selectedSubItem?.type === 'modifier' && selectedSubItem?.id === m.id;
                                    return (
                                        <div class={`tree-item sub-node logic-node ${isMSelected ? 'selected' : ''}`}
                                             style="padding-left: 32px;"
                                             onClick={(e: MouseEvent) => { e.stopPropagation(); onSelectSubItem(obj.id, 'modifier', m.id); }}>
                                            <span class="type-icon" style="color: #60a5fa;">{getIcon('modifier')}</span>
                                            <span class="item-name">{m.name}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Vertex Groups */}
                        {hasVertexGroups && (
                            <div class="tree-indent logic-group">
                                <div class="tree-item sub-node group-header" style="opacity: 0.5;">
                                    <span class="type-icon">{getIcon('folder')}</span>
                                    <span class="item-name">Vertex Groups</span>
                                </div>
                                {obj.vertexGroups.map((vg: any) => {
                                    const isVgSelected = selectedSubItem?.parentId === obj.id && selectedSubItem?.type === 'vertexGroup' && selectedSubItem?.id === vg.name;
                                    return (
                                        <div class={`tree-item sub-node logic-node ${isVgSelected ? 'selected' : ''}`}
                                             style="padding-left: 32px;"
                                             onClick={(e: MouseEvent) => { e.stopPropagation(); onSelectSubItem(obj.id, 'vertexGroup', vg.name); }}>
                                            <span class="type-icon" style="color: #34d399;">{getIcon('vertexGroup')}</span>
                                            <span class="item-name">{vg.name}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Child B3Objects */}
                        {hasChildren && (
                            <div class="tree-indent">
                                {obj.children.map((child: any) => renderTree(child))}
                            </div>
                        )}
                    </>
                )}
            </div>
        );
    };

    return (
        <div class="outliner-wrapper" onClick={() => onSelect(null)}>
            <style>{`
                .outliner-wrapper {
                    min-height: 200px; height: 100%;
                    background: #1a1a1a;
                    padding: 4px 0;
                    user-select: none;
                }
                .tree-container { margin-bottom: 1px; }
                .tree-item {
                    display: flex; align-items: center;
                    padding: 4px 8px;
                    gap: 6px;
                    cursor: pointer;
                    transition: background 0.1s;
                    border-radius: 4px;
                    margin: 0 4px;
                    font-size: 11px;
                    color: #aaa;
                }
                .tree-item:hover { background: #2a2a2a; color: #eee; }
                .tree-item.selected { 
                    background: #3b82f633; 
                    color: #60a5fa; 
                    border: 1px solid #3b82f644;
                }
                .tree-item.sub-node { 
                    font-size: 10px; 
                    padding-left: 20px; 
                    opacity: 0.7;
                }
                .expand-arrow { width: 12px; height: 12px; display: flex; align-items: center; justify-content: center; opacity: 0.4; cursor: pointer; }
                .expand-arrow:hover { opacity: 1; color: #fff; }
                .visibility-toggle { cursor: pointer; display: flex; align-items: center; width: 16px; opacity: 0.6; transition: opacity 0.2s; }
                .visibility-toggle:hover { opacity: 1 !important; }
                .lock-toggle { display: flex; align-items: center; width: 16px; transition: all 0.2s; }
                .lock-toggle:hover { opacity: 1 !important; }
                .type-icon { font-size: 12px; width: 16px; text-align: center; }
                .item-name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .logic-badges { display: flex; gap: 4px; margin-right: 4px; }
                .logic-badge { font-size: 10px; opacity: 0.8; }
                .logic-tag { 
                    font-size: 8px; font-weight: 800; 
                    padding: 1px 4px; border-radius: 3px; 
                    letter-spacing: 0.5px;
                }
                .tree-indent { 
                    margin-left: 12px; 
                    border-left: 1px solid #333; 
                    padding-left: 2px;
                }
                .logic-group { border-left: 1px dashed #444; }
                .delete-btn { opacity: 0; font-size: 10px; padding: 2px 6px; }
                .tree-item:hover .delete-btn { opacity: 0.4; }
                .delete-btn:hover { opacity: 1 !important; color: #f87171; }
            `}</style>
            {objects.length > 0 ? (
                objects.filter((o: any) => !o.parent).map((obj: any) => renderTree(obj))
            ) : (
                <div style="padding: 40px; text-align: center; opacity: 0.2;">
                    <div style="font-size: 24px; margin-bottom: 8px;">🧊</div>
                    No objects in scene
                </div>
            )}
        </div>
    );
};
