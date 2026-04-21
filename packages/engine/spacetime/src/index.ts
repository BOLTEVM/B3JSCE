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
    lobby_id: t.string().index()
};

const spacetimedb = schema({
    WorldEntity: table({ public: true }, WorldEntity),
    Lobby: table({ public: true }, Lobby),
    Player: table({ public: true }, Player)
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
                lobby_id: id
            });
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
                lobby_id: lobby_id
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
