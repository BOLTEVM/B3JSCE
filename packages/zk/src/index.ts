/**
 * @b3js/zk — Barrel Export
 *
 * Public API surface for the Zero Knowledge package.
 */

// Core Manager
export { ZKManager } from './ZKManager';

// Commitment Store
export { CommitmentStore } from './commitment';

// Social Manager
export { ZKSocialManager } from './social';

// Circuit Builder (gameplay layer)
export {
    CircuitBuilder,
    BN254_FIELD_PRIME,
    GATE_CONSTRAINT_ESTIMATES,
    canonicalBlueprintJSON,
    fieldMod,
    hashBlueprint,
    sha256Hex,
} from './circuitbuilder';

// Ceremony Manager (multi-party trusted setup)
export {
    CeremonyManager,
    MouseEntropyCollector,
    agentEntropy,
    makeParticipant,
    randomEntropy,
} from './ceremony';
export type { ContributeOptions, EntropySource } from './ceremony';

// Agentic Participants
export { ZKCeremonyAgent } from './agent';
export type { AgentAction } from './agent';

// Types
export type {
    CircuitArtifacts,
    VerificationKey,
    ZKProof,
    Groth16Proof,
    SerializedZKProof,
    CommitmentType,
    PrivateState,
    PublishedCommitment,
    ZKWorldConfig,
    ZKZonePolicy,
    ZKZoneDefinition,
    ZKInventorySlot,
    ZKSealedBid,
    ZKWorkerRequest,
    ZKWorkerResponse,
    VoiceMicMode,
    ProximityConfig,
    VoicePolicy,
    CircuitGateType,
    CircuitGate,
    CircuitBlueprint,
    CircuitEvaluationResult,
    CeremonyPhase,
    CeremonyParticipantKind,
    CeremonyParticipant,
    CeremonyContribution,
    ZKCeremonyConfig,
    ZKCeremony,
    CeremonyEvent,
    CeremonyEventListener,
} from './types';

// Ceremony Constants
export { DEFAULT_CEREMONY_CONFIG } from './types';

// Social Types
export type {
    Friend,
    FriendStatus,
    BlockEntry,
    ChatMessage,
    ChatChannel,
} from './social';

// Constants
export { DEFAULT_ZK_CONFIG, DEFAULT_PROXIMITY_CONFIG, DEFAULT_VOICE_POLICY } from './types';
