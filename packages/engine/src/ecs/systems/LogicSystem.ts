import { SystemDefinition } from '../System';
import { LogicComponent } from '../Component';

export const LogicSystem: SystemDefinition = {
    name: 'LogicSystem',
    requiredComponents: ['Logic'],
    priority: 50, // Runs before physics/health but after input
    execute: (world, dt) => {
        const engine = (world as any)._engineRef;
        if (!engine) return;

        const logicStore = world.getStore<LogicComponent>('Logic');

        world.query(['Logic']).forEach(entityId => {
            const comp = logicStore.get(entityId);
            if (!comp) return;

            // We must find the B3Object associated with this entityId,
            // as Logic Bricks currently expect the full B3Object context.
            const b3obj = engine.objects.find((o: any) => o.ecsEntityId === entityId);
            if (!b3obj) return;

            // Execute logic node sequences
            comp.sensors.forEach((s: any) => s.update(dt, b3obj, engine));
            comp.controllers.forEach((c: any) => c.update(dt, b3obj, engine));
            comp.actuators.forEach((a: any) => a.update(dt, b3obj, engine));
        });
    }
};
