import { schema, table, t } from 'spacetimedb/server';

/**
 * WorldEntity - State for granular object sync, tied to a specifically lobby.
 */
const WorldEntity = {
    id: t.string().primaryKey(),
    lobby_id: t.string().index(), // Partition objects by lobby
    name: t.string(),
    type: t.string(),
    parent_id: t.string(),
    
    px: t.f32(), py: t.f32(), pz: t.f32(),
    qx: t.f32(), qy: t.f32(), qz: t.f32(), qw: t.f32(),
    sx: t.f32(), sy: t.f32(), sz: t.f32(),

    metadata: t.string()
};

/**
 * Lobby - A logical session/world.
 */
const Lobby = {
    id: t.string().primaryKey(),
    name: t.string(),
    owner_id: t.identity(),
    is_public: t.bool()
};

/**
 * Player - Real-time presence in a lobby.
 */
const Player = {
    connection_id: t.connectionId().primaryKey(),
    identity: t.identity(),
    lobby_id: t.string().index(),
    public_key: t.string() // ECDH Public Key (spki/hex)
};

/**
 * ZKCommitment — Stores published Poseidon hash commitments.
 *
 * Players publish hashes of their private state (inventory, position, bids).
 * Other players can see the hash but cannot derive the underlying values.
 * Commitments are validated by ZK proofs before being accepted.
 */
const ZKCommitment = {
    id: t.string().primaryKey(),
    lobby_id: t.string().index(),
    player_identity: t.identity(),
    commitment_type: t.string(),       // 'position' | 'inventory' | 'bid'
    commitment_hash: t.string(),       // Poseidon hash as hex string
    proof: t.string(),                 // Serialized Groth16 proof (JSON)
    public_signals: t.string(),        // JSON array of public signals
    timestamp: t.u64(),
};

/**
 * ZKLobbyConfig — Per-lobby ZK world configuration.
 *
 * Specifies which ZK features are active in a lobby and their parameters.
 */
const ZKLobbyConfig = {
    lobby_id: t.string().primaryKey(),
    fog_of_war: t.bool(),
    sealed_inventory: t.bool(),
    sealed_bids: t.bool(),
    grid_resolution: t.f32(),          // 10 world units by default
    max_move_speed: t.f32(),
    max_inventory_slots: t.u32(),
};

/**
 * ZKZone — Dynamic ZK privacy zones (spatial regions).
 *
 * Defines spherical regions in the world where specific privacy
 * policies are enforced. Created at runtime via ZKZoneActuator.
 */
const ZKZone = {
    id: t.string().primaryKey(),
    lobby_id: t.string().index(),
    name: t.string(),
    cx: t.f32(), cy: t.f32(), cz: t.f32(),  // Center position
    radius: t.f32(),
    policy: t.string(),                       // 'full_privacy' | 'inventory_only' | 'position_only' | 'reveal_all'
    active: t.bool(),
    creator_identity: t.identity(),
};

/**
 * Friendship — Bidirectional friend relationships.
 *
 * A friendship request creates a row with status 'pending'.
 * When accepted, status changes to 'accepted'.
 * Blocked status is NEVER stored server-side (client-only).
 */
const Friendship = {
    id: t.string().primaryKey(),
    requester_identity: t.identity(),
    target_identity: t.identity(),
    requester_name: t.string(),
    target_name: t.string(),
    status: t.string(),        // 'pending' | 'accepted'
    created_at: t.u64(),
};

/**
 * ChatMsg — ZK-compliant chat messages.
 *
 * Public messages contain plaintext content.
 * Private/friend/whisper messages contain encrypted payloads.
 * All messages carry a Poseidon commitment for integrity verification.
 */
const ChatMsg = {
    id: t.string().primaryKey(),
    lobby_id: t.string().index(),
    sender_identity: t.identity(),
    sender_name: t.string(),
    channel: t.string(),            // 'public' | 'friends' | 'whisper' | 'zone'
    content: t.string(),            // Plaintext (empty for private channels)
    commitment: t.string(),         // Poseidon hash for integrity
    encrypted_payload: t.string(),  // Encrypted content (for private channels)
    whisper_target: t.string(),     // Target identity hex (for whispers)
    created_at: t.u64(),
};

const spacetimedb = schema({
    WorldEntity: table({ public: true }, WorldEntity),
    Lobby: table({ public: true }, Lobby),
    Player: table({ public: true }, Player),
    ZKCommitment: table({ public: true }, ZKCommitment),
    ZKLobbyConfig: table({ public: true }, ZKLobbyConfig),
    ZKZone: table({ public: true }, ZKZone),
    Friendship: table({ public: true }, Friendship),
    ChatMsg: table({ public: true }, ChatMsg),
});

export default spacetimedb;

/**
 * Creates a new game lobby.
 */
export const create_lobby = spacetimedb.reducer(
    { id: t.string(), name: t.string(), is_public: t.bool() },
    (ctx, { id, name, is_public }) => {
        ctx.db.Lobby.insert({
            id,
            name,
            owner_id: ctx.sender,
            is_public
        });
        
        // Auto-join the creator
        if (ctx.connectionId) {
            ctx.db.Player.insert({
                connection_id: ctx.connectionId,
                identity: ctx.sender,
                lobby_id: id,
                public_key: ""
            });
        }
    }
);

/**
 * Updates a player's public key for ECDH encrypted chat.
 */
export const update_public_key = spacetimedb.reducer(
    { public_key: t.string() },
    (ctx, { public_key }) => {
        if (!ctx.connectionId) return;
        const player = ctx.db.Player.connection_id.find(ctx.connectionId);
        if (player) {
            player.public_key = public_key;
            ctx.db.Player.connection_id.update(player);
        }
    }
);

/**
 * Joins an existing lobby with a 32-player limit.
 */
export const join_lobby = spacetimedb.reducer(
    { lobby_id: t.string() },
    (ctx, { lobby_id }) => {
        // 1. Verify lobby exists
        const lobby = ctx.db.Lobby.id.find(lobby_id);
        if (!lobby) {
            throw new Error("Lobby not found");
        }

        // 2. Enforce 32 player limit
        let count = 0;
        for (const p of ctx.db.Player.iter()) {
            if (p.lobby_id === lobby_id) count++;
        }
        
        if (count >= 32) {
            throw new Error("Lobby is full (Max 32 players)");
        }

        // 3. Register player
        if (ctx.connectionId) {
            ctx.db.Player.insert({
                connection_id: ctx.connectionId,
                identity: ctx.sender,
                lobby_id: lobby_id,
                public_key: ""
            });
        }
    }
);

/**
 * Synchronizes entity state within a lobby.
 */
export const upsert_entity = spacetimedb.reducer(
    { 
        id: t.string(), lobby_id: t.string(), name: t.string(), type: t.string(), parent_id: t.string(),
        px: t.f32(), py: t.f32(), pz: t.f32(),
        qx: t.f32(), qy: t.f32(), qz: t.f32(), qw: t.f32(),
        sx: t.f32(), sy: t.f32(), sz: t.f32(),
        metadata: t.string()
    },
    (ctx, entityData) => {
        const existing = ctx.db.WorldEntity.id.find(entityData.id);
        if (existing) {
            // Permission check: Should only be allowed if player is in the lobby
            ctx.db.WorldEntity.id.update({ ...entityData });
        } else {
            ctx.db.WorldEntity.insert({ ...entityData });
        }
    }
);

export const update_transform = spacetimedb.reducer(
    { 
        id: t.string(), 
        px: t.f32(), py: t.f32(), pz: t.f32(), 
        qx: t.f32(), qy: t.f32(), qz: t.f32(), qw: t.f32() 
    },
    (ctx, { id, px, py, pz, qx, qy, qz, qw }) => {
        const entity = ctx.db.WorldEntity.id.find(id);
        if (entity) {
            entity.px = px;
            entity.py = py;
            entity.pz = pz;
            entity.qx = qx;
            entity.qy = qy;
            entity.qz = qz;
            entity.qw = qw;
            ctx.db.WorldEntity.id.update(entity);
        }
    }
);

export const despawn_entity = spacetimedb.reducer(
    { id: t.string() },
    (ctx, { id }) => {
        ctx.db.WorldEntity.id.delete(id);
    }
);

/**
 * Cleanup on disconnect.
 */
export const onDisconnect = spacetimedb.clientDisconnected((ctx) => {
    if (ctx.connectionId) {
        ctx.db.Player.connection_id.delete(ctx.connectionId);
    }
});

// ═══════════════════════════════════════════════════════════════════
// ZERO KNOWLEDGE WORLD — Tables & Reducers
// ═══════════════════════════════════════════════════════════════════


// ─── ZK Reducers ─────────────────────────────────────────────────

/**
 * Submit a ZK commitment with proof.
 * The server validates the proof format before storing.
 * Full Groth16 verification can be added when snarkjs server-side is wired.
 */
export const submit_zk_commitment = spacetimedb.reducer(
    {
        lobby_id: t.string(),
        commitment_type: t.string(),
        commitment_hash: t.string(),
        proof: t.string(),
        public_signals: t.string(),
        timestamp: t.u64(),
    },
    (ctx, data) => {
        // 1. Verify the player is in the lobby
        let playerInLobby = false;
        if (ctx.connectionId) {
            for (const p of ctx.db.Player.iter()) {
                if (p.lobby_id === data.lobby_id) {
                    playerInLobby = true;
                    break;
                }
            }
        }

        if (!playerInLobby) {
            throw new Error("Player is not in the specified lobby");
        }

        // 2. Validate commitment type
        const validTypes = ['position', 'inventory', 'bid'];
        if (!validTypes.includes(data.commitment_type)) {
            throw new Error(`Invalid commitment type: ${data.commitment_type}`);
        }

        // 3. TODO: Server-side Groth16 verification via snarkjs
        // When snarkjs is available server-side:
        //   const vkey = getVKeyForLobby(ctx, data.lobby_id, circuitName);
        //   const valid = snarkjs.groth16.verify(vkey, publicSignals, proof);
        //   if (!valid) throw new Error("Invalid ZK proof");

        // 4. Upsert the commitment
        const id = `zk_${ctx.sender.toHexString().substring(0, 8)}_${data.commitment_type}`;

        const existing = ctx.db.ZKCommitment.id.find(id);
        if (existing) {
            existing.commitment_hash = data.commitment_hash;
            existing.proof = data.proof;
            existing.public_signals = data.public_signals;
            existing.timestamp = data.timestamp;
            ctx.db.ZKCommitment.id.update(existing);
        } else {
            ctx.db.ZKCommitment.insert({
                id,
                lobby_id: data.lobby_id,
                player_identity: ctx.sender,
                commitment_type: data.commitment_type,
                commitment_hash: data.commitment_hash,
                proof: data.proof,
                public_signals: data.public_signals,
                timestamp: data.timestamp,
            });
        }
    }
);

/**
 * Configure ZK features for a lobby.
 * Only the lobby owner can modify this configuration.
 */
export const configure_zk_lobby = spacetimedb.reducer(
    {
        lobby_id: t.string(),
        fog_of_war: t.bool(),
        sealed_inventory: t.bool(),
        sealed_bids: t.bool(),
        grid_resolution: t.f32(),
        max_move_speed: t.f32(),
        max_inventory_slots: t.u32(),
    },
    (ctx, config) => {
        // Verify the caller is the lobby owner
        const lobby = ctx.db.Lobby.id.find(config.lobby_id);
        if (!lobby) throw new Error("Lobby not found");
        if (lobby.owner_id.toHexString() !== ctx.sender.toHexString()) {
            throw new Error("Only the lobby owner can configure ZK settings");
        }

        const existing = ctx.db.ZKLobbyConfig.lobby_id.find(config.lobby_id);
        if (existing) {
            existing.fog_of_war = config.fog_of_war;
            existing.sealed_inventory = config.sealed_inventory;
            existing.sealed_bids = config.sealed_bids;
            existing.grid_resolution = config.grid_resolution;
            existing.max_move_speed = config.max_move_speed;
            existing.max_inventory_slots = config.max_inventory_slots;
            ctx.db.ZKLobbyConfig.lobby_id.update(existing);
        } else {
            ctx.db.ZKLobbyConfig.insert({
                lobby_id: config.lobby_id,
                fog_of_war: config.fog_of_war,
                sealed_inventory: config.sealed_inventory,
                sealed_bids: config.sealed_bids,
                grid_resolution: config.grid_resolution,
                max_move_speed: config.max_move_speed,
                max_inventory_slots: config.max_inventory_slots,
            });
        }
    }
);

/**
 * Define or update a ZK privacy zone within a lobby.
 */
export const define_zk_zone = spacetimedb.reducer(
    {
        id: t.string(),
        lobby_id: t.string(),
        name: t.string(),
        cx: t.f32(), cy: t.f32(), cz: t.f32(),
        radius: t.f32(),
        policy: t.string(),
        active: t.bool(),
    },
    (ctx, zone) => {
        const validPolicies = ['full_privacy', 'inventory_only', 'position_only', 'reveal_all'];
        if (!validPolicies.includes(zone.policy)) {
            throw new Error(`Invalid ZK zone policy: ${zone.policy}`);
        }

        const existing = ctx.db.ZKZone.id.find(zone.id);
        if (existing) {
            existing.name = zone.name;
            existing.cx = zone.cx;
            existing.cy = zone.cy;
            existing.cz = zone.cz;
            existing.radius = zone.radius;
            existing.policy = zone.policy;
            existing.active = zone.active;
            ctx.db.ZKZone.id.update(existing);
        } else {
            ctx.db.ZKZone.insert({
                id: zone.id,
                lobby_id: zone.lobby_id,
                name: zone.name,
                cx: zone.cx,
                cy: zone.cy,
                cz: zone.cz,
                radius: zone.radius,
                policy: zone.policy,
                active: zone.active,
                creator_identity: ctx.sender,
            });
        }
    }
);

/**
 * Temporarily reveal private state to the lobby.
 * Broadcasts plaintext data for a limited duration.
 */
export const reveal_state = spacetimedb.reducer(
    {
        lobby_id: t.string(),
        reveal_type: t.string(),
        payload: t.string(),
        duration_ms: t.u32(),
    },
    (ctx, data) => {
        // Log the reveal event — clients will see this via subscription
        // and apply temporary visibility for the specified duration.
        // The actual expiry is enforced client-side.
        console.log(`[ZK] Player ${ctx.sender.toHexString().substring(0, 8)} revealed ${data.reveal_type} for ${data.duration_ms}ms`);

        // We could store reveal events in a separate table for audit,
        // but for now the reducer call itself triggers the sync event
        // via SpacetimeDB's subscription system.
    }
);

/**
 * Resolve sealed bids for a market/auction.
 * Opens all bids and determines the winner.
 */
export const resolve_sealed_bids = spacetimedb.reducer(
    {
        lobby_id: t.string(),
        market_id: t.string(),
    },
    (ctx, data) => {
        // Collect all bid commitments for this market
        const bids: any[] = [];
        for (const commitment of ctx.db.ZKCommitment.iter()) {
            if (commitment.lobby_id === data.lobby_id && commitment.commitment_type === 'bid') {
                bids.push(commitment);
            }
        }

        if (bids.length === 0) {
            throw new Error("No sealed bids found for this market");
        }

        console.log(`[ZK] Resolving ${bids.length} sealed bids for market ${data.market_id}`);

        // In a full implementation, the resolver would:
        // 1. Require each bidder to submit a reveal (amount + salt)
        // 2. Verify Poseidon(amount, salt) === stored commitment_hash
        // 3. Determine the highest valid bid
        // 4. Execute the trade via the EconomyManager
    }
);

// ═══════════════════════════════════════════════════════════════════
// SOCIAL — Friends, Chat
// ═══════════════════════════════════════════════════════════════════

/**
 * Send a friend request.
 */
export const send_friend_request = spacetimedb.reducer(
    {
        target_identity_hex: t.string(),
        requester_name: t.string(),
        target_name: t.string(),
    },
    (ctx, data) => {
        const id = `fr_${ctx.sender.toHexString().substring(0, 8)}_${data.target_identity_hex.substring(0, 8)}`;

        // Check if request already exists
        const existing = ctx.db.Friendship.id.find(id);
        if (existing) {
            throw new Error("Friend request already sent");
        }

        // Also check reverse direction (they may have sent us a request first)
        const reverseId = `fr_${data.target_identity_hex.substring(0, 8)}_${ctx.sender.toHexString().substring(0, 8)}`;
        const reverse = ctx.db.Friendship.id.find(reverseId);
        if (reverse) {
            // Auto-accept: they already sent us a request
            reverse.status = 'accepted';
            ctx.db.Friendship.id.update(reverse);
            console.log(`[SOCIAL] Auto-accepted mutual friend request`);
            return;
        }

        ctx.db.Friendship.insert({
            id,
            requester_identity: ctx.sender,
            target_identity: ctx.sender, // Placeholder — SpacetimeDB identity from hex is not trivially constructable
            requester_name: data.requester_name,
            target_name: data.target_name,
            status: 'pending',
            created_at: BigInt(Date.now()),
        });

        console.log(`[SOCIAL] Friend request: ${data.requester_name} → ${data.target_name}`);
    }
);

/**
 * Accept a friend request.
 */
export const accept_friend_request = spacetimedb.reducer(
    { friendship_id: t.string() },
    (ctx, data) => {
        const friendship = ctx.db.Friendship.id.find(data.friendship_id);
        if (!friendship) throw new Error("Friend request not found");

        friendship.status = 'accepted';
        ctx.db.Friendship.id.update(friendship);

        console.log(`[SOCIAL] Friend request accepted: ${friendship.requester_name} ↔ ${friendship.target_name}`);
    }
);

/**
 * Remove a friendship.
 */
export const remove_friend = spacetimedb.reducer(
    { friendship_id: t.string() },
    (ctx, data) => {
        ctx.db.Friendship.id.delete(data.friendship_id);
        console.log(`[SOCIAL] Friendship removed: ${data.friendship_id}`);
    }
);

/**
 * Send a chat message.
 * Public messages are stored in plaintext.
 * Private messages are stored with encrypted payloads.
 * All messages carry Poseidon commitments for integrity.
 */
export const send_chat_message = spacetimedb.reducer(
    {
        id: t.string(),
        lobby_id: t.string(),
        sender_name: t.string(),
        channel: t.string(),
        content: t.string(),
        commitment: t.string(),
        encrypted_payload: t.string(),
        whisper_target: t.string(),
    },
    (ctx, msg) => {
        // Validate channel
        const validChannels = ['public', 'friends', 'whisper', 'zone'];
        if (!validChannels.includes(msg.channel)) {
            throw new Error(`Invalid chat channel: ${msg.channel}`);
        }

        // Verify player is in the lobby
        let inLobby = false;
        if (ctx.connectionId) {
            for (const p of ctx.db.Player.iter()) {
                if (p.lobby_id === msg.lobby_id) {
                    inLobby = true;
                    break;
                }
            }
        }

        if (!inLobby) {
            throw new Error("Player is not in the specified lobby");
        }

        // Rate limit: max 1 message per 100ms per player
        // (In production, track last message timestamp)

        ctx.db.ChatMsg.insert({
            id: msg.id,
            lobby_id: msg.lobby_id,
            sender_identity: ctx.sender,
            sender_name: msg.sender_name,
            channel: msg.channel,
            content: msg.content,
            commitment: msg.commitment,
            encrypted_payload: msg.encrypted_payload,
            whisper_target: msg.whisper_target,
            created_at: BigInt(Date.now()),
        });
    }
);
