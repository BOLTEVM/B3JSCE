/**
 * B3JS UI Store — History
 *
 * Tracks undo/redo state metadata for the UI.
 * The actual command stack lives in B3Engine.history; this store
 * just exposes counts for UI indicators.
 */

import { atom } from 'nanostores';

/** Number of actions available to undo. */
export const $undoCount = atom<number>(0);

/** Number of actions available to redo. */
export const $redoCount = atom<number>(0);

/** Whether the simulation is currently paused. */
export const $isPaused = atom<boolean>(false);

export function setUndoRedoCounts(undo: number, redo: number): void {
    $undoCount.set(undo);
    $redoCount.set(redo);
}

export function setIsPaused(paused: boolean): void {
    $isPaused.set(paused);
}
