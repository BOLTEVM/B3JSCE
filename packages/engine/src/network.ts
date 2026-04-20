import * as THREE from 'three';
import { B3Engine, B3Object } from './index';
import { nanoid } from 'nanoid';

/**
 * NetworkManager: Handles WebSocket signaling and WebRTC spatial voice streams.
 */
export class NetworkManager {
    private socket: WebSocket | null = null;
    private peers: Map<string, RTCPeerConnection> = new Map();
    private localStream: MediaStream | null = null;
    private userId: string = nanoid();
    private room: string = 'default';
    private ownershipMap: Map<string, string> = new Map(); // networkId -> userId
    
    private syncInterval: any = null;

    constructor(private engine: B3Engine) {}

    public async connect(url: string, room: string) {
        this.room = room;
        this.socket = new WebSocket(url);

        this.socket.onopen = () => {
            console.log("B3JS Network: Connected to Relay Server");
            this.send('JOIN_ROOM', { room, userId: this.userId });
            this.startSyncLoop();
        };

        this.socket.onmessage = async (msg) => {
            let parsed: any;
            try {
                parsed = JSON.parse(msg.data);
            } catch {
                console.warn("B3JS Network: Received malformed JSON, ignoring.");
                return;
            }

            const { type, payload } = parsed;

            // Validate message shape: type must be a known string, payload must be an object
            const ALLOWED_TYPES = ['USER_JOINED', 'USER_LEFT', 'STATE_SYNC', 'SIGNAL', 'VOICE_READY'];
            if (typeof type !== 'string' || !ALLOWED_TYPES.includes(type)) {
                console.warn(`B3JS Network: Unknown message type "${type}", ignoring.`);
                return;
            }
            if (payload !== undefined && (typeof payload !== 'object' || payload === null)) {
                console.warn(`B3JS Network: Invalid payload for "${type}", ignoring.`);
                return;
            }

            this.handleMessage(type, payload);
        };

        this.socket.onclose = () => {
            console.warn("B3JS Network: Disconnected");
            this.stopSyncLoop();
        };
    }

    private send(type: string, payload: any) {
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ type, payload }));
        }
    }

    private handleMessage(type: string, payload: any) {
        switch (type) {
            case 'USER_JOINED':
                console.log(`B3JS Network: User ${payload.userId} joined.`);
                if (this.localStream) this.initiateCall(payload.userId);
                break;
            case 'USER_LEFT':
                this.removeRemoteUser(payload.userId);
                // Clean up all objects owned by the departing user
                for (const [nid, owner] of this.ownershipMap) {
                    if (owner === payload.userId) {
                        const obj = this.engine.objects.find(o => o.networkId === nid);
                        if (obj) this.engine.removeObject(obj.id);
                        this.ownershipMap.delete(nid);
                    }
                }
                break;
            case 'STATE_SYNC':
                this.updateRemoteObjects(payload);
                break;
            case 'SIGNAL':
                this.handleSignal(payload.senderId, payload.signal);
                break;
        }
    }

    /**
     * Spatial Voice Chat (WebRTC)
     */
    public async enableVoice() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log("B3JS Network: Microphone enabled");
            // Notify other peers that we have a stream now
            this.send('VOICE_READY', { userId: this.userId });
        } catch (e) {
            console.error("B3JS Network: Failed to get microphone", e);
        }
    }

    private async initiateCall(targetId: string) {
        const pc = this.createPeerConnection(targetId);
        this.localStream?.getTracks().forEach(track => pc.addTrack(track, this.localStream!));
        
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this.send('SIGNAL', { targetId, senderId: this.userId, signal: { type: 'offer', sdp: offer.sdp } });
    }

    private createPeerConnection(targetId: string): RTCPeerConnection {
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        pc.onicecandidate = (e) => {
            if (e.candidate) {
                this.send('SIGNAL', { targetId, senderId: this.userId, signal: { type: 'candidate', candidate: e.candidate } });
            }
        };

        pc.ontrack = (e) => {
            console.log(`B3JS Network: Received voice stream from ${targetId}`);
            const remoteObj = this.findOrCreateRemoteUserObject(targetId);
            this.engine.audio.addRemoteVoiceStream(e.streams[0], remoteObj.object);
        };

        this.peers.set(targetId, pc);
        return pc;
    }

    private async handleSignal(senderId: string, signal: any) {
        let pc = this.peers.get(senderId);
        if (!pc) pc = this.createPeerConnection(senderId);

        if (signal.type === 'offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal));
            this.localStream?.getTracks().forEach(track => pc!.addTrack(track, this.localStream!));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            this.send('SIGNAL', { targetId: senderId, senderId: this.userId, signal: { type: 'answer', sdp: answer.sdp } });
        } else if (signal.type === 'answer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal));
        } else if (signal.type === 'candidate') {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
    }

    /**
     * State Synchronization
     */
    private startSyncLoop() {
        this.syncInterval = setInterval(() => {
            const syncedObjects = this.engine.objects.filter(o => !o.isRemote && o.syncTransform);
            if (syncedObjects.length > 0) {
                const state = syncedObjects.map(o => {
                    // Track local ownership
                    this.ownershipMap.set(o.networkId, this.userId);
                    return {
                        networkId: o.networkId,
                        name: o.name,
                        pos: o.object.position.toArray(),
                        rot: o.object.quaternion.toArray()
                    };
                });
                this.send('STATE_SYNC', { userId: this.userId, objects: state });
            }
        }, 50); // 20Hz broadcast
    }

    private stopSyncLoop() {
        if (this.syncInterval) clearInterval(this.syncInterval);
    }

    private updateRemoteObjects(payload: any) {
        if (payload.userId === this.userId || !Array.isArray(payload.objects)) return;

        const MAX_OBJECTS_PER_PAYLOAD = 50;
        const objectsToProcess = payload.objects.slice(0, MAX_OBJECTS_PER_PAYLOAD);

        const MAX_REMOTE_OBJECTS = 200;
        let currentRemoteCount = this.engine.objects.filter(o => o.isRemote).length;

        objectsToProcess.forEach((oData: any) => {
            // Ownership check: only allow the owner to update the object
            const existingOwner = this.ownershipMap.get(oData.networkId);
            if (existingOwner && existingOwner !== payload.userId) {
                return; // Reject — sender doesn't own this object
            }

            let obj = this.engine.objects.find(o => o.networkId === oData.networkId);
            
            if (!obj) {
                if (currentRemoteCount >= MAX_REMOTE_OBJECTS) {
                    console.warn(`B3JS Network: Max remote objects (${MAX_REMOTE_OBJECTS}) reached. Ignoring ${oData.name}`);
                    return;
                }
                console.log(`B3JS Network: New Remote Object -> ${oData.name}`);
                obj = this.engine.createCube(oData.name);
                obj.networkId = oData.networkId;
                obj.isRemote = true;
                if (obj.body) obj.body.type = 2;
                this.ownershipMap.set(oData.networkId, payload.userId);
                currentRemoteCount++;
            }

            obj.targetPosition.fromArray(oData.pos);
            obj.targetQuaternion.fromArray(oData.rot);
        });
    }

    private findOrCreateRemoteUserObject(userId: string): B3Object {
        let obj = this.engine.objects.find(o => o.networkId === `user_${userId}`);
        if (!obj) {
            obj = this.engine.createSphere(`User_${userId.substr(0,4)}`);
            obj.networkId = `user_${userId}`;
            obj.isRemote = true;
            (obj.object as THREE.Mesh).material = new THREE.MeshBasicMaterial({ color: 0x00d4ff, wireframe: true });
        }
        return obj;
    }

    private removeRemoteUser(userId: string) {
        const pc = this.peers.get(userId);
        pc?.close();
        this.peers.delete(userId);
        
        const obj = this.engine.objects.find(o => o.networkId === `user_${userId}`);
        if (obj) this.engine.removeObject(obj.id);
    }
}
