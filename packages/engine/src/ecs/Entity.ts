/**
 * B3JS ECS — Entity
 * 
 * An entity is just a unique numeric ID. No behavior, no data.
 * This module provides the ID type and a monotonic factory.
 */

/** Opaque entity identifier — a simple number. */
export type EntityId = number;

/**
 * Generates monotonically increasing entity IDs.
 * Deterministic within a single session; can be seeded for replays.
 */
let _nextId = 1;

export function createEntity(): EntityId {
    return _nextId++;
}

/** Reset the entity counter (useful for tests and scene reloads). */
export function resetEntityCounter(startFrom: number = 1): void {
    _nextId = startFrom;
}

/** Get the current counter value without incrementing (useful for serialization). */
export function peekNextEntityId(): EntityId {
    return _nextId;
}

/** 
 * Advance the counter to at least `minId` (used when loading saves 
 * so newly created entities don't collide with restored ones). 
 */
export function ensureEntityIdAbove(minId: EntityId): void {
    if (_nextId <= minId) {
        _nextId = minId + 1;
    }
}
