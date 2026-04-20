/**
 * B3JS UI Store — Selection
 *
 * Tracks the currently selected object in the editor.
 * All panels subscribe to this instead of passing props from B3Editor.
 */

import { atom } from 'nanostores';

/** The ID of the currently selected B3Object, or null. */
export const $selectedObjectId = atom<string | null>(null);

/** Convenience: set the selected object ID. */
export function selectObject(id: string | null): void {
    $selectedObjectId.set(id);
}
