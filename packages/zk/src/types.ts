/**
 * @b3js/zk — Shared Types
 *
 * Core type definitions for the Zero Knowledge proof pipeline.
 * All ZK modules import from here to avoid circular dependencies.
 */

// ─── Circuit Artifacts ────────────────────────────────────────────

/** Pre-compiled circuit artifacts loaded at runtime. */
export interface CircuitArtifacts {
    /** Witness generator WASM binary (from Circom compilation). */
    wasm: ArrayBuffer;
    /** Groth16 proving key (.zkey file). */
    zkey: ArrayBuffer;
    /** Groth16 verification key (JSON). */
    vkey: VerificationKey;
}

/** snarkjs-compatible verification key structure. */
export interface VerificationKey {
    protocol: string;
    curve: string;
    nPublic: number;
    vk_alpha_1: string[];
    vk_beta_2: string[][];
    vk_gamma_2: string[][];
    vk_delta_2: string[][];
    vk_alphabeta_12: string[][][];
    IC: string[][];
    [key: string]: any;
}

// ─── Proof Types ──────────────────────────────────────────────────

/** A completed Groth16 proof with its public signals. */
export interface ZKProof {
    /** The Groth16 proof object (pi_a, pi_b, pi_c). */
    proof: Groth16Proof;
    /** Public signal values (output from the circuit). */
    publicSignals: string[];
}

/** Raw Groth16 proof components. */
export interface Groth16Proof {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
    protocol: string;
    curve: string;
}

/** Serialized proof payload for network transmission. */
export interface SerializedZKProof {
    proof: string;          // JSON-stringified Groth16Proof
    publicSignals: string;  // JSON-stringified string[]
    circuit: string;        // Circuit name this proof was generated for
    timestamp: number;
}

// ─── Commitment Types ─────────────────────────────────────────────

/** The type of private state being committed. */
export type CommitmentType = 'position' | 'inventory' | 'bid' | 'custom';

/** Private state stored locally by the player. */
export interface PrivateState {
    /** Unique key for this commitment. */
    key: string;
    /** Private values (field elements as bigint). */
    values: bigint[];
    /** Random salt for hiding (prevents rainbow table attacks). */
    salt: bigint;
    /** The Poseidon hash commitment of (values, salt). */
    commitment: bigint;
    /** Commitment category. */
    type: CommitmentType;
    /** When this commitment was created. */
    timestamp: number;
}

/** A published commitment (what other players see). */
export interface PublishedCommitment {
    id: string;
    lobbyId: string;
    playerId: string;
    type: CommitmentType;
    /** Poseidon hash as hex string. */
    commitmentHash: string;
    /** Serialized proof that the commitment is valid. */
    proof: string;
    /** Public signals from the proof. */
    publicSignals: string;
    timestamp: number;
}

// ─── Voice & Proximity Types ─────────────────────────────────────

/** Microphone broadcast mode. */
export type VoiceMicMode = 'proximity' | 'broadcast' | 'zone' | 'push_to_talk' | 'muted';

/** Distance-based falloff configuration for proximity voice & text. */
export interface ProximityConfig {
    /** Distance at which volume is 100% (world units). */
    innerRadius: number;
    /** Distance at which volume reaches 0% (world units). */
    outerRadius: number;
    /** Falloff curve type. */
    falloffCurve: 'linear' | 'exponential';
}

/** Default proximity configuration. */
export const DEFAULT_PROXIMITY_CONFIG: ProximityConfig = {
    innerRadius: 15,
    outerRadius: 50,
    falloffCurve: 'linear',
};

/** Admin-controlled voice rules for a lobby. */
export interface VoicePolicy {
    /** Whether proximity voice mode is available. */
    proximityEnabled: boolean;
    /** Whether zone-scoped voice is available. */
    zoneVoiceEnabled: boolean;
    /** If true, only push-to-talk mode is permitted (no open mic). */
    pttRequired: boolean;
    /** Whether the admin can use broadcast mode. */
    broadcastAllowed: boolean;
}

/** Default voice policy. */
export const DEFAULT_VOICE_POLICY: VoicePolicy = {
    proximityEnabled: true,
    zoneVoiceEnabled: true,
    pttRequired: false,
    broadcastAllowed: true,
};

// ─── ZK World Configuration ──────────────────────────────────────

/** Configuration for a ZK-enabled lobby/world. */
export interface ZKWorldConfig {
    /** Enable fog-of-war (position hiding). */
    fogOfWar: boolean;
    /** Enable sealed inventory (hidden item state). */
    sealedInventory: boolean;
    /** Enable sealed-bid trading. */
    sealedBids: boolean;
    /** Spatial hash grid cell size (in world units). */
    gridResolution: number;
    /** Maximum movement distance per sync tick. */
    moveSpeed: number;
    /** Maximum items in the inventory circuit. */
    maxInventorySlots: number;
    /** Voice and proximity communication policy. */
    voicePolicy: VoicePolicy;
    /** Proximity falloff settings. */
    proximityConfig: ProximityConfig;
}

/** Default ZK world configuration. */
export const DEFAULT_ZK_CONFIG: ZKWorldConfig = {
    fogOfWar: false,
    sealedInventory: true,
    sealedBids: true,
    gridResolution: 10,
    moveSpeed: 50,
    maxInventorySlots: 32,
    voicePolicy: DEFAULT_VOICE_POLICY,
    proximityConfig: DEFAULT_PROXIMITY_CONFIG,
};

// ─── ZK Zone Types ───────────────────────────────────────────────

/** Privacy policy enforced within a spatial zone. */
export type ZKZonePolicy = 'full_privacy' | 'inventory_only' | 'position_only' | 'reveal_all';

/** A spatial region with ZK privacy rules. */
export interface ZKZoneDefinition {
    /** Unique zone identifier. */
    id: string;
    /** Human-readable name. */
    name: string;
    /** Center of the zone (world coordinates). */
    center: { x: number; y: number; z: number };
    /** Zone radius (world units). */
    radius: number;
    /** Privacy policy applied inside this zone. */
    policy: ZKZonePolicy;
    /** Whether the zone is currently active. */
    active: boolean;
    /** Optional: lobby this zone belongs to. */
    lobbyId?: string;
}

// ─── Inventory Types ─────────────────────────────────────────────

/** A single inventory slot for the ZK inventory circuit. */
export interface ZKInventorySlot {
    /** Item type ID (hashed to a field element). */
    itemId: number;
    /** Quantity of this item. */
    quantity: number;
}

/** Sealed bid for the sealed-bid auction circuit. */
export interface ZKSealedBid {
    /** The bid amount (in smallest token unit). */
    amount: bigint;
    /** Random salt for hiding the bid. */
    salt: bigint;
    /** Poseidon hash commitment. */
    commitment: bigint;
    /** Market/auction this bid belongs to. */
    marketId: string;
}

// ─── Worker Messages ─────────────────────────────────────────────

/** Message sent to the ZK Web Worker to request proof generation. */
export interface ZKWorkerRequest {
    id: string;
    type: 'prove' | 'verify';
    circuitName: string;
    /** For 'prove': circuit inputs. */
    inputs?: Record<string, any>;
    /** For 'prove': WASM witness generator. */
    wasm?: ArrayBuffer;
    /** For 'prove': proving key. */
    zkey?: ArrayBuffer;
    /** For 'verify': verification key. */
    vkey?: VerificationKey;
    /** For 'verify': the proof to verify. */
    proof?: ZKProof;
}

/** Message returned from the ZK Web Worker. */
export interface ZKWorkerResponse {
    id: string;
    type: 'prove_result' | 'verify_result' | 'error';
    /** For 'prove_result': the generated proof. */
    proof?: ZKProof;
    /** For 'verify_result': whether the proof is valid. */
    valid?: boolean;
    /** For 'error': error message. */
    error?: string;
    /** Time taken in milliseconds. */
    durationMs: number;
}
