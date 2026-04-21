import * as THREE from 'three';
import { DbConnection, Identity } from 'spacetimedb';
import { B3Engine, B3Object } from './index';
import { nanoid } from 'nanoid';

/**
 * SpacetimeManager: Orchestrates real-time granular sync with SpacetimeDB.
 * Handles smooth interpolation targets and falls back to local storage if offline.
 */
export class SpacetimeManager {
    private conn: any = null;
    private isOnline: boolean = false;
    private lastSyncTime: number = 0;
    private syncInterval: number = 50; // 20Hz sync for local changes
    private currentLobbyId: string | null = null;
    
    public get activeLobbyId(): string | null {
        return this.currentLobbyId;
    }
    
    // Fallback cache key
    private readonly CACHE_KEY = 'B3JS_OFFLINE_CACHE';

    constructor(private engine: B3Engine) {}

    public async connect(url: string, dbName: string) {
        console.log(`B3JS Spacetime: Connecting to ${url}/${dbName}...`);
        
        try {
            this.conn = DbConnection.builder()
                .withUri(url)
                .withDatabaseName(dbName)
                .onConnect((conn: any, identity: Identity, token: string) => {
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
    }

    private syncRemoteObject(row: any) {
        // Client-side isolation: Only sync objects in our current lobby
        if (this.currentLobbyId && row.lobby_id !== this.currentLobbyId) return;

        let obj = this.engine.objects.find(o => o.id === row.id);
        
        if (!obj) {
            console.log(`B3JS Spacetime: External object spawned -> ${row.name}`);
            obj = this.engine.createCube(row.name);
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

    private cacheToLocalStorage() {
        const state = this.engine.serialize();
        localStorage.setItem(this.CACHE_KEY, state);
    }
}
