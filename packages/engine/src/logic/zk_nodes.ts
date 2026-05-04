/**
 * ZK Logic Bricks — Zero Knowledge Sensors & Actuators
 *
 * Extends the Sensor → Controller → Actuator pipeline with
 * ZK-aware nodes for privacy-preserving game mechanics.
 *
 * Includes the ZK Zoning system — spatial regions that dynamically
 * toggle ZK privacy policies for objects entering/exiting the zone.
 */

import { Sensor, Actuator, B3ObjectRef, B3EngineRef } from './base';
import type { NodeInfo } from './base';
import type { ZKZonePolicy, ZKZoneDefinition } from '@b3js/zk';

// ═══════════════════════════════════════════════════════════════════
//  SENSORS
// ═══════════════════════════════════════════════════════════════════

/**
 * ZKZoneSensor — Detects when a B3Object enters or exits a ZK privacy zone.
 *
 * Evaluates the object's position against all registered ZK zones.
 * Sets `positive = true` when the object is INSIDE any active zone
 * matching the configured policy filter.
 *
 * This is the spatial trigger for dynamic privacy — when a player walks
 * into a "Privacy Zone", their state transitions to ZK-committed.
 */
export class ZKZoneSensor extends Sensor {
    /** Only trigger for zones with this specific policy (or 'any' for all). */
    public policyFilter: ZKZonePolicy | 'any' = 'any';

    /** The zone the object is currently inside (null if outside all zones). */
    public currentZone: ZKZoneDefinition | null = null;

    /** Whether the sensor just transitioned (entered or exited). */
    public justTransitioned: boolean = false;

    /** Previous frame's inside state (for edge detection). */
    private wasInside: boolean = false;

    constructor(policyFilter: ZKZonePolicy | 'any' = 'any') {
        super();
        this.policyFilter = policyFilter;
    }

    getTypeName() { return 'ZKZoneSensor'; }

    static getNodeInfo(): NodeInfo {
        return {
            type: 'ZKZoneSensor',
            label: 'ZK Zone Sensor',
            category: 'ZK Privacy',
            color: '#00ff88',
            description: 'Detects entry/exit from ZK privacy zones',
            icon: '🔒'
        };
    }

    update(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef): void {
        if (!engine.zk) { this.positive = false; return; }

        const pos = b3obj.object.position;
        const zones: ZKZoneDefinition[] = engine.zk.activeZones || [];

        let insideZone: ZKZoneDefinition | null = null;

        for (const zone of zones) {
            if (!zone.active) continue;
            if (this.policyFilter !== 'any' && zone.policy !== this.policyFilter) continue;

            // Spherical zone check
            const dx = pos.x - zone.center.x;
            const dy = pos.y - zone.center.y;
            const dz = pos.z - zone.center.z;
            const distSq = dx * dx + dy * dy + dz * dz;

            if (distSq <= zone.radius * zone.radius) {
                insideZone = zone;
                break;
            }
        }

        const isInside = insideZone !== null;
        this.justTransitioned = isInside !== this.wasInside;
        this.wasInside = isInside;
        this.currentZone = insideZone;
        this.positive = isInside;
    }

    toJSON() {
        return {
            ...super.toJSON(),
            type: 'ZKZoneSensor',
            policyFilter: this.policyFilter,
        };
    }

    static fromJSON(data: any): ZKZoneSensor {
        const n = new ZKZoneSensor(data.policyFilter || 'any');
        n.id = data.id;
        n.guiMetadata = data.guiMetadata;
        n.enabled = data.enabled;
        return n;
    }
}

/**
 * ZKProximitySensor — Fires when another player's commitment suggests
 * they are within a provable range (grid-based proximity).
 *
 * Unlike standard CollisionSensor, this works with hidden positions:
 * it checks if any remote commitment's public signals indicate
 * proximity to the local player's grid cell.
 */
export class ZKProximitySensor extends Sensor {
    /** Grid radius to check (in grid cells, where each cell = 10 world units). */
    public gridRadius: number = 3;

    /** Number of nearby commitments detected. */
    public nearbyCount: number = 0;

    constructor(gridRadius: number = 3) {
        super();
        this.gridRadius = gridRadius;
    }

    getTypeName() { return 'ZKProximitySensor'; }

    static getNodeInfo(): NodeInfo {
        return {
            type: 'ZKProximitySensor',
            label: 'ZK Proximity',
            category: 'ZK Privacy',
            color: '#00ff88',
            description: 'Detects nearby players via commitment proximity',
            icon: '📡'
        };
    }

    update(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef): void {
        if (!engine.zk || !engine.zk.commitmentStore) {
            this.positive = false;
            this.nearbyCount = 0;
            return;
        }

        // Get the local player's grid position
        const pos = b3obj.object.position;
        const gridSize = engine.zk.config.gridResolution;
        const localGridX = Math.floor(pos.x / gridSize);
        const localGridZ = Math.floor(pos.z / gridSize);

        // Check remote commitments for proximity within gridRadius
        const remoteCommitments = engine.zk.commitmentStore.getRemoteCommitments();
        let count = 0;

        for (const rc of remoteCommitments) {
            if (rc.type !== 'position') continue;

            // If the commitment's public signals contain grid coordinates,
            // check if they fall within gridRadius cells of our position.
            if (rc.publicSignals && rc.publicSignals.length >= 2) {
                const remoteGridX = Number(rc.publicSignals[0]);
                const remoteGridZ = Number(rc.publicSignals[1]);
                const dx = Math.abs(remoteGridX - localGridX);
                const dz = Math.abs(remoteGridZ - localGridZ);

                if (dx <= this.gridRadius && dz <= this.gridRadius) {
                    count++;
                }
            } else {
                // No grid hints available — count as potentially nearby
                count++;
            }
        }

        this.nearbyCount = count;
        this.positive = count > 0;
    }

    toJSON() {
        return {
            ...super.toJSON(),
            type: 'ZKProximitySensor',
            gridRadius: this.gridRadius,
        };
    }

    static fromJSON(data: any): ZKProximitySensor {
        const n = new ZKProximitySensor(data.gridRadius || 3);
        n.id = data.id;
        n.guiMetadata = data.guiMetadata;
        n.enabled = data.enabled;
        return n;
    }
}

/**
 * ZKRevealSensor — Fires when a player voluntarily reveals their state.
 *
 * Monitors the commitment store for reveal events (e.g., when a player
 * fires a weapon, their position is temporarily revealed).
 */
export class ZKRevealSensor extends Sensor {
    /** Which type of reveal to listen for. */
    public revealType: 'position' | 'inventory' | 'bid' | 'any' = 'any';

    /** ID of the player who revealed (if any). */
    public revealedPlayerId: string | null = null;

    /** Pending reveal event (set by event listener, consumed by update). */
    private pendingReveal: { type: string; objectId: string } | null = null;

    /** Event listener reference for cleanup. */
    private onRevealHandler: ((e: Event) => void) | null = null;

    /** Timestamp of the last consumed event (for auto-expiry). */
    private lastRevealTime: number = 0;

    /** How long the sensor stays positive after a reveal (ms). */
    private revealWindow: number = 1000;

    constructor(revealType: 'position' | 'inventory' | 'bid' | 'any' = 'any') {
        super();
        this.revealType = revealType;

        // Listen for reveal events dispatched by ZKRevealActuator
        this.onRevealHandler = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (this.revealType === 'any' || detail.type === this.revealType) {
                this.pendingReveal = { type: detail.type, objectId: detail.objectId };
            }
        };
        if (typeof window !== 'undefined') {
            window.addEventListener('b3js:zk:reveal', this.onRevealHandler);
        }
    }

    getTypeName() { return 'ZKRevealSensor'; }

    static getNodeInfo(): NodeInfo {
        return {
            type: 'ZKRevealSensor',
            label: 'ZK Reveal',
            category: 'ZK Privacy',
            color: '#ffaa00',
            description: 'Fires when a player reveals hidden state',
            icon: '👁️'
        };
    }

    update(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef): void {
        // Consume pending reveal event
        if (this.pendingReveal) {
            this.positive = true;
            this.revealedPlayerId = this.pendingReveal.objectId;
            this.lastRevealTime = Date.now();
            this.pendingReveal = null;
        } else if (this.positive && Date.now() - this.lastRevealTime >= this.revealWindow) {
            // Auto-expire after the reveal window
            this.positive = false;
            this.revealedPlayerId = null;
        }
    }

    dispose() {
        if (this.onRevealHandler && typeof window !== 'undefined') {
            window.removeEventListener('b3js:zk:reveal', this.onRevealHandler);
            this.onRevealHandler = null;
        }
    }

    toJSON() {
        return {
            ...super.toJSON(),
            type: 'ZKRevealSensor',
            revealType: this.revealType,
        };
    }

    static fromJSON(data: any): ZKRevealSensor {
        const n = new ZKRevealSensor(data.revealType || 'any');
        n.id = data.id;
        n.guiMetadata = data.guiMetadata;
        n.enabled = data.enabled;
        return n;
    }
}

// ═══════════════════════════════════════════════════════════════════
//  ACTUATORS
// ═══════════════════════════════════════════════════════════════════

/**
 * ZKCommitActuator — Generates a commitment and publishes it.
 *
 * When executed by a controller, commits the current state
 * (position, inventory, or bid) and pushes the hash to SpacetimeDB.
 */
export class ZKCommitActuator extends Actuator {
    /** What type of state to commit. */
    public commitmentType: 'position' | 'inventory' | 'bid' = 'inventory';

    /** For bid commits: the market ID. */
    public marketId: string = '';

    /** For bid commits: the bid amount. */
    public bidAmount: bigint = 0n;

    /** Cooldown to prevent spamming commits (ms). */
    public cooldownMs: number = 1000;

    /** Last commit timestamp. */
    private lastCommitTime: number = 0;

    constructor(commitmentType: 'position' | 'inventory' | 'bid' = 'inventory') {
        super();
        this.commitmentType = commitmentType;
    }

    getTypeName() { return 'ZKCommitActuator'; }

    static getNodeInfo(): NodeInfo {
        return {
            type: 'ZKCommitActuator',
            label: 'ZK Commit',
            category: 'ZK Privacy',
            color: '#00ff88',
            description: 'Generates and publishes a ZK commitment',
            icon: '🔐'
        };
    }

    execute(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef): void {
        if (!engine.zk || !engine.zk.commitmentStore) return;

        const now = Date.now();
        if (now - this.lastCommitTime < this.cooldownMs) return;
        this.lastCommitTime = now;

        const store = engine.zk.commitmentStore;

        switch (this.commitmentType) {
            case 'position': {
                const pos = b3obj.object.position;
                const hash = store.commitPosition(pos.x, pos.y, pos.z);
                console.log(`B3JS ZK: Position committed → 0x${hash.toString(16).substring(0, 12)}...`);

                // Push to SpacetimeDB
                if (engine.spacetime) {
                    engine.spacetime.pushZKCommitment?.('position', '0x' + hash.toString(16));
                }
                break;
            }
            case 'inventory': {
                // Build inventory slots from B3Object's inventory manager
                if (b3obj.inventory) {
                    const slots = b3obj.inventory.items.map((item: any) => ({
                        itemId: this.hashItemName(item.name),
                        quantity: item.quantity || 1,
                    }));
                    const hash = store.commitInventory(slots);
                    console.log(`B3JS ZK: Inventory committed (${slots.length} items) → 0x${hash.toString(16).substring(0, 12)}...`);

                    if (engine.spacetime) {
                        engine.spacetime.pushZKCommitment?.('inventory', '0x' + hash.toString(16));
                    }
                }
                break;
            }
            case 'bid': {
                if (this.marketId && this.bidAmount > 0n) {
                    const hash = store.commitBid(this.marketId, this.bidAmount);
                    console.log(`B3JS ZK: Bid committed for ${this.marketId} → 0x${hash.toString(16).substring(0, 12)}...`);

                    if (engine.spacetime) {
                        engine.spacetime.pushZKCommitment?.('bid', '0x' + hash.toString(16));
                    }
                }
                break;
            }
        }
    }

    update(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef): void { /* Passive */ }

    /** Simple hash of item name to a numeric ID for circuit compatibility. */
    private hashItemName(name: string): number {
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = ((hash << 5) - hash) + name.charCodeAt(i);
            hash |= 0; // Convert to 32-bit integer
        }
        return Math.abs(hash);
    }

    toJSON() {
        return {
            ...super.toJSON(),
            type: 'ZKCommitActuator',
            commitmentType: this.commitmentType,
            marketId: this.marketId,
            bidAmount: this.bidAmount.toString(),
            cooldownMs: this.cooldownMs,
        };
    }

    static fromJSON(data: any): ZKCommitActuator {
        const n = new ZKCommitActuator(data.commitmentType || 'inventory');
        n.id = data.id;
        n.guiMetadata = data.guiMetadata;
        n.enabled = data.enabled;
        n.marketId = data.marketId || '';
        n.bidAmount = BigInt(data.bidAmount || '0');
        n.cooldownMs = data.cooldownMs || 1000;
        return n;
    }
}

/**
 * ZKRevealActuator — Temporarily reveals hidden state.
 *
 * Used for game mechanics that require state visibility:
 * - Firing a weapon reveals position for N seconds
 * - Trading reveals inventory to the counterparty
 * - Winning an auction reveals the bid
 */
export class ZKRevealActuator extends Actuator {
    /** What to reveal. */
    public revealType: 'position' | 'inventory' = 'position';

    /** How long the reveal lasts (ms). 0 = permanent until re-committed. */
    public revealDuration: number = 5000;

    /** Whether currently in a reveal window. */
    public isRevealed: boolean = false;

    /** When the current reveal started. */
    private revealStart: number = 0;

    constructor(revealType: 'position' | 'inventory' = 'position', revealDuration: number = 5000) {
        super();
        this.revealType = revealType;
        this.revealDuration = revealDuration;
    }

    getTypeName() { return 'ZKRevealActuator'; }

    static getNodeInfo(): NodeInfo {
        return {
            type: 'ZKRevealActuator',
            label: 'ZK Reveal',
            category: 'ZK Privacy',
            color: '#ffaa00',
            description: 'Temporarily reveals hidden state',
            icon: '👁️'
        };
    }

    execute(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef): void {
        if (!engine.zk || !engine.zk.commitmentStore) return;

        this.isRevealed = true;
        this.revealStart = Date.now();

        const store = engine.zk.commitmentStore;

        if (this.revealType === 'position') {
            const pos = b3obj.object.position;
            console.log(`B3JS ZK: Position REVEALED at (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}) for ${this.revealDuration}ms`);

            // Dispatch reveal event for other sensors/systems
            window.dispatchEvent(new CustomEvent('b3js:zk:reveal', {
                detail: {
                    type: 'position',
                    objectId: b3obj.id,
                    position: { x: pos.x, y: pos.y, z: pos.z },
                    duration: this.revealDuration,
                }
            }));

            // Push plaintext position to SpacetimeDB temporarily
            if (engine.spacetime) {
                engine.spacetime.pushZKReveal?.(this.revealType, {
                    x: pos.x, y: pos.y, z: pos.z,
                    duration: this.revealDuration,
                });
            }
        } else if (this.revealType === 'inventory') {
            console.log(`B3JS ZK: Inventory REVEALED for ${this.revealDuration}ms`);
            window.dispatchEvent(new CustomEvent('b3js:zk:reveal', {
                detail: {
                    type: 'inventory',
                    objectId: b3obj.id,
                    duration: this.revealDuration,
                }
            }));
        }
    }

    update(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef): void {
        // Auto-expire reveals
        if (this.isRevealed && this.revealDuration > 0) {
            if (Date.now() - this.revealStart >= this.revealDuration) {
                this.isRevealed = false;
                console.log(`B3JS ZK: ${this.revealType} reveal expired. Re-hiding.`);

                // Re-commit the state to hide it again
                window.dispatchEvent(new CustomEvent('b3js:zk:rehide', {
                    detail: { type: this.revealType, objectId: b3obj.id }
                }));
            }
        }
    }

    toJSON() {
        return {
            ...super.toJSON(),
            type: 'ZKRevealActuator',
            revealType: this.revealType,
            revealDuration: this.revealDuration,
        };
    }

    static fromJSON(data: any): ZKRevealActuator {
        const n = new ZKRevealActuator(data.revealType || 'position', data.revealDuration || 5000);
        n.id = data.id;
        n.guiMetadata = data.guiMetadata;
        n.enabled = data.enabled;
        return n;
    }
}

/**
 * ZKProveActuator — Generates a ZK proof and submits it to SpacetimeDB.
 *
 * This is the general-purpose proving actuator. When triggered,
 * it generates a Groth16 proof for the specified circuit and
 * pushes it to the multiplayer layer for server-side verification.
 */
export class ZKProveActuator extends Actuator {
    /** Name of the circuit to generate a proof for. */
    public circuitName: string = 'inventory_proof';

    /** Whether a proof is currently being generated. */
    public isProving: boolean = false;

    /** Last proof generation time (ms). */
    public lastProveDuration: number = 0;

    constructor(circuitName: string = 'inventory_proof') {
        super();
        this.circuitName = circuitName;
    }

    getTypeName() { return 'ZKProveActuator'; }

    static getNodeInfo(): NodeInfo {
        return {
            type: 'ZKProveActuator',
            label: 'ZK Prove',
            category: 'ZK Privacy',
            color: '#00ff88',
            description: 'Generates a ZK proof and submits it',
            icon: '🧮'
        };
    }

    execute(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef): void {
        if (!engine.zk || this.isProving) return;

        const store = engine.zk.commitmentStore;
        if (!store) return;

        this.isProving = true;
        const startTime = Date.now();

        // Build circuit inputs based on circuit type
        let inputs: Record<string, any> | null = null;

        if (this.circuitName === 'inventory_proof') {
            // Default: prove at least 1 of any item
            inputs = store.buildInventoryProofInputs(0, 0);
        } else if (this.circuitName === 'sealed_bid') {
            // Would need market context — use first pending bid
            const summary = store.getSummary();
            if (summary.pendingBids > 0) {
                // Get the first bid's inputs
                const hashes = store.getCommitmentHashes();
                for (const [key] of hashes) {
                    if (key.startsWith('bid_')) {
                        const marketId = key.replace('bid_', '');
                        inputs = store.buildBidProofInputs(marketId, 0n, BigInt(Number.MAX_SAFE_INTEGER));
                        break;
                    }
                }
            }
        }

        if (!inputs) {
            this.isProving = false;
            console.warn(`B3JS ZK: No inputs available for circuit "${this.circuitName}"`);
            return;
        }

        // Generate proof asynchronously (via Web Worker)
        engine.zk.prove(this.circuitName, inputs)
            .then((proof: any) => {
                this.lastProveDuration = Date.now() - startTime;
                this.isProving = false;
                console.log(`B3JS ZK: Proof generated for "${this.circuitName}" in ${this.lastProveDuration}ms`);

                // Submit to SpacetimeDB
                if (engine.spacetime) {
                    engine.spacetime.pushZKProof?.(this.circuitName, JSON.stringify(proof));
                }
            })
            .catch((err: any) => {
                this.isProving = false;
                console.error(`B3JS ZK: Proof generation failed for "${this.circuitName}"`, err);
            });
    }

    update(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef): void { /* Passive */ }

    toJSON() {
        return {
            ...super.toJSON(),
            type: 'ZKProveActuator',
            circuitName: this.circuitName,
        };
    }

    static fromJSON(data: any): ZKProveActuator {
        const n = new ZKProveActuator(data.circuitName || 'inventory_proof');
        n.id = data.id;
        n.guiMetadata = data.guiMetadata;
        n.enabled = data.enabled;
        return n;
    }
}

/**
 * ZKZoneActuator — Creates or modifies dynamic ZK privacy zones at runtime.
 *
 * When executed, defines a spherical region around the parent B3Object
 * with a configurable privacy policy. Objects entering this zone
 * are automatically transitioned to ZK-committed state.
 *
 * Use cases:
 * - Safe rooms where inventory is hidden
 * - Trading zones with sealed-bid enforcement
 * - Private areas where position is obscured
 * - Dynamic fog-of-war regions that expand/contract
 */
export class ZKZoneActuator extends Actuator {
    /** Human-readable zone name. */
    public zoneName: string = 'Privacy Zone';

    /** Zone radius in world units. */
    public radius: number = 30;

    /** Privacy policy to enforce within the zone. */
    public policy: ZKZonePolicy = 'full_privacy';

    /** Whether the zone should be active on creation. */
    public startActive: boolean = true;

    /** Internal zone ID (set after creation). */
    private zoneId: string | null = null;

    /** Whether the zone has been created. */
    private created: boolean = false;

    /** Cached engine reference for disposal cleanup. */
    private _lastEngine: B3EngineRef = null;

    constructor(
        zoneName: string = 'Privacy Zone',
        radius: number = 30,
        policy: ZKZonePolicy = 'full_privacy'
    ) {
        super();
        this.zoneName = zoneName;
        this.radius = radius;
        this.policy = policy;
    }

    getTypeName() { return 'ZKZoneActuator'; }

    static getNodeInfo(): NodeInfo {
        return {
            type: 'ZKZoneActuator',
            label: 'ZK Zone',
            category: 'ZK Privacy',
            color: '#00ff88',
            description: 'Creates a dynamic ZK privacy zone',
            icon: '🛡️'
        };
    }

    execute(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef): void {
        if (!engine.zk) return;
        this._lastEngine = engine;

        const pos = b3obj.object.position;

        const zone: ZKZoneDefinition = {
            id: this.zoneId || `zkzone_${b3obj.id}_${Date.now()}`,
            name: this.zoneName,
            center: { x: pos.x, y: pos.y, z: pos.z },
            radius: this.radius,
            policy: this.policy,
            active: this.startActive,
            lobbyId: engine.spacetime?.activeLobbyId || undefined,
        };

        if (!this.created) {
            // Register the zone with the ZK manager
            if (!engine.zk.activeZones) engine.zk.activeZones = [];
            engine.zk.activeZones.push(zone);
            this.zoneId = zone.id;
            this.created = true;

            console.log(`B3JS ZK: Zone "${this.zoneName}" created (r=${this.radius}, policy=${this.policy})`);

            // Sync zone to SpacetimeDB
            if (engine.spacetime) {
                engine.spacetime.pushZKZone?.(zone);
            }
        } else {
            // Update existing zone position (follows the parent object)
            const existing = engine.zk.activeZones?.find((z: any) => z.id === this.zoneId);
            if (existing) {
                existing.center = { x: pos.x, y: pos.y, z: pos.z };
                existing.radius = this.radius;
                existing.policy = this.policy;
                existing.active = this.startActive;
            }
        }
    }

    update(delta: number, b3obj: B3ObjectRef, engine: B3EngineRef): void {
        // Continuously update zone center to follow the parent object
        if (this.created && engine.zk?.activeZones) {
            const pos = b3obj.object.position;
            const existing = engine.zk.activeZones.find((z: any) => z.id === this.zoneId);
            if (existing) {
                existing.center = { x: pos.x, y: pos.y, z: pos.z };
            }
        }
    }

    dispose(): void {
        // Remove zone from active zones on cleanup
        if (this.zoneId && this._lastEngine?.zk?._activeZones) {
            const zones = this._lastEngine.zk._activeZones;
            const idx = zones.findIndex((z: any) => z.id === this.zoneId);
            if (idx !== -1) zones.splice(idx, 1);
        }
        this.created = false;
        this.zoneId = null;
        this._lastEngine = null;
    }

    /**
     * Toggle the zone on/off at runtime.
     */
    setActive(active: boolean): void {
        this.startActive = active;
    }

    toJSON() {
        return {
            ...super.toJSON(),
            type: 'ZKZoneActuator',
            zoneName: this.zoneName,
            radius: this.radius,
            policy: this.policy,
            startActive: this.startActive,
        };
    }

    static fromJSON(data: any): ZKZoneActuator {
        const n = new ZKZoneActuator(
            data.zoneName || 'Privacy Zone',
            data.radius || 30,
            data.policy || 'full_privacy'
        );
        n.id = data.id;
        n.guiMetadata = data.guiMetadata;
        n.enabled = data.enabled;
        n.startActive = data.startActive !== false;
        return n;
    }
}
