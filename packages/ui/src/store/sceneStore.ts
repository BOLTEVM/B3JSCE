/**
 * B3JS UI Store — Scene
 *
 * Tracks scene-level metadata: active scene name, scene list,
 * and mining telemetry status.
 */

import { atom, map } from 'nanostores';

/** The name of the currently active scene. */
export const $activeSceneName = atom<string>('MainScene');

/** Mining telemetry stats for the mining panel. */
export const $miningStats = map<{
    hashrate: string;
    shares: string;
    status: string;
}>({
    hashrate: '0 H/s',
    shares: '0',
    status: 'OFFLINE',
});

export function setActiveScene(name: string): void {
    $activeSceneName.set(name);
}

export function updateMiningStats(stats: { hashrate: string; shares: string; status: string }): void {
    $miningStats.set(stats);
}
