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

// ─── Circuit Builder Types (Gameplay Layer) ──────────────────────

/**
 * Gate types for the in-world circuit builder.
 * Players place these as 3D objects and wire them together;
 * the resulting graph compiles to an arithmetic circuit blueprint.
 */
export type CircuitGateType =
    | 'input'       // Public or private input signal
    | 'const'       // Constant field element
    | 'add'         // Σ inputs (mod p)
    | 'mul'         // Π inputs (mod p) — costs 1 R1CS constraint
    | 'poseidon'    // Poseidon(inputs) — ZK-friendly hash
    | 'iszero'      // 1 if input == 0 else 0
    | 'select'      // cond ? a : b  (inputs: [cond, a, b])
    | 'assert_eq'   // Constraint: inputs[0] === inputs[1]
    | 'output';     // Public output signal (passthrough)

/** A single gate instance in a circuit blueprint. */
export interface CircuitGate {
    id: string;
    type: CircuitGateType;
    label?: string;
    /** For 'const' gates: the constant value as a decimal string. */
    constValue?: string;
    /** For 'input' gates: whether the signal is private (witness-only). */
    isPrivate?: boolean;
    /** IDs of gates feeding this gate, in operand order. */
    inputs: string[];
    /** World position (set when placed as a 3D object in-game). */
    position?: { x: number; y: number; z: number };
    metadata?: Record<string, any>;
}

/** A serializable circuit design — the artifact ceremonies produce keys for. */
export interface CircuitBlueprint {
    id: string;
    name: string;
    gates: CircuitGate[];
    /** IDs of 'output' gates, in public-signal order. */
    outputs: string[];
    creatorId?: string;
    createdAt: number;
    version: number;
}

/** Result of evaluating a circuit blueprint against concrete inputs. */
export interface CircuitEvaluationResult {
    /** Values of the output gates, in blueprint.outputs order. */
    outputs: bigint[];
    /** Full witness: gate id → field value. */
    witness: Map<string, bigint>;
    /** Estimated R1CS constraint count. */
    constraintCount: number;
    /** True when all assert_eq constraints held. */
    satisfied: boolean;
    /** Descriptions of failed assertions (empty when satisfied). */
    failures: string[];
}

// ─── Ceremony Types (Multi-Party Trusted Setup) ──────────────────

/** Lifecycle of a ZK setup ceremony. */
export type CeremonyPhase =
    | 'draft'        // Being configured, not joinable
    | 'open'         // Accepting participants into the queue
    | 'running'      // Sequential contribution round in progress
    | 'finalizing'   // All contributions in; awaiting beacon/finalization
    | 'finalized'    // Final parameters produced and attested
    | 'aborted';     // Cancelled (timeout, invalid contribution, host abort)

/** Who is contributing — a human player or an agentic participant. */
export type CeremonyParticipantKind = 'human' | 'agent';

export interface CeremonyParticipant {
    /** Identity hex (SpacetimeDB identity) or agent ID. */
    id: string;
    kind: CeremonyParticipantKind;
    displayName: string;
    joinedAt: number;
}

/**
 * One link in the ceremony hash chain.
 *
 * The entropy itself is NEVER published — only its SHA-256 commitment.
 * A contributor may later reveal their entropy to produce an attestation
 * of honest participation (anyone can recompute the chain link).
 */
export interface CeremonyContribution {
    /** 0-based position in the contribution sequence. */
    index: number;
    participantId: string;
    participantKind: CeremonyParticipantKind;
    /** Accumulator hash BEFORE this contribution (the challenge). */
    prevAccumulatorHash: string;
    /** SHA-256 of the raw entropy bytes (the response commitment). */
    entropyCommitment: string;
    /** Accumulator hash AFTER mixing entropy: SHA256(prev || entropyCommitment). */
    accumulatorHash: string;
    /** Hash of the canonical transcript line for this contribution. */
    transcriptHash: string;
    /** How the entropy was gathered ('random' | 'mouse' | 'agent-seed' | 'hardware'). */
    entropySource: string;
    durationMs: number;
    timestamp: number;
    /** Optional free-text attestation (e.g. "contributed from the Crystal Sanctum"). */
    attestation?: string;
}

/** Tunable parameters for a ceremony. */
export interface ZKCeremonyConfig {
    /** Minimum entropy bytes required per contribution. */
    minEntropyBytes: number;
    /** Max participants in the queue (0 = unlimited). */
    maxContributors: number;
    /** Per-turn time limit in ms (0 = no limit). */
    turnTimeoutMs: number;
    /** Whether finalization requires an external public beacon. */
    requireBeacon: boolean;
}

export const DEFAULT_CEREMONY_CONFIG: ZKCeremonyConfig = {
    minEntropyBytes: 32,
    maxContributors: 0,
    turnTimeoutMs: 0,
    requireBeacon: false,
};

/** A full ceremony record. */
export interface ZKCeremony {
    id: string;
    lobbyId?: string;
    name: string;
    /** Circuit blueprint this ceremony produces parameters for. */
    circuitBlueprintId?: string;
    /** SHA-256 of the blueprint, binding the ceremony to an exact circuit. */
    blueprintHash?: string;
    phase: CeremonyPhase;
    creatorId: string;
    config: ZKCeremonyConfig;
    /** Contribution queue — order of this array is the turn order. */
    participants: CeremonyParticipant[];
    contributions: CeremonyContribution[];
    /** Current accumulator hash — the challenge for the next contributor. */
    accumulatorHash: string;
    createdAt: number;
    finalizedAt?: number;
    /** SHA-256 of the final parameter set (accumulator mixed with beacon). */
    finalParametersHash?: string;
    /** The public beacon value used at finalization (hex), if any. */
    beaconHash?: string;
}

/** Events emitted by CeremonyManager. */
export type CeremonyEvent =
    | { type: 'phase'; ceremonyId: string; phase: CeremonyPhase }
    | { type: 'participant_joined'; ceremonyId: string; participant: CeremonyParticipant }
    | { type: 'turn'; ceremonyId: string; participant: CeremonyParticipant | null; index: number }
    | { type: 'contribution'; ceremonyId: string; contribution: CeremonyContribution }
    | { type: 'finalized'; ceremonyId: string; finalParametersHash: string };

export type CeremonyEventListener = (event: CeremonyEvent) => void;
