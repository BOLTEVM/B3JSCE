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
export interface MiningData {
    hashrate: number;
    shares_accepted: number;
    shares_rejected: number;
    uptime: number;
    status: string;
}

export const $miningStats = map<{
    fractal: MiningData;
    quai: MiningData;
    qrl: MiningData;
}>({
    fractal: { hashrate: 0, shares_accepted: 0, shares_rejected: 0, uptime: 0, status: 'OFFLINE' },
    quai: { hashrate: 0, shares_accepted: 0, shares_rejected: 0, uptime: 0, status: 'OFFLINE' },
    qrl: { hashrate: 0, shares_accepted: 0, shares_rejected: 0, uptime: 0, status: 'OFFLINE' },
});

export function setActiveScene(name: string): void {
    $activeSceneName.set(name);
}

export function updateMiningStats(type: 'fractal' | 'quai' | 'qrl', stats: MiningData): void {
    $miningStats.setKey(type, stats);
}
