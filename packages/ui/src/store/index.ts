/**
 * B3JS UI Stores — Public API
 *
 * Domain-separated nanostores for the editor UI.
 * Import from here to access any store.
 */

export { $selectedObjectId, selectObject } from './selectionStore';

export {
    type BottomTab,
    $activeBottomTab,
    $selectedShaderNodeId,
    $isSettingsOpen,
    setBottomTab,
    setSelectedShaderNode,
    toggleSettings,
} from './inspectorStore';

export {
    $activeSceneName,
    $miningStats,
    setActiveScene,
    updateMiningStats,
} from './sceneStore';

export {
    type GizmoMode,
    $gizmoMode,
    $activeMenu,
    setGizmoMode,
    setActiveMenu,
} from './toolStore';

export {
    $undoCount,
    $redoCount,
    $isPaused,
    setUndoRedoCounts,
    setIsPaused,
} from './historyStore';
