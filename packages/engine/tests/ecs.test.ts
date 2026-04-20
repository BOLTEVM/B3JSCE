/**
 * B3JS Engine Tests — ECS World
 *
 * Tests for entity lifecycle, component CRUD, and query filtering.
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { ECSWorld } from '../src/ecs/World';
import { resetEntityCounter } from '../src/ecs/Entity';
import type { TransformComponent, HealthComponent } from '../src/ecs/Component';

describe('ECSWorld', () => {
    let world: ECSWorld;

    beforeEach(() => {
        world = new ECSWorld();
        resetEntityCounter();
    });

    test('spawn creates unique entities', () => {
        const a = world.spawn();
        const b = world.spawn();
        expect(a).not.toBe(b);
        expect(world.entityCount).toBe(2);
    });

    test('destroy removes entity and its components', () => {
        const id = world.spawn();
        const transform: TransformComponent = {
            _type: 'Transform',
            positionX: 5, positionY: 0, positionZ: 0,
            rotationX: 0, rotationY: 0, rotationZ: 0, rotationW: 1,
            scaleX: 1, scaleY: 1, scaleZ: 1,
        };
        world.addComponent(id, transform);
        expect(world.hasComponent(id, 'Transform')).toBe(true);

        world.destroy(id);
        expect(world.isAlive(id)).toBe(false);
        expect(world.hasComponent(id, 'Transform')).toBe(false);
    });

    test('addComponent and getComponent round-trip', () => {
        const id = world.spawn();
        const health: HealthComponent = { _type: 'Health', hp: 42, maxHp: 100 };
        world.addComponent(id, health);

        const retrieved = world.getComponent<HealthComponent>(id, 'Health');
        expect(retrieved).toBeDefined();
        expect(retrieved!.hp).toBe(42);
    });

    test('query filters by required components', () => {
        const a = world.spawn();
        const b = world.spawn();
        const c = world.spawn();

        world.addComponent<TransformComponent>(a, {
            _type: 'Transform',
            positionX: 0, positionY: 0, positionZ: 0,
            rotationX: 0, rotationY: 0, rotationZ: 0, rotationW: 1,
            scaleX: 1, scaleY: 1, scaleZ: 1,
        });
        world.addComponent<HealthComponent>(a, { _type: 'Health', hp: 100, maxHp: 100 });

        world.addComponent<TransformComponent>(b, {
            _type: 'Transform',
            positionX: 0, positionY: 0, positionZ: 0,
            rotationX: 0, rotationY: 0, rotationZ: 0, rotationW: 1,
            scaleX: 1, scaleY: 1, scaleZ: 1,
        });
        // b has Transform but NOT Health

        world.addComponent<HealthComponent>(c, { _type: 'Health', hp: 50, maxHp: 50 });
        // c has Health but NOT Transform

        const both = world.query(['Transform', 'Health']);
        expect(both).toEqual([a]);

        const onlyTransform = world.query(['Transform']);
        expect(onlyTransform.sort()).toEqual([a, b].sort());
    });

    test('addDefaultComponent uses registry defaults', () => {
        const id = world.spawn();
        world.addDefaultComponent(id, 'Health');

        const health = world.getComponent<HealthComponent>(id, 'Health');
        expect(health).toBeDefined();
        expect(health!.hp).toBe(100);
        expect(health!.maxHp).toBe(100);
    });

    test('reset clears all entities and stores', () => {
        const id = world.spawn();
        world.addComponent<HealthComponent>(id, { _type: 'Health', hp: 1, maxHp: 1 });
        
        world.reset();
        expect(world.entityCount).toBe(0);
        expect(world.query(['Health'])).toEqual([]);
    });
});
