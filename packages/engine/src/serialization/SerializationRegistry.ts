/**
 * B3JS Serialization — Registry & Pipelines
 *
 * Central registry for component serializers and the save/load pipelines.
 *
 * Save format:
 * {
 *   "formatVersion": 1,
 *   "engineVersion": "1.0.0",
 *   "entities": [1, 2, 3],
 *   "components": {
 *     "Transform@2": { "1": {...}, "2": {...} },
 *     "Health@1":     { "3": {...} }
 *   }
 * }
 */

import type { EntityId } from '../ecs/Entity';
import { ensureEntityIdAbove } from '../ecs/Entity';
import type { ECSWorld } from '../ecs/World';
import type { ComponentBase } from '../ecs/Component';
import { type ComponentSerializer, migrateComponentData } from './ComponentSerializer';

/** Current format version for the save file envelope. */
const FORMAT_VERSION = 1;

// ─── Serializer Registry ──────────────────────────────────────────

const _serializers = new Map<string, ComponentSerializer<any>>();

/**
 * Register a component serializer.
 * Call this alongside registerComponent — one per component type.
 */
export function registerSerializer<T>(serializer: ComponentSerializer<T>): void {
    _serializers.set(serializer.tag, serializer);
}

/** Get a registered serializer by component tag. */
export function getSerializer(tag: string): ComponentSerializer<any> | undefined {
    return _serializers.get(tag);
}

// ─── Save File Types ──────────────────────────────────────────────

export interface SaveFile {
    formatVersion: number;
    engineVersion: string;
    entities: EntityId[];
    components: Record<string, Record<string, any>>;
}

// ─── Save Pipeline ────────────────────────────────────────────────

/**
 * Serialize an ECS World into a SaveFile object.
 *
 * @param world - The ECS world to serialize.
 * @param engineVersion - The current engine version string.
 * @returns A JSON-safe SaveFile object.
 */
export function saveWorld(world: ECSWorld, engineVersion: string = '1.0.0'): SaveFile {
    const entities = world.getEntities();
    const components: Record<string, Record<string, any>> = {};

    for (const [tag, serializer] of _serializers) {
        const store = world.getStore(tag);
        if (store.size === 0) continue;

        const key = `${tag}@${serializer.version}`;
        const block: Record<string, any> = {};

        for (const [entityId, component] of store.entries()) {
            block[String(entityId)] = serializer.serialize(component);
        }

        components[key] = block;
    }

    return {
        formatVersion: FORMAT_VERSION,
        engineVersion,
        entities,
        components,
    };
}

// ─── Load Pipeline ────────────────────────────────────────────────

/**
 * Parse a versioned component key like "Transform@2".
 * Returns { tag, version } or null if the format is wrong.
 */
function parseComponentKey(key: string): { tag: string; version: number } | null {
    const atIdx = key.lastIndexOf('@');
    if (atIdx === -1) return null;
    const tag = key.substring(0, atIdx);
    const version = parseInt(key.substring(atIdx + 1), 10);
    if (isNaN(version)) return null;
    return { tag, version };
}

/**
 * Load a SaveFile into an ECS World.
 *
 * - Creates all entities first.
 * - For each component block, parses the version, runs migrations,
 *   and attaches components to entities.
 * - Silently skips unknown component types (partial loading).
 *
 * @param world - The ECS world to populate (should be reset first).
 * @param save - The parsed SaveFile.
 * @returns A report of what was loaded and what was skipped.
 */
export function loadWorld(
    world: ECSWorld,
    save: SaveFile
): { loaded: string[]; skipped: string[]; entityCount: number } {
    const loaded: string[] = [];
    const skipped: string[] = [];

    // 1. Create all entities with their saved IDs.
    for (const entityId of save.entities) {
        world.spawnWithId(entityId);
    }

    // 2. Process each component block.
    for (const [key, block] of Object.entries(save.components)) {
        const parsed = parseComponentKey(key);
        if (!parsed) {
            skipped.push(key);
            continue;
        }

        const serializer = _serializers.get(parsed.tag);
        if (!serializer) {
            // Unknown component type — skip gracefully (partial loading).
            console.warn(`B3JS Serialization: Unknown component type "${parsed.tag}", skipping.`);
            skipped.push(key);
            continue;
        }

        for (const [entityIdStr, rawData] of Object.entries(block)) {
            const entityId = parseInt(entityIdStr, 10);
            if (!world.isAlive(entityId)) {
                console.warn(`B3JS Serialization: Entity ${entityId} not found, skipping component "${parsed.tag}".`);
                continue;
            }

            // Migrate if versions differ.
            const migratedData = migrateComponentData(serializer, rawData, parsed.version);
            const component = serializer.deserialize(migratedData);
            world.addComponent(entityId, component);
        }

        loaded.push(parsed.tag);
    }

    return { loaded, skipped, entityCount: save.entities.length };
}
