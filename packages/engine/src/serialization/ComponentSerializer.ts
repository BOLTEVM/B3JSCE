/**
 * B3JS Serialization — ComponentSerializer
 *
 * Defines the versioned serialization contract for each component type.
 * Each component type gets its own serializer with explicit serialize,
 * deserialize, and chained migrate functions.
 *
 * Save format uses component-centric blocks:
 *   "Transform@2": { "1": { x: 10, y: 20 }, "2": { x: 5, y: 7 } }
 */

/**
 * Contract: every component type must implement this interface
 * to participate in save/load.
 */
export interface ComponentSerializer<T> {
    /** The component tag (must match the ECS registry tag). */
    tag: string;

    /** Current schema version for this component type. */
    version: number;

    /** Serialize a component instance to a plain JSON-safe object. */
    serialize(component: T): any;

    /** Deserialize a plain object (at current version) into a component. */
    deserialize(data: any): T;

    /**
     * Migrate data from an older version toward the current version.
     * Called repeatedly: v1 → v2 → v3 → ... → current.
     *
     * @param data - The raw saved data at `fromVersion`.
     * @param fromVersion - The version the data was saved at.
     * @returns The data upgraded by exactly one version.
     *
     * If not provided, data is passed through unmodified (no migration needed).
     */
    migrate?: (data: any, fromVersion: number) => any;
}

/**
 * Run the full migration chain on a piece of component data.
 *
 * @param serializer - The serializer for the target component type.
 * @param data - The raw saved data.
 * @param savedVersion - The version the data was originally saved at.
 * @returns Data at the serializer's current version, ready for deserialize().
 */
export function migrateComponentData<T>(
    serializer: ComponentSerializer<T>,
    data: any,
    savedVersion: number
): any {
    let current = data;
    let version = savedVersion;

    while (version < serializer.version) {
        if (serializer.migrate) {
            current = serializer.migrate(current, version);
        }
        version++;
    }

    return current;
}
