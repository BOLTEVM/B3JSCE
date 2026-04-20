/**
 * B3JS UI Store — Inspector
 *
 * Tracks inspector-specific state: which shader node is selected,
 * which bottom tab is active, etc.
 */

import { atom } from 'nanostores';

/** The currently active bottom panel tab. */
export type BottomTab = 'logic' | 'shader' | 'audio' | 'network' | 'optimization' | 'inventory';

export const $activeBottomTab = atom<BottomTab>('logic');

/** The selected shader node ID (for the properties panel). */
export const $selectedShaderNodeId = atom<string | null>(null);

/** Whether the settings modal is open. */
export const $isSettingsOpen = atom<boolean>(false);

export function setBottomTab(tab: BottomTab): void {
    $activeBottomTab.set(tab);
}

export function setSelectedShaderNode(id: string | null): void {
    $selectedShaderNodeId.set(id);
}

export function toggleSettings(open?: boolean): void {
    $isSettingsOpen.set(open ?? !$isSettingsOpen.get());
}
