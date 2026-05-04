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
} from './types';

// Social Types
export type {
    Friend,
    FriendStatus,
    BlockEntry,
    ChatMessage,
    ChatChannel,
} from './social';

// Constants
export { DEFAULT_ZK_CONFIG } from './types';
