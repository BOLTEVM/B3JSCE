/**
 * B3JS Engine Tests — Serialization
 *
 * Tests for the component-centric versioned serialization system,
 * including save/load round-trips and version migration.
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { ECSWorld } from '../src/ecs/World';
import { resetEntityCounter } from '../src/ecs/Entity';
import type { TransformComponent, HealthComponent } from '../src/ecs/Component';
import { registerSerializer, saveWorld, loadWorld } from '../src/serialization/SerializationRegistry';
import type { ComponentSerializer } from '../src/serialization/ComponentSerializer';

// ─── Register Test Serializers ────────────────────────────────────

const TransformSerializer: ComponentSerializer<TransformComponent> = {
    tag: 'Transform',
    version: 1,
    serialize(c) {
        return {
            pos: [c.positionX, c.positionY, c.positionZ],
            rot: [c.rotationX, c.rotationY, c.rotationZ, c.rotationW],
            scl: [c.scaleX, c.scaleY, c.scaleZ],
        };
    },
    deserialize(d) {
        return {
            _type: 'Transform',
            positionX: d.pos[0], positionY: d.pos[1], positionZ: d.pos[2],
            rotationX: d.rot[0], rotationY: d.rot[1], rotationZ: d.rot[2], rotationW: d.rot[3],
            scaleX: d.scl[0], scaleY: d.scl[1], scaleZ: d.scl[2],
        };
    },
};

const HealthSerializer: ComponentSerializer<HealthComponent> = {
    tag: 'Health',
    version: 2,
    serialize(c) {
        return { hp: c.hp, maxHp: c.maxHp };
    },
    deserialize(d) {
        return { _type: 'Health', hp: d.hp, maxHp: d.maxHp };
    },
    migrate(data, fromVersion) {
        if (fromVersion === 1) {
            // v1 only had { hp: number }, no maxHp
            return { hp: data.hp, maxHp: data.hp };
        }
        return data;
    },
};

// Register before tests run
registerSerializer(TransformSerializer);
registerSerializer(HealthSerializer);

// ─── Tests ────────────────────────────────────────────────────────

describe('Serialization', () => {
    let world: ECSWorld;

    beforeEach(() => {
        world = new ECSWorld();
        resetEntityCounter();
    });

    test('saveWorld produces correct format', () => {
        const id = world.spawn();
        world.addComponent<TransformComponent>(id, {
            _type: 'Transform',
            positionX: 10, positionY: 20, positionZ: 30,
            rotationX: 0, rotationY: 0, rotationZ: 0, rotationW: 1,
            scaleX: 1, scaleY: 1, scaleZ: 1,
        });

        const save = saveWorld(world, '1.0.0');

        expect(save.formatVersion).toBe(1);
        expect(save.engineVersion).toBe('1.0.0');
        expect(save.entities).toEqual([id]);
        expect(save.components['Transform@1']).toBeDefined();
        expect(save.components['Transform@1'][String(id)].pos).toEqual([10, 20, 30]);
    });

    test('loadWorld round-trips correctly', () => {
        const id = world.spawn();
        world.addComponent<HealthComponent>(id, { _type: 'Health', hp: 42, maxHp: 100 });

        const save = saveWorld(world);

        // Load into a fresh world
        const world2 = new ECSWorld();
        resetEntityCounter();
        const report = loadWorld(world2, save);

        expect(report.entityCount).toBe(1);
        expect(report.loaded).toContain('Health');

        const health = world2.getComponent<HealthComponent>(id, 'Health');
        expect(health).toBeDefined();
        expect(health!.hp).toBe(42);
        expect(health!.maxHp).toBe(100);
    });

    test('loadWorld migrates old versions', () => {
        // Simulate a save file from "Health@1" (old version)
        const oldSave = {
            formatVersion: 1,
            engineVersion: '0.9.0',
            entities: [1],
            components: {
                'Health@1': {
                    '1': { hp: 75 }, // v1 format: no maxHp
                },
            },
        };

        const world2 = new ECSWorld();
        resetEntityCounter();
        const report = loadWorld(world2, oldSave);

        expect(report.loaded).toContain('Health');

        const health = world2.getComponent<HealthComponent>(1, 'Health');
        expect(health).toBeDefined();
        expect(health!.hp).toBe(75);
        expect(health!.maxHp).toBe(75); // Migrated: maxHp defaults to hp
    });

    test('loadWorld skips unknown component types gracefully', () => {
        const save = {
            formatVersion: 1,
            engineVersion: '1.0.0',
            entities: [1],
            components: {
                'FutureThing@1': {
                    '1': { foo: 'bar' },
                },
            },
        };

        const world2 = new ECSWorld();
        resetEntityCounter();
        const report = loadWorld(world2, save);

        expect(report.skipped).toContain('FutureThing@1');
        expect(report.entityCount).toBe(1);
        expect(world2.isAlive(1)).toBe(true);
    });
});
