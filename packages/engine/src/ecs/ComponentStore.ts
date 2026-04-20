/**
 * B3JS ECS — ComponentStore
 *
 * A Map-based store that holds all instances of a single component type,
 * keyed by EntityId.
 *
 * This is the "easy start" approach: simple Map<EntityId, T>.
 * Hot-path systems can be migrated to packed arrays later without
 * changing the external query API.
 */

import type { EntityId } from './Entity';
import type { ComponentBase } from './Component';

export class ComponentStore<T extends ComponentBase> {
    readonly tag: string;
    private data: Map<EntityId, T> = new Map();

    constructor(tag: string) {
        this.tag = tag;
    }

    /** Attach a component to an entity. Overwrites if already present. */
    set(entityId: EntityId, component: T): void {
        this.data.set(entityId, component);
    }

    /** Retrieve a component for an entity, or undefined. */
    get(entityId: EntityId): T | undefined {
        return this.data.get(entityId);
    }

    /** Check if an entity has this component. */
    has(entityId: EntityId): boolean {
        return this.data.has(entityId);
    }

    /** Remove a component from an entity. Returns true if it existed. */
    remove(entityId: EntityId): boolean {
        return this.data.delete(entityId);
    }

    /** Iterate all (entityId, component) pairs. */
    entries(): IterableIterator<[EntityId, T]> {
        return this.data.entries();
    }

    /** Get all entity IDs that have this component. */
    entityIds(): IterableIterator<EntityId> {
        return this.data.keys();
    }

    /** Get all component values. */
    values(): IterableIterator<T> {
        return this.data.values();
    }

    /** Number of entities with this component. */
    get size(): number {
        return this.data.size;
    }

    /** Remove all component data (used during scene reset). */
    clear(): void {
        this.data.clear();
    }

    /**
     * Collect all entities matching this store as a simple array.
     * Useful for system iteration.
     */
    toArray(): { entityId: EntityId; component: T }[] {
        const result: { entityId: EntityId; component: T }[] = [];
        for (const [entityId, component] of this.data) {
            result.push({ entityId, component });
        }
        return result;
    }
}
