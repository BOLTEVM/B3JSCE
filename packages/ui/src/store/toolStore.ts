/**
 * B3JS UI Store — Tool
 *
 * Tracks the active gizmo mode and other toolbar state.
 */

import { atom } from 'nanostores';

/** The active transform gizmo mode. */
export type GizmoMode = 'translate' | 'rotate' | 'scale';

export const $gizmoMode = atom<GizmoMode>('translate');

/** The currently active header menu (dropdown), or null if none. */
export const $activeMenu = atom<string | null>(null);

export function setGizmoMode(mode: GizmoMode): void {
    $gizmoMode.set(mode);
}

export function setActiveMenu(menu: string | null): void {
    $activeMenu.set(menu);
}
