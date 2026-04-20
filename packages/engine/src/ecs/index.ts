/**
 * B3JS ECS — Public API
 *
 * Barrel export for the Entity-Component-System framework.
 */

// Entity
export { type EntityId, createEntity, resetEntityCounter, peekNextEntityId, ensureEntityIdAbove } from './Entity';

// Components
export {
    type ComponentBase,
    type ComponentDefinition,
    registerComponent,
    getComponentDefinition,
    getRegisteredComponentTags,

    // Concrete component interfaces
    type TransformComponent,
    type PhysicsComponent,
    type HealthComponent,
    type ActorComponent,
    type CombatComponent,
    type VehicleComponent,
    type NetworkSyncComponent,
    type OptimizationComponent,
    type LogicComponent,
} from './Component';

// Component Store
export { ComponentStore } from './ComponentStore';

// Systems
export {
    type SystemDefinition,
    registerSystem,
    getSortedSystems,
    unregisterSystem,
    clearSystems,
} from './System';

// World
export { ECSWorld } from './World';
