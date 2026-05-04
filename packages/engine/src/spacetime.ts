import * as THREE from 'three';
import { B3Engine, B3Object } from './index';
import { nanoid } from 'nanoid';

export class SpacetimeManager {
    private conn: any = null;
    private isOnline: boolean = false;
    private lastSyncTime: number = 0;
    private syncInterval: number = 50;
    private currentLobbyId: string | null = null;

    public get activeLobbyId(): string | null {
        return this.currentLobbyId;
    }

    private readonly CACHE_KEY = 'B3JS_OFFLINE_CACHE';

    constructor(private engine: B3Engine) {
        window.addEventListener('b3js:voice:signal', (e: any) => {
            if (this.isOnline && this.conn?.reducers?.send_voice_signal) {
                this.conn.reducers.send_voice_signal(
                    e.detail.targetIdentity,
                    e.detail.signalType,
                    e.detail.payload
                );
            }
        });

        window.addEventListener('b3js:voice:ice_candidate', (e: any) => {
            if (this.isOnline && this.conn?.reducers?.send_voice_signal) {
                this.conn.reducers.send_voice_signal(
                    e.detail.targetIdentity,
                    'candidate',
                    e.detail.candidate
                );
            }
        });

        window.addEventListener('b3js:voice:leave_lobby', () => {
            if (this.isOnline && this.conn?.reducers?.leave_lobby) {
                this.conn.reducers.leave_lobby();
            }
        });
    }

    public async connect(url: string, dbName: string) {
        console.log(`B3JS Spacetime: Connecting to ${url}/${dbName}...`);

        try {
            const { DbConnectionImpl, DbConnectionBuilder } = await import('spacetimedb');

            const builder = new (DbConnectionBuilder as any)({}, DbConnectionImpl);
            this.conn = builder
                .withUri(url)
                .withDatabaseName(dbName)
                .onConnect((conn: any, identity: any, token: string) => {
                    this.isOnline = true;
                    console.log("B3JS Spacetime: Connected. Identity:", identity.toHexString());

                    conn.subscriptionBuilder()
                        .subscribeToAllTables()
                        .onApplied(() => this.handleInitialState());
                })
                .onDisconnect(() => {
                    this.isOnline = false;
                    console.warn("B3JS Spacetime: Disconnected. Falling back to Local Storage.");
                })
                .onConnectError((err: any) => {
                    console.error("B3JS Spacetime: Connection Error", err);
                    this.isOnline = false;
                })
                .build();
        } catch (e) {
            console.error("B3JS Spacetime: Failed to initialize SDK", e);
            this.isOnline = false;
        }
    }

    /**
     * Creates a new world session.
     */
    public createLobby(name: string, isPublic: boolean) {
        if (!this.isOnline) return;
        const id = nanoid();
        console.log(`B3JS Spacetime: Creating lobby ${name} (${id})...`);
        this.currentLobbyId = id;
        this.conn.reducers.create_lobby(id, name, isPublic);
    }

    /**
     * Joins an existing world session.
     */
    public joinLobby(lobbyId: string) {
        if (!this.isOnline) return;
        console.log(`B3JS Spacetime: Joining lobby ${lobbyId}...`);
        this.currentLobbyId = lobbyId;
        this.conn.reducers.join_lobby(lobbyId);

        // Clear existing remote objects before switching
        this.engine.objects.filter(o => o.isRemote).forEach(o => {
            this.engine.removeObject(o.id);
        });
    }

    private handleInitialState() {
        console.log("B3JS Spacetime: Initial state received. Synchronizing world...");
        this.conn.db.WorldEntity.onInsert((row: any) => this.syncRemoteObject(row));
        this.conn.db.WorldEntity.onUpdate((oldRow: any, newRow: any) => this.syncRemoteObject(newRow));
        this.conn.db.WorldEntity.onDelete((row: any) => this.removeRemoteObject(row.id));

        if (this.conn.db.VoiceSignal) {
            this.conn.db.VoiceSignal.onInsert((row: any) => {
                const localIdentity = this.conn.identity;
                if (localIdentity && row.target_identity.isEqual(localIdentity)) {
                    this.engine.proximity.handleSignal(
                        row.sender_identity.toHexString(),
                        row.signal_type,
                        row.payload,
                        null
                    );
                }
            });
        }
    }

    private syncRemoteObject(row: any) {
        // Client-side isolation: Only sync objects in our current lobby
        if (this.currentLobbyId && row.lobby_id !== this.currentLobbyId) return;

        let obj = this.engine.objects.find(o => o.id === row.id);
        
        if (!obj) {
            console.log(`B3JS Spacetime: External object spawned -> ${row.name} (${row.type})`);
            
            if (row.type === 'SpawnPoint') {
                obj = this.engine.createSpawnPoint(row.name);
            } else if (row.type === 'Actor') {
                obj = this.engine.createNPC(row.name);
            } else {
                obj = this.engine.createCube(row.name);
            }
            
            obj.id = row.id;
            obj.isRemote = true; 
        }

        obj.targetPosition.set(row.px, row.py, row.pz);
        obj.targetQuaternion.set(row.qx, row.qy, row.qz, row.qw);
        
        try {
            const meta = JSON.parse(row.metadata);
            Object.assign(obj.metadata, meta);
        } catch (e) { /* ignore malformed meta */ }
    }

    private removeRemoteObject(id: string) {
        console.log(`B3JS Spacetime: External object deleted -> ${id}`);
        this.engine.removeObject(id);
    }

    public pushUpdate(obj: B3Object) {
        if (!this.isOnline || !this.currentLobbyId) return;

        const now = Date.now();
        if (now - this.lastSyncTime < this.syncInterval) return; 
        this.lastSyncTime = now;

        if (this.conn.reducers?.update_transform) {
            this.conn.reducers.update_transform(
                obj.id,
                obj.object.position.x, obj.object.position.y, obj.object.position.z,
                obj.object.quaternion.x, obj.object.quaternion.y, obj.object.quaternion.z, obj.object.quaternion.w
            );
        }
    }

    public pushSpawn(obj: B3Object) {
        if (!this.isOnline || !this.currentLobbyId) return;

        const row = {
            id: obj.id,
            lobby_id: this.currentLobbyId,
            name: obj.name,
            type: obj.type,
            parent_id: '',
            px: obj.object.position.x, py: obj.object.position.y, pz: obj.object.position.z,
            qx: obj.object.quaternion.x, qy: obj.object.quaternion.y, qz: obj.object.quaternion.z, qw: obj.object.quaternion.w,
            sx: obj.object.scale.x, sy: obj.object.scale.y, sz: obj.object.scale.z,
            metadata: JSON.stringify(obj.metadata || {})
        };

        this.conn.reducers?.upsert_entity(row);
    }

    public pushDelete(id: string) {
        if (!this.isOnline) return;
        this.conn.reducers?.despawn_entity(id);
    }

    /**
     * Broadcasts governance state (Admin permissions, Player Voice toggle) to the lobby.
     */
    public pushGovernance(allowPlayerAI: boolean) {
        if (!this.isOnline || !this.currentLobbyId) return;
        console.log(`B3JS Spacetime: Syncing Governance -> PlayerVoiceAI: ${allowPlayerAI}`);
        // We use a specific 'GlobalSettings' or similar reducer if defined, 
        // or a dedicated metadata entity for lobby-wide settings.
        this.conn.reducers?.update_lobby_settings?.(this.currentLobbyId, JSON.stringify({
            allowPlayerVoiceAI: allowPlayerAI
        }));
    }

    private cacheToLocalStorage() {
        const state = this.engine.serialize();
        localStorage.setItem(this.CACHE_KEY, state);
    }

    // ─── Zero Knowledge World Methods ─────────────────────────

    /**
     * Push a ZK commitment hash to SpacetimeDB.
     * Other players will see the hash but cannot derive the private state.
     */
    public pushZKCommitment(type: string, commitmentHash: string): void {
        if (!this.isOnline || !this.currentLobbyId) return;
        console.log(`B3JS Spacetime: Publishing ZK commitment (${type}) → ${commitmentHash.substring(0, 18)}...`);

        this.conn?.reducers?.submit_zk_commitment?.({
            lobby_id: this.currentLobbyId,
            commitment_type: type,
            commitment_hash: commitmentHash,
            proof: '',
            public_signals: '[]',
            timestamp: BigInt(Date.now()),
        });
    }

    /**
     * Push a ZK proof to SpacetimeDB for server-side verification.
     * The reducer will validate the proof before storing the commitment.
     */
    public pushZKProof(circuitName: string, serializedProof: string): void {
        if (!this.isOnline || !this.currentLobbyId) return;
        console.log(`B3JS Spacetime: Submitting ZK proof (${circuitName})`);

        this.conn?.reducers?.submit_zk_proof?.({
            lobby_id: this.currentLobbyId,
            circuit_name: circuitName,
            proof_data: serializedProof,
        });
    }

    /**
     * Define or update a ZK privacy zone on the server.
     */
    public pushZKZone(zone: any): void {
        if (!this.isOnline || !this.currentLobbyId) return;
        console.log(`B3JS Spacetime: Publishing ZK zone "${zone.name}" (policy=${zone.policy})`);

        this.conn?.reducers?.define_zk_zone?.({
            id: zone.id,
            lobby_id: this.currentLobbyId,
            name: zone.name,
            cx: zone.center.x,
            cy: zone.center.y,
            cz: zone.center.z,
            radius: zone.radius,
            policy: zone.policy,
            active: zone.active,
        });
    }

    /**
     * Temporarily reveal private state (broadcast plaintext for a duration).
     */
    public pushZKReveal(revealType: string, data: any): void {
        if (!this.isOnline || !this.currentLobbyId) return;
        console.log(`B3JS Spacetime: Broadcasting ZK reveal (${revealType}) for ${data.duration}ms`);

        this.conn?.reducers?.reveal_state?.({
            lobby_id: this.currentLobbyId,
            reveal_type: revealType,
            payload: JSON.stringify(data),
            duration_ms: data.duration || 5000,
        });
    }
}
