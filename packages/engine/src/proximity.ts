/**
 * @b3js/engine — ProximityManager
 *
 * Orchestrates spatial voice chat (WebRTC + THREE.PositionalAudio) and
 * proximity-scoped text delivery. Handles:
 * - Microphone capture and WebRTC peer connections
 * - Per-frame distance-based volume attenuation
 * - ZK zone boundary enforcement for voice isolation
 * - Admin voice control (mute, global mute, broadcast grants)
 * - Multiple mic modes: proximity, broadcast, zone, push-to-talk, muted
 */

import * as THREE from 'three';
import type { B3Engine, B3Object } from './index';
import type { VoiceMicMode } from '@b3js/zk';

// ─── Types ───────────────────────────────────────────────────────

export interface VoicePeer {
    /** SpacetimeDB identity hex. */
    identityHex: string;
    /** WebRTC peer connection. */
    pc: RTCPeerConnection;
    /** THREE.PositionalAudio node attached to the remote player's object. */
    positionalAudio: THREE.PositionalAudio | null;
    /** The remote player's current mic mode (synced via SpacetimeDB VoiceState). */
    remoteMicMode: VoiceMicMode;
    /** Whether the remote peer's PTT is active. */
    remotePTTActive: boolean;
    /** The B3Object this peer's voice is attached to. */
    targetObject: B3Object | null;
}

// ─── Proximity Manager ──────────────────────────────────────────

export class ProximityManager {
    /** Local microphone stream. */
    private localStream: MediaStream | null = null;

    /** Active WebRTC peer connections, keyed by identity hex. */
    private peers: Map<string, VoicePeer> = new Map();

    /** Output volume multiplier (0.0–1.0). */
    public outputVolume: number = 1.0;

    /** Whether the local player is the lobby admin (owner). */
    public isAdmin: boolean = false;

    /** ICE server configuration. */
    private iceServers: RTCIceServer[] = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ];

    constructor(private engine: B3Engine) {}

    // ─── Microphone Control ─────────────────────────────────

    /**
     * Enable the local microphone. Requests user permission and starts
     * the audio stream. Does NOT automatically connect to peers — that
     * happens when peers are discovered via SpacetimeDB.
     */
    async enableVoice(): Promise<boolean> {
        const social = (this.engine as any).social;
        if (social?.voiceAdminMuted) {
            console.warn('B3JS Proximity: Cannot enable voice — admin muted.');
            return false;
        }

        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });

            if (social) {
                social.voiceEnabled = true;
            }

            console.log('B3JS Proximity: Microphone enabled.');
            window.dispatchEvent(new CustomEvent('b3js:voice:enabled'));
            return true;
        } catch (e) {
            console.error('B3JS Proximity: Failed to access microphone.', e);
            return false;
        }
    }

    /**
     * Disable the local microphone and tear down all outgoing streams.
     */
    disableVoice(): void {
        if (this.localStream) {
            this.localStream.getTracks().forEach(t => t.stop());
            this.localStream = null;
        }

        const social = (this.engine as any).social;
        if (social) {
            social.voiceEnabled = false;
        }

        console.log('B3JS Proximity: Microphone disabled.');
        window.dispatchEvent(new CustomEvent('b3js:voice:disabled'));
    }

    /**
     * Mute the local microphone (keeps stream alive but disables tracks).
     */
    muteVoice(): void {
        if (this.localStream) {
            this.localStream.getAudioTracks().forEach(t => { t.enabled = false; });
        }
    }

    /**
     * Unmute the local microphone.
     */
    unmuteVoice(): void {
        const social = (this.engine as any).social;
        if (social?.voiceAdminMuted) {
            console.warn('B3JS Proximity: Cannot unmute — admin muted.');
            return;
        }

        if (this.localStream) {
            this.localStream.getAudioTracks().forEach(t => { t.enabled = true; });
        }
    }

    /**
     * Check if the local mic is currently producing audio.
     */
    get isMicActive(): boolean {
        if (!this.localStream) return false;
        const social = (this.engine as any).social;

        // Admin-muted overrides everything
        if (social?.voiceAdminMuted) return false;

        // Check mic mode
        const mode: VoiceMicMode = social?.voiceMicMode || 'proximity';
        if (mode === 'muted') return false;
        if (mode === 'push_to_talk' && !social?.pttActive) return false;

        return this.localStream.getAudioTracks().some(t => t.enabled);
    }

    // ─── Peer Management ────────────────────────────────────

    /**
     * Create a WebRTC peer connection for a remote player and add
     * local tracks to it.
     */
    createPeer(identityHex: string, targetObject: B3Object | null): VoicePeer {
        const existingPeer = this.peers.get(identityHex);
        if (existingPeer) return existingPeer;

        const pc = new RTCPeerConnection({ iceServers: this.iceServers });

        const peer: VoicePeer = {
            identityHex,
            pc,
            positionalAudio: null,
            remoteMicMode: 'proximity',
            remotePTTActive: false,
            targetObject,
        };

        // Add local tracks to the connection
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                pc.addTrack(track, this.localStream!);
            });
        }

        // Handle ICE candidates → relay via SpacetimeDB
        pc.onicecandidate = async (e) => {
            if (e.candidate) {
                let payload = JSON.stringify(e.candidate);
                const social = (this.engine as any).social;
                if (social && social.encryptPayload) {
                    payload = await social.encryptPayload(payload, identityHex);
                }
                window.dispatchEvent(new CustomEvent('b3js:voice:ice_candidate', {
                    detail: {
                        targetIdentity: identityHex,
                        candidate: payload,
                    },
                }));
            }
        };

        // Handle incoming remote audio stream
        pc.ontrack = (e) => {
            console.log(`B3JS Proximity: Received voice stream from ${identityHex.substring(0, 8)}...`);
            if (e.streams[0] && peer.targetObject) {
                const pAudio = this.engine.audio.addRemoteVoiceStream(
                    e.streams[0],
                    peer.targetObject.object
                );
                peer.positionalAudio = pAudio;
            }
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                console.warn(`B3JS Proximity: Peer ${identityHex.substring(0, 8)} disconnected.`);
                this.removePeer(identityHex);
            }
        };

        this.peers.set(identityHex, peer);
        return peer;
    }

    /**
     * Initiate a WebRTC call to a remote peer (create SDP offer).
     */
    async initiateCall(identityHex: string, targetObject: B3Object | null): Promise<void> {
        const peer = this.createPeer(identityHex, targetObject);
        try {
            const offer = await peer.pc.createOffer();
            await peer.pc.setLocalDescription(offer);

            let payload = JSON.stringify(offer);
            const social = (this.engine as any).social;
            if (social && social.encryptPayload) {
                payload = await social.encryptPayload(payload, identityHex);
            }

            window.dispatchEvent(new CustomEvent('b3js:voice:signal', {
                detail: {
                    targetIdentity: identityHex,
                    signalType: 'offer',
                    payload,
                },
            }));
        } catch (e) {
            console.error(`B3JS Proximity: Failed to create offer for ${identityHex.substring(0, 8)}`, e);
        }
    }

    /**
     * Handle an incoming WebRTC signal (offer, answer, or ICE candidate).
     */
    async handleSignal(
        senderIdentity: string,
        signalType: 'offer' | 'answer' | 'candidate',
        payload: string,
        senderObject: B3Object | null
    ): Promise<void> {
        // Enforce max 32 connections
        if (!this.peers.has(senderIdentity) && this.peers.size >= 32) {
            console.warn(`B3JS Proximity: Max peers (32) reached. Rejecting signal.`);
            return;
        }

        // Decrypt payload
        let decryptedPayload = payload;
        const social = (this.engine as any).social;
        if (social && social.decryptPayload) {
            const dec = await social.decryptPayload(payload, senderIdentity);
            if (dec) decryptedPayload = dec;
        }

        let peer = this.peers.get(senderIdentity);
        if (!peer) {
            peer = this.createPeer(senderIdentity, senderObject);
        }

        try {
            if (signalType === 'offer') {
                const offer = JSON.parse(decryptedPayload);
                await peer.pc.setRemoteDescription(new RTCSessionDescription(offer));

                // Add local tracks if not already added
                if (this.localStream) {
                    const senders = peer.pc.getSenders();
                    if (senders.length === 0) {
                        this.localStream.getTracks().forEach(track => {
                            peer!.pc.addTrack(track, this.localStream!);
                        });
                    }
                }

                const answer = await peer.pc.createAnswer();
                await peer.pc.setLocalDescription(answer);

                let answerPayload = JSON.stringify(answer);
                if (social && social.encryptPayload) {
                    answerPayload = await social.encryptPayload(answerPayload, senderIdentity);
                }

                window.dispatchEvent(new CustomEvent('b3js:voice:signal', {
                    detail: {
                        targetIdentity: senderIdentity,
                        signalType: 'answer',
                        payload: answerPayload,
                    },
                }));
            } else if (signalType === 'answer') {
                const answer = JSON.parse(decryptedPayload);
                await peer.pc.setRemoteDescription(new RTCSessionDescription(answer));
            } else if (signalType === 'candidate') {
                const candidate = JSON.parse(decryptedPayload);
                await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
            }
        } catch (e) {
            console.error(`B3JS Proximity: Signal handling failed for ${senderIdentity.substring(0, 8)}`, e);
        }
    }

    /**
     * Remove a peer and clean up its resources.
     */
    removePeer(identityHex: string): void {
        const peer = this.peers.get(identityHex);
        if (!peer) return;

        // Remove PositionalAudio from the scene
        if (peer.positionalAudio && peer.targetObject) {
            peer.targetObject.object.remove(peer.positionalAudio);
            peer.positionalAudio.disconnect();
        }

        peer.pc.close();
        this.peers.delete(identityHex);
    }

    /**
     * Update the remote mic mode for a peer (from SpacetimeDB VoiceState sync).
     */
    updatePeerMicMode(identityHex: string, mode: VoiceMicMode, pttActive: boolean): void {
        const peer = this.peers.get(identityHex);
        if (peer) {
            peer.remoteMicMode = mode;
            peer.remotePTTActive = pttActive;
        }
    }

    // ─── Per-Frame Tick ─────────────────────────────────────

    /**
     * Per-frame update: compute distances, update nearby players map,
     * and adjust voice stream volumes.
     *
     * @param localPosition - The local player's world position
     * @param remotePlayers - Map of identity → { position, object, zoneId }
     */
    tick(
        localPosition: THREE.Vector3,
        remotePlayers: Map<string, { position: THREE.Vector3; object: B3Object; zoneId: string | null }>,
        localZoneId: string | null
    ): void {
        const social = (this.engine as any).social;
        if (!social) return;

        // 1. Build nearby players map
        const nearbyMap = new Map<string, { distance: number; inSameZone: boolean }>();

        for (const [identity, remote] of remotePlayers) {
            const distance = localPosition.distanceTo(remote.position);
            const inSameZone = localZoneId !== null && localZoneId === remote.zoneId;

            // If no zones are active, treat all players as "same zone" (no boundary enforcement)
            const effectiveSameZone = (localZoneId === null && remote.zoneId === null) || inSameZone;

            nearbyMap.set(identity, { distance, inSameZone: effectiveSameZone });
        }

        // 2. Push to social manager
        social.updateNearbyPlayers(nearbyMap);

        // 3. Adjust voice stream volumes
        for (const [identity, peer] of this.peers) {
            if (!peer.positionalAudio) continue;

            // Determine effective gain
            let gain: number;

            // Check if sender's PTT is relevant
            if (peer.remoteMicMode === 'push_to_talk' && !peer.remotePTTActive) {
                gain = 0.0;
            } else {
                gain = social.getProximityGain(identity, peer.remoteMicMode);
            }

            // Apply output volume multiplier
            gain *= this.outputVolume;

            // Clamp
            gain = Math.max(0, Math.min(1, gain));

            // Apply to the PositionalAudio node only if changed
            const currentGain = peer.positionalAudio.getVolume();
            if (Math.abs(currentGain - gain) > Number.EPSILON) {
                peer.positionalAudio.setVolume(gain);
            }
        }

        // 4. Manage local outgoing track enabled state based on mic mode
        if (this.localStream) {
            const shouldTransmit = this.isMicActive;
            this.localStream.getAudioTracks().forEach(t => {
                t.enabled = shouldTransmit;
            });
        }
    }

    // ─── Admin Commands ─────────────────────────────────────

    /**
     * Admin: mute a specific player (server-authoritative).
     */
    adminMutePlayer(targetIdentity: string): void {
        if (!this.isAdmin) {
            console.warn('B3JS Proximity: Only the lobby admin can mute players.');
            return;
        }
        window.dispatchEvent(new CustomEvent('b3js:voice:admin_mute', {
            detail: { targetIdentity },
        }));
    }

    /**
     * Admin: unmute a specific player.
     */
    adminUnmutePlayer(targetIdentity: string): void {
        if (!this.isAdmin) return;
        window.dispatchEvent(new CustomEvent('b3js:voice:admin_unmute', {
            detail: { targetIdentity },
        }));
    }

    /**
     * Admin: mute all non-admin players in the lobby.
     */
    adminGlobalMute(): void {
        if (!this.isAdmin) return;
        window.dispatchEvent(new CustomEvent('b3js:voice:global_mute'));
        console.log('B3JS Proximity: Global mute activated.');
    }

    /**
     * Admin: unmute all players in the lobby.
     */
    adminGlobalUnmute(): void {
        if (!this.isAdmin) return;
        window.dispatchEvent(new CustomEvent('b3js:voice:global_unmute'));
        console.log('B3JS Proximity: Global mute lifted.');
    }

    /**
     * Admin: grant broadcast permission to a non-admin player.
     */
    adminGrantBroadcast(targetIdentity: string): void {
        if (!this.isAdmin) return;
        window.dispatchEvent(new CustomEvent('b3js:voice:grant_broadcast', {
            detail: { targetIdentity },
        }));
    }

    /**
     * Admin: revoke broadcast permission from a player.
     */
    adminRevokeBroadcast(targetIdentity: string): void {
        if (!this.isAdmin) return;
        window.dispatchEvent(new CustomEvent('b3js:voice:revoke_broadcast', {
            detail: { targetIdentity },
        }));
    }

    // ─── Utility ────────────────────────────────────────────

    /**
     * Get the count of active voice peers.
     */
    get activePeerCount(): number {
        return this.peers.size;
    }

    /**
     * Get all peer identities.
     */
    getPeerIdentities(): string[] {
        return Array.from(this.peers.keys());
    }

    /**
     * Dispose of all resources.
     */
    dispose(): void {
        this.disableVoice();
        for (const [id] of this.peers) {
            this.removePeer(id);
        }
        this.peers.clear();
        window.dispatchEvent(new CustomEvent('b3js:voice:leave_lobby'));
        console.log('B3JS Proximity: Disposed.');
    }
}
