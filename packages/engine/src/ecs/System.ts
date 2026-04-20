/**
 * B3JS ECS — System
 *
 * Systems are plain functions that operate over filtered entity sets.
 * This module provides a lightweight registration and execution framework.
 *
 * Systems receive the ECS World and a delta time.
 * They query for entities with specific component combinations,
 * then process them.
 */

import type { ECSWorld } from './World';

/**
 * A system is a named function that runs every frame (or on demand).
 * Systems should not hold mutable state — use components for that.
 */
export interface SystemDefinition {
    /** Unique name for debugging and ordering. */
    name: string;

    /**
     * Component tags this system requires.
     * The runner uses these to pre-filter entities.
     */
    requiredComponents: string[];

    /** 
     * Execution priority. Lower runs first.
     * Default: 0. Negative = early, positive = late.
     */
    priority?: number;

    /**
     * The system function itself.
     * @param world - The ECS world, for querying components.
     * @param delta - Frame delta time in seconds.
     */
    execute: (world: ECSWorld, delta: number) => void;
}

// ─── System Registry ──────────────────────────────────────────────

const _systems: SystemDefinition[] = [];
let _sorted = false;

/**
 * Register a system globally.
 * Systems are sorted by priority before the first execution.
 */
export function registerSystem(system: SystemDefinition): void {
    _systems.push({
        ...system,
        priority: system.priority ?? 0,
    });
    _sorted = false;
}

/** Retrieve all registered systems, sorted by priority. */
export function getSortedSystems(): SystemDefinition[] {
    if (!_sorted) {
        _systems.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
        _sorted = true;
    }
    return _systems;
}

/** Remove a system by name (useful for tests and hot-reload). */
export function unregisterSystem(name: string): void {
    const idx = _systems.findIndex(s => s.name === name);
    if (idx !== -1) _systems.splice(idx, 1);
}

/** Clear all registered systems (tests only). */
export function clearSystems(): void {
    _systems.length = 0;
    _sorted = false;
}
