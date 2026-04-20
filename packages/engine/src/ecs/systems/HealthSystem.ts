import { SystemDefinition } from '../System';
import { HealthComponent } from '../Component';

export const HealthSystem: SystemDefinition = {
    name: 'HealthSystem',
    requiredComponents: ['Health'],
    priority: 100, // Runs after gameplay logic
    execute: (world, dt) => {
        const healthStore = world.getStore<HealthComponent>('Health');

        world.query(['Health']).forEach(entityId => {
            const comp = healthStore.get(entityId);
            if (comp && comp.hp <= 0) {
                // Here we would typically emit a death event if we had an event bus.
            }
        });
    }
};
