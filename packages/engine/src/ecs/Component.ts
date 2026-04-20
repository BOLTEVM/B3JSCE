/**
 * B3JS ECS — Component
 *
 * Components are plain data objects. They carry no behavior.
 * Each component type is identified by a unique string tag.
 *
 * This module provides:
 *  - A global component-type registry so new component types can be
 *    registered at module load time.
 *  - A factory helper for creating typed component definitions.
 */

/** Every component must carry at least its type tag. */
export interface ComponentBase {
    readonly _type: string;
}

/**
 * Registry entry for a component type.
 * Stores the default factory and the string tag.
 */
export interface ComponentDefinition<T extends ComponentBase = ComponentBase> {
    /** Unique string tag, e.g. "Transform", "Health". */
    tag: string;
    /** Creates a default instance of this component. */
    create: () => T;
}

// ─── Global Registry ──────────────────────────────────────────────

const _registry = new Map<string, ComponentDefinition>();

/**
 * Register a new component type globally.
 * Call this once per component, typically at module top-level.
 *
 * @example
 * ```ts
 * registerComponent({
 *   tag: 'Health',
 *   create: () => ({ _type: 'Health', hp: 100, maxHp: 100 }),
 * });
 * ```
 */
export function registerComponent<T extends ComponentBase>(def: ComponentDefinition<T>): ComponentDefinition<T> {
    if (_registry.has(def.tag)) {
        console.warn(`B3JS ECS: Component "${def.tag}" is already registered. Overwriting.`);
    }
    _registry.set(def.tag, def as ComponentDefinition);
    return def;
}

/** Retrieve a registered component definition by tag. */
export function getComponentDefinition(tag: string): ComponentDefinition | undefined {
    return _registry.get(tag);
}

/** List all registered component tags. */
export function getRegisteredComponentTags(): string[] {
    return Array.from(_registry.keys());
}

// ─── Concrete Component Interfaces ────────────────────────────────
// These are the initial set of component data shapes.
// They are plain interfaces — no classes, no methods.

export interface TransformComponent extends ComponentBase {
    _type: 'Transform';
    positionX: number;
    positionY: number;
    positionZ: number;
    rotationX: number;
    rotationY: number;
    rotationZ: number;
    rotationW: number;
    scaleX: number;
    scaleY: number;
    scaleZ: number;
}

export interface PhysicsComponent extends ComponentBase {
    _type: 'Physics';
    mass: number;
    bodyType: 'dynamic' | 'static' | 'kinematic';
    shapeType: 'box' | 'sphere' | 'plane';
    shapeSizeX: number;
    shapeSizeY: number;
    shapeSizeZ: number;
}

export interface HealthComponent extends ComponentBase {
    _type: 'Health';
    hp: number;
    maxHp: number;
}

export interface ActorComponent extends ComponentBase {
    _type: 'Actor';
    teamId: number;
    speed: number;
    perceptionRadius: number;
}

export interface CombatComponent extends ComponentBase {
    _type: 'Combat';
    isWeapon: boolean;
    weaponMode: 'physical' | 'hitscan';
    damage: number;
    fireRate: number;
    projectileForce: number;
    lastFireTime: number;
}

export interface VehicleComponent extends ComponentBase {
    _type: 'Vehicle';
    vehicleId: string;
    seats: { name: string; offsetX: number; offsetY: number; offsetZ: number; occupantId: string | null }[];
}

export interface NetworkSyncComponent extends ComponentBase {
    _type: 'NetworkSync';
    networkId: string;
    isRemote: boolean;
    syncTransform: boolean;
}

export interface OptimizationComponent extends ComponentBase {
    _type: 'Optimization';
    isStatic: boolean;
    isInstanced: boolean;
    instanceIndex: number;
    zoneId: string;
}

// ─── Register Default Components ──────────────────────────────────

registerComponent<TransformComponent>({
    tag: 'Transform',
    create: () => ({
        _type: 'Transform',
        positionX: 0, positionY: 0, positionZ: 0,
        rotationX: 0, rotationY: 0, rotationZ: 0, rotationW: 1,
        scaleX: 1, scaleY: 1, scaleZ: 1,
    }),
});

registerComponent<PhysicsComponent>({
    tag: 'Physics',
    create: () => ({
        _type: 'Physics',
        mass: 1,
        bodyType: 'dynamic',
        shapeType: 'box',
        shapeSizeX: 0.5, shapeSizeY: 0.5, shapeSizeZ: 0.5,
    }),
});

registerComponent<HealthComponent>({
    tag: 'Health',
    create: () => ({ _type: 'Health', hp: 100, maxHp: 100 }),
});

registerComponent<ActorComponent>({
    tag: 'Actor',
    create: () => ({
        _type: 'Actor',
        teamId: 0,
        speed: 0.1,
        perceptionRadius: 10,
    }),
});

registerComponent<CombatComponent>({
    tag: 'Combat',
    create: () => ({
        _type: 'Combat',
        isWeapon: false,
        weaponMode: 'physical',
        damage: 10,
        fireRate: 0.5,
        projectileForce: 50,
        lastFireTime: 0,
    }),
});

registerComponent<VehicleComponent>({
    tag: 'Vehicle',
    create: () => ({
        _type: 'Vehicle',
        vehicleId: '',
        seats: [],
    }),
});

registerComponent<NetworkSyncComponent>({
    tag: 'NetworkSync',
    create: () => ({
        _type: 'NetworkSync',
        networkId: '',
        isRemote: false,
        syncTransform: true,
    }),
});

registerComponent<OptimizationComponent>({
    tag: 'Optimization',
    create: () => ({
        _type: 'Optimization',
        isStatic: false,
        isInstanced: false,
        instanceIndex: -1,
        zoneId: '',
    }),
});

export interface LogicComponent extends ComponentBase {
    _type: 'Logic';
    sensors: any[];
    controllers: any[];
    actuators: any[];
}

registerComponent<LogicComponent>({
    tag: 'Logic',
    create: () => ({
        _type: 'Logic',
        sensors: [],
        controllers: [],
        actuators: [],
    }),
});
