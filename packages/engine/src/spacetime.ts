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

    /** Local player's SpacetimeDB identity as hex (null when offline). */
    public get identityHex(): string | null {
        try {
            return this.conn?.identity?.toHexString?.() ?? null;
        } catch {
            return null;
        }
    }

    /** Whether the multiplayer connection is live. */
    public get isConnected(): boolean {
        return this.isOnline;
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

        // ─── ZK Ceremony tables ─────────────────────────────────
        // Forward all ceremony rows to the CeremonyCoordinator, which
        // verifies hash chains before accepting remote state.
        if (this.conn.db.ZKCeremony) {
            this.conn.db.ZKCeremony.onInsert((row: any) => this.engine.ceremony.handleCeremonyRow(row));
            this.conn.db.ZKCeremony.onUpdate((_old: any, row: any) => this.engine.ceremony.handleCeremonyRow(row));
        }
        if (this.conn.db.ZKCeremonyContribution) {
            this.conn.db.ZKCeremonyContribution.onInsert((row: any) => this.engine.ceremony.handleContributionRow(row));
        }
        if (this.conn.db.ZKCircuitBlueprint) {
            this.conn.db.ZKCircuitBlueprint.onInsert((row: any) => this.engine.ceremony.handleBlueprintRow(row));
            this.conn.db.ZKCircuitBlueprint.onUpdate((_old: any, row: any) => this.engine.ceremony.handleBlueprintRow(row));
        }

        // ─── QuaiAxe Furnace Wall tables ────────────────────────
        // Remote pixels/burns flow into the QuaiAxeGame; local actions
        // are pushed via pushQaxePixel / pushQaxeBurn.
        if (this.conn.db.QuaiAxeWallPixel) {
            const applyPixel = (row: any) => {
                if (this.currentLobbyId && row.lobby_id !== this.currentLobbyId) return;
                // Skip our own pixels — already applied locally
                const local = this.conn.identity;
                if (local && row.painter_identity.isEqual(local)) return;
                this.engine.quaiAxe?.applyRemotePaint({
                    x: Number(row.x), y: Number(row.y), color: row.color,
                    painter: row.painter_name || row.painter_identity.toHexString().substring(0, 10),
                    paintedAt: Number(row.painted_at),
                });
            };
            this.conn.db.QuaiAxeWallPixel.onInsert(applyPixel);
            this.conn.db.QuaiAxeWallPixel.onUpdate((_old: any, row: any) => applyPixel(row));
        }
        if (this.conn.db.QuaiAxeBurn) {
            this.conn.db.QuaiAxeBurn.onInsert((row: any) => {
                if (this.currentLobbyId && row.lobby_id !== this.currentLobbyId) return;
                const local = this.conn.identity;
                if (local && row.miner_identity.isEqual(local)) return;
                this.engine.quaiAxe?.handleRemoteBurn({
                    minerName: row.miner_name,
                    burnShareBps: Number(row.burn_share_bps),
                    burnBuyWei: BigInt(row.burn_buy_wei),
                    grossWei: BigInt(row.gross_wei),
                });
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

    // ─── ZK Ceremony Methods ────────────────────────────────────
    // These reducers are the shared coordination surface for human and
    // agentic participants — agents call the same reducers over their
    // own SpacetimeDB connections.

    /** Publish an in-game-built circuit blueprint. */
    public pushCircuitBlueprint(data: {
        id: string; name: string; blueprint_json: string;
        blueprint_hash: string; constraint_count: number;
    }): void {
        if (!this.isOnline || !this.currentLobbyId) return;
        console.log(`B3JS Spacetime: Publishing circuit blueprint "${data.name}"`);
        this.conn?.reducers?.publish_circuit_blueprint?.({
            lobby_id: this.currentLobbyId,
            ...data,
        });
    }

    /** Create a ceremony (opened immediately, bound to a blueprint). */
    public pushCeremonyCreate(data: {
        id: string; name: string; circuit_blueprint_id: string;
        blueprint_hash: string; genesis_hash: string; config_json: string;
    }): void {
        if (!this.isOnline || !this.currentLobbyId) return;
        console.log(`B3JS Spacetime: Creating ceremony "${data.name}"`);
        this.conn?.reducers?.create_ceremony?.({
            lobby_id: this.currentLobbyId,
            ...data,
        });
    }

    /** Join a ceremony's contribution queue (kind: 'human' | 'agent'). */
    public pushCeremonyJoinQueue(ceremonyId: string, displayName: string, kind: string): void {
        if (!this.isOnline) return;
        this.conn?.reducers?.join_ceremony_queue?.({
            ceremony_id: ceremonyId,
            display_name: displayName,
            kind,
        });
    }

    /** Leave a ceremony queue (while open). */
    public pushCeremonyLeaveQueue(ceremonyId: string): void {
        if (!this.isOnline) return;
        this.conn?.reducers?.leave_ceremony_queue?.({ ceremony_id: ceremonyId });
    }

    /** Start a ceremony (creator only). */
    public pushCeremonyStart(ceremonyId: string): void {
        if (!this.isOnline) return;
        this.conn?.reducers?.start_ceremony?.({ ceremony_id: ceremonyId });
    }

    // ─── QuaiAxe Furnace Wall Methods ───────────────────────────

    /** Publish a locally painted wall pixel to the lobby. */
    public pushQaxePixel(pixel: { x: number; y: number; color: string; painter: string }): void {
        if (!this.isOnline || !this.currentLobbyId) return;
        this.conn?.reducers?.paint_qaxe_pixel?.({
            lobby_id: this.currentLobbyId,
            x: pixel.x,
            y: pixel.y,
            color: pixel.color,
            painter_name: pixel.painter,
        });
    }

    /** Publish a burn batch to the lobby's shared furnace log. */
    public pushQaxeBurn(data: {
        batch_id: string; miner_name: string; burn_share_bps: number;
        gross_wei: string; burn_buy_wei: string; payout_wei: string;
        fee_wei: string; gas_wei: string;
    }): void {
        if (!this.isOnline || !this.currentLobbyId) return;
        this.conn?.reducers?.record_qaxe_burn?.({
            lobby_id: this.currentLobbyId,
            ...data,
        });
    }

    /** Submit a computed contribution on your turn. */
    public pushCeremonyContribution(ceremonyId: string, data: {
        entropy_commitment: string; accumulator_hash: string; transcript_hash: string;
        entropy_source: string; duration_ms: number; attestation: string;
    }): void {
        if (!this.isOnline) return;
        console.log(`B3JS Spacetime: Submitting ceremony contribution (${data.entropy_source})`);
        this.conn?.reducers?.submit_ceremony_contribution?.({
            ceremony_id: ceremonyId,
            ...data,
            duration_ms: BigInt(data.duration_ms),
        });
    }

    /** Finalize a ceremony (creator only). */
    public pushCeremonyFinalize(ceremonyId: string, finalParametersHash: string, beaconHash: string): void {
        if (!this.isOnline) return;
        this.conn?.reducers?.finalize_ceremony?.({
            ceremony_id: ceremonyId,
            final_parameters_hash: finalParametersHash,
            beacon_hash: beaconHash,
        });
    }

    /** Abort a ceremony (creator only). */
    public pushCeremonyAbort(ceremonyId: string): void {
        if (!this.isOnline) return;
        this.conn?.reducers?.abort_ceremony?.({ ceremony_id: ceremonyId });
    }
}
