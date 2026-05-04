/**
 * @b3js/zk — CommitmentStore
 *
 * Manages the player's private state and published commitments.
 * This is the local "vault" of secrets — values are never transmitted,
 * only their Poseidon hash commitments are published to SpacetimeDB.
 *
 * Think of it as the player's private notebook:
 *  - They write down their real inventory, position, bids
 *  - They publish only hashes
 *  - When challenged, they generate ZK proofs from their secrets
 */

import type {
    PrivateState,
    PublishedCommitment,
    CommitmentType,
    ZKInventorySlot,
    ZKSealedBid,
} from './types';
import type { ZKManager } from './ZKManager';

/**
 * CommitmentStore — Private State Manager
 *
 * Stores secrets locally and tracks which commitments have been published.
 * Provides convenience methods for common commitment patterns
 * (inventory, bids, positions).
 */
export class CommitmentStore {
    /** Private state, keyed by commitment key. */
    private secrets: Map<string, PrivateState> = new Map();

    /** Published commitments from other players, keyed by commitment ID. */
    private remoteCommitments: Map<string, PublishedCommitment> = new Map();

    /** Sealed bids awaiting reveal, keyed by market ID. */
    private sealedBids: Map<string, ZKSealedBid> = new Map();

    /** Change listeners for UI reactivity. */
    private listeners: (() => void)[] = [];

    constructor(private zk: ZKManager) {}

    // ─── Core Commitment Operations ──────────────────────────────

    /**
     * Commit a set of private values with an optional salt.
     * Computes the Poseidon hash and stores the private state locally.
     *
     * @param key    - Unique identifier for this commitment
     * @param values - Private field elements
     * @param type   - Category of commitment
     * @param salt   - Optional salt (generated if not provided)
     * @returns The commitment hash
     */
    commit(key: string, values: bigint[], type: CommitmentType, salt?: bigint): bigint {
        const s = salt ?? this.zk.generateSalt();
        const commitment = this.zk.hash([...values, s]);

        const state: PrivateState = {
            key,
            values,
            salt: s,
            commitment,
            type,
            timestamp: Date.now(),
        };

        this.secrets.set(key, state);
        this.notify();
        return commitment;
    }

    /**
     * Retrieve private state for proof generation.
     */
    getSecret(key: string): PrivateState | undefined {
        return this.secrets.get(key);
    }

    /**
     * Check if a commitment exists locally.
     */
    hasSecret(key: string): boolean {
        return this.secrets.has(key);
    }

    /**
     * Remove a secret (e.g., after revealing or invalidating).
     */
    removeSecret(key: string): void {
        this.secrets.delete(key);
        this.notify();
    }

    /**
     * Get all local commitments as hex strings (for sync).
     */
    getCommitmentHashes(): Map<string, string> {
        const result = new Map<string, string>();
        for (const [key, state] of this.secrets) {
            result.set(key, '0x' + state.commitment.toString(16));
        }
        return result;
    }

    /**
     * Get a log of recent local commitments for UI display.
     */
    getCommitmentLog(): { type: string; hash: string; timestamp: number }[] {
        return Array.from(this.secrets.values()).map(state => ({
            type: state.type,
            hash: '0x' + state.commitment.toString(16),
            timestamp: state.timestamp
        })).sort((a, b) => a.timestamp - b.timestamp);
    }

    // ─── Inventory Commitments ───────────────────────────────────

    /**
     * Commit a full inventory state.
     * Pads to maxInventorySlots and hashes with salt.
     *
     * @param inventory - Current inventory slots
     * @param salt      - Optional salt
     * @returns The inventory commitment hash
     */
    commitInventory(inventory: ZKInventorySlot[], salt?: bigint): bigint {
        const s = salt ?? this.zk.generateSalt();
        const commitment = this.zk.hashInventory(inventory, s);

        // Store the raw inventory as values for later proof generation
        const values: bigint[] = [];
        const maxSlots = this.zk.config.maxInventorySlots;
        for (let i = 0; i < maxSlots; i++) {
            if (i < inventory.length) {
                values.push(BigInt(inventory[i].itemId));
                values.push(BigInt(inventory[i].quantity));
            } else {
                values.push(0n);
                values.push(0n);
            }
        }

        const state: PrivateState = {
            key: 'inventory',
            values,
            salt: s,
            commitment,
            type: 'inventory',
            timestamp: Date.now(),
        };

        this.secrets.set('inventory', state);
        this.notify();
        return commitment;
    }

    /**
     * Get the current inventory commitment hash as hex string.
     */
    getInventoryCommitment(): string | null {
        const state = this.secrets.get('inventory');
        if (!state) return null;
        return '0x' + state.commitment.toString(16);
    }

    /**
     * Build circuit inputs for an inventory proof.
     * Proves ownership of at least `minQuantity` of `itemId`
     * without revealing the full inventory.
     *
     * @param itemId      - The item type to prove ownership of
     * @param minQuantity - Minimum quantity to prove
     */
    buildInventoryProofInputs(itemId: number, minQuantity: number): Record<string, any> | null {
        const state = this.secrets.get('inventory');
        if (!state) return null;

        return {
            // Private inputs
            inventory: state.values.map(v => v.toString()),
            inventorySalt: state.salt.toString(),
            // Public inputs
            inventoryHash: state.commitment.toString(),
            itemId: itemId.toString(),
            minQuantity: minQuantity.toString(),
        };
    }

    // ─── Sealed Bid Commitments ──────────────────────────────────

    /**
     * Commit a sealed bid for an auction/market.
     *
     * @param marketId - Market/auction identifier
     * @param amount   - Bid amount
     * @param salt     - Optional salt
     * @returns The bid commitment hash
     */
    commitBid(marketId: string, amount: bigint, salt?: bigint): bigint {
        const s = salt ?? this.zk.generateSalt();
        const commitment = this.zk.hashBid(amount, s);

        const bid: ZKSealedBid = {
            amount,
            salt: s,
            commitment,
            marketId,
        };

        this.sealedBids.set(marketId, bid);

        const state: PrivateState = {
            key: `bid_${marketId}`,
            values: [amount],
            salt: s,
            commitment,
            type: 'bid',
            timestamp: Date.now(),
        };

        this.secrets.set(`bid_${marketId}`, state);
        this.notify();
        return commitment;
    }

    /**
     * Build circuit inputs for a sealed bid proof.
     * Proves the bid is within [minBid, maxBid] without revealing the exact amount.
     *
     * @param marketId - Market/auction identifier
     * @param minBid   - Minimum valid bid
     * @param maxBid   - Maximum valid bid
     */
    buildBidProofInputs(marketId: string, minBid: bigint, maxBid: bigint): Record<string, any> | null {
        const state = this.secrets.get(`bid_${marketId}`);
        if (!state) return null;

        return {
            // Private inputs
            bidAmount: state.values[0].toString(),
            bidSalt: state.salt.toString(),
            // Public inputs
            bidHash: state.commitment.toString(),
            minBid: minBid.toString(),
            maxBid: maxBid.toString(),
        };
    }

    /**
     * Reveal a sealed bid (returns the secret amount and salt for on-chain verification).
     */
    revealBid(marketId: string): ZKSealedBid | null {
        const bid = this.sealedBids.get(marketId);
        if (bid) {
            this.sealedBids.delete(marketId);
            this.secrets.delete(`bid_${marketId}`);
            this.notify();
        }
        return bid || null;
    }

    // ─── Position Commitments ────────────────────────────────────

    /**
     * Commit a player's position (for fog-of-war).
     *
     * @param x, y, z - World coordinates
     * @param salt    - Optional salt
     * @returns The position commitment hash
     */
    commitPosition(x: number, y: number, z: number, salt?: bigint): bigint {
        const s = salt ?? this.zk.generateSalt();
        const commitment = this.zk.hashPosition(x, y, z, s);

        const gridSize = this.zk.config.gridResolution;
        const gx = BigInt(Math.floor(x / gridSize));
        const gy = BigInt(Math.floor(y / gridSize));
        const gz = BigInt(Math.floor(z / gridSize));

        const state: PrivateState = {
            key: 'position',
            values: [gx, gy, gz],
            salt: s,
            commitment,
            type: 'position',
            timestamp: Date.now(),
        };

        this.secrets.set('position', state);
        this.notify();
        return commitment;
    }

    // ─── Remote Commitment Tracking ──────────────────────────────

    /**
     * Store a commitment received from another player (via SpacetimeDB sync).
     */
    setRemoteCommitment(commitment: PublishedCommitment): void {
        this.remoteCommitments.set(commitment.id, commitment);
        this.notify();
    }

    /**
     * Remove a remote commitment.
     */
    removeRemoteCommitment(id: string): void {
        this.remoteCommitments.delete(id);
        this.notify();
    }

    /**
     * Get all remote commitments.
     */
    getRemoteCommitments(): PublishedCommitment[] {
        return Array.from(this.remoteCommitments.values());
    }

    /**
     * Get remote commitments for a specific player.
     */
    getPlayerCommitments(playerId: string): PublishedCommitment[] {
        return Array.from(this.remoteCommitments.values())
            .filter(c => c.playerId === playerId);
    }

    // ─── Persistence ─────────────────────────────────────────────

    /**
     * Export all secrets to a JSON-safe format for local storage.
     * WARNING: Contains private keys — handle with care.
     */
    exportSecrets(): string {
        const data: Record<string, any> = {};
        for (const [key, state] of this.secrets) {
            data[key] = {
                key: state.key,
                values: state.values.map(v => v.toString()),
                salt: state.salt.toString(),
                commitment: state.commitment.toString(),
                type: state.type,
                timestamp: state.timestamp,
            };
        }
        return JSON.stringify(data);
    }

    /**
     * Import secrets from a previously exported JSON string.
     */
    importSecrets(json: string): void {
        const data = JSON.parse(json);
        for (const [key, raw] of Object.entries(data)) {
            const r = raw as any;
            this.secrets.set(key, {
                key: r.key,
                values: r.values.map((v: string) => BigInt(v)),
                salt: BigInt(r.salt),
                commitment: BigInt(r.commitment),
                type: r.type,
                timestamp: r.timestamp,
            });
        }
        this.notify();
    }

    // ─── Reactivity ──────────────────────────────────────────────

    /**
     * Subscribe to state changes.
     */
    onChange(callback: () => void): void {
        this.listeners.push(callback);
    }

    private notify(): void {
        for (const listener of this.listeners) {
            listener();
        }
    }

    /**
     * Get a summary of the current commitment state (for UI display).
     */
    getSummary(): {
        totalSecrets: number;
        types: Record<CommitmentType, number>;
        remoteCommitments: number;
        pendingBids: number;
    } {
        const types: Record<CommitmentType, number> = { position: 0, inventory: 0, bid: 0, custom: 0 };
        for (const state of this.secrets.values()) {
            types[state.type]++;
        }

        return {
            totalSecrets: this.secrets.size,
            types,
            remoteCommitments: this.remoteCommitments.size,
            pendingBids: this.sealedBids.size,
        };
    }
}
