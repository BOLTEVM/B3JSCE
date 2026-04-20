/**
 * B3JS ECS — World
 *
 * The ECS World is the central coordinator.
 * It manages:
 *   - A set of live entity IDs
 *   - A per-component-type ComponentStore
 *   - A system execution tick
 *   - Entity query helpers (filter by component combination)
 *
 * The World does NOT replace B3Engine. It lives alongside it
 * and can be adopted incrementally.
 */

import { type EntityId, createEntity, resetEntityCounter, ensureEntityIdAbove } from './Entity';
import { ComponentStore } from './ComponentStore';
import { type ComponentBase, getComponentDefinition } from './Component';
import { getSortedSystems } from './System';

export class ECSWorld {
    /** All currently alive entity IDs. */
    private entities: Set<EntityId> = new Set();

    /** Component stores, keyed by component tag (e.g. "Transform"). */
    private stores: Map<string, ComponentStore<any>> = new Map();

    // ─── Entity Lifecycle ─────────────────────────────────────────

    /** Spawn a new entity and return its ID. */
    spawn(): EntityId {
        const id = createEntity();
        this.entities.add(id);
        return id;
    }

    /** Spawn an entity with a specific ID (used during deserialization). */
    spawnWithId(id: EntityId): void {
        this.entities.add(id);
        ensureEntityIdAbove(id);
    }

    /** Destroy an entity and remove all of its components. */
    destroy(id: EntityId): void {
        this.entities.delete(id);
        for (const store of this.stores.values()) {
            store.remove(id);
        }
    }

    /** Check if an entity is alive. */
    isAlive(id: EntityId): boolean {
        return this.entities.has(id);
    }

    /** Get all live entity IDs. */
    getEntities(): EntityId[] {
        return Array.from(this.entities);
    }

    /** Get the count of live entities. */
    get entityCount(): number {
        return this.entities.size;
    }

    // ─── Component Access ─────────────────────────────────────────

    /** Get or create the ComponentStore for a given tag. */
    getStore<T extends ComponentBase>(tag: string): ComponentStore<T> {
        let store = this.stores.get(tag);
        if (!store) {
            store = new ComponentStore<T>(tag);
            this.stores.set(tag, store);
        }
        return store as ComponentStore<T>;
    }

    /** Attach a component to an entity. */
    addComponent<T extends ComponentBase>(entityId: EntityId, component: T): void {
        if (!this.entities.has(entityId)) {
            console.warn(`B3JS ECS: Cannot add component "${component._type}" to dead entity ${entityId}.`);
            return;
        }
        this.getStore<T>(component._type).set(entityId, component);
    }

    /** Get a component from an entity, or undefined. */
    getComponent<T extends ComponentBase>(entityId: EntityId, tag: string): T | undefined {
        return this.getStore<T>(tag).get(entityId);
    }

    /** Check if an entity has a specific component. */
    hasComponent(entityId: EntityId, tag: string): boolean {
        const store = this.stores.get(tag);
        return store ? store.has(entityId) : false;
    }

    /** Remove a component from an entity. */
    removeComponent(entityId: EntityId, tag: string): void {
        const store = this.stores.get(tag);
        if (store) store.remove(entityId);
    }

    /** 
     * Add a default component (from the registry) to an entity.
     * Requires the component type to have been registered via `registerComponent`.
     */
    addDefaultComponent(entityId: EntityId, tag: string): void {
        const def = getComponentDefinition(tag);
        if (!def) {
            console.warn(`B3JS ECS: No registered component definition for "${tag}".`);
            return;
        }
        this.addComponent(entityId, def.create());
    }

    // ─── Queries ──────────────────────────────────────────────────

    /**
     * Query entities that have ALL of the specified component tags.
     * Returns an array of entity IDs.
     *
     * @example
     * ```ts
     * const movers = world.query(['Transform', 'Physics']);
     * ```
     */
    query(requiredTags: string[]): EntityId[] {
        if (requiredTags.length === 0) return this.getEntities();

        // Start with the smallest store for efficiency.
        const stores = requiredTags
            .map(tag => this.stores.get(tag))
            .filter((s): s is ComponentStore<any> => s !== undefined);

        if (stores.length !== requiredTags.length) {
            // At least one required component has no store → no matches.
            return [];
        }

        // Pick the smallest store to iterate.
        stores.sort((a, b) => a.size - b.size);
        const smallest = stores[0];
        const otherStores = stores.slice(1);

        const result: EntityId[] = [];
        for (const entityId of smallest.entityIds()) {
            if (otherStores.every(s => s.has(entityId))) {
                result.push(entityId);
            }
        }
        return result;
    }

    // ─── System Execution ─────────────────────────────────────────

    /**
     * Run all registered systems for one tick.
     * Systems are executed in priority order.
     */
    tick(delta: number): void {
        const systems = getSortedSystems();
        for (const system of systems) {
            system.execute(this, delta);
        }
    }

    // ─── Lifecycle ────────────────────────────────────────────────

    /** Destroy all entities and clear all stores. */
    reset(): void {
        this.entities.clear();
        for (const store of this.stores.values()) {
            store.clear();
        }
        resetEntityCounter();
    }
}
