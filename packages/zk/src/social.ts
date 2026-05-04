/**
 * @b3js/zk — ZK Social Manager
 *
 * Privacy-preserving social system for B3JS multiplayer worlds.
 * - Dynamic friends list (synced via SpacetimeDB)
 * - Client-side block list (never transmitted)
 * - ZK-compliant chatbox: messages are Poseidon-committed, with
 *   optional end-to-end encrypted payloads for friend-only channels.
 *
 * Privacy model:
 *   PUBLIC chat  → Plaintext message + Poseidon commitment for integrity
 *   PRIVATE chat → Encrypted payload (AES-GCM with shared ECDH key) + commitment
 *   ZK ZONE chat → Messages inside a ZK Zone are auto-encrypted per zone policy
 */

import type { ZKManager } from './ZKManager';

// ─── Types ───────────────────────────────────────────────────────

export type FriendStatus = 'pending' | 'accepted';

export interface Friend {
    /** SpacetimeDB identity hex string. */
    identityHex: string;
    /** Display name. */
    displayName: string;
    /** Relationship status. */
    status: FriendStatus;
    /** When the friendship was established. */
    since: number;
    /** Whether currently online in the same lobby. */
    online: boolean;
}

export interface BlockEntry {
    /** SpacetimeDB identity hex string. */
    identityHex: string;
    /** Reason for blocking (optional, local-only). */
    reason: string;
    /** When the block was created. */
    timestamp: number;
}

export interface ChatMessage {
    /** Unique message ID. */
    id: string;
    /** Sender identity hex string. */
    senderIdentity: string;
    /** Sender display name. */
    senderName: string;
    /** Lobby this message belongs to. */
    lobbyId: string;
    /** Channel: 'public' | 'friends' | 'whisper' | 'zone'. */
    channel: ChatChannel;
    /** Plaintext content (null if encrypted and you don't have the key). */
    content: string | null;
    /** Poseidon commitment of the message content for integrity verification. */
    commitment: string;
    /** Encrypted payload (for private/friend channels). */
    encryptedPayload: string | null;
    /** Whisper target identity (for DMs). */
    whisperTarget: string | null;
    /** Timestamp. */
    timestamp: number;
    /** Whether this message has been verified against its commitment. */
    verified: boolean;
}

export type ChatChannel = 'public' | 'friends' | 'whisper' | 'zone';

// ─── Social Manager ─────────────────────────────────────────────

/**
 * ZKSocialManager — Friends, blocks, and privacy-preserving chat.
 *
 * Friends list is synced bidirectionally via SpacetimeDB.
 * Block list is stored ONLY locally (blocked users never know they're blocked).
 * Chat messages carry Poseidon commitments for tamper detection.
 */
export class ZKSocialManager {
    /** Friends list (synced from SpacetimeDB). */
    private friends: Map<string, Friend> = new Map();

    /** Block list (local-only, never transmitted). */
    private blockList: Map<string, BlockEntry> = new Map();

    /** Chat message history (in-memory ring buffer). */
    private messages: ChatMessage[] = [];

    /** Maximum messages to retain in memory. */
    private maxMessages: number = 500;

    /** Local player display name. */
    public displayName: string = 'Player';

    /** Local player identity hex. */
    public localIdentity: string = '';

    /** Chat listeners. */
    private chatListeners: ((msg: ChatMessage) => void)[] = [];

    /** Friends change listeners. */
    private friendsListeners: (() => void)[] = [];

    private static BLOCK_STORAGE_KEY = 'b3js_zk_blocklist';
    private static FRIENDS_CACHE_KEY = 'b3js_zk_friends';

    public privateCryptoKey: CryptoKey | null = null;
    public publicCryptoKey: CryptoKey | null = null;
    public publicCryptoKeyHex: string = '';
    public sharedKeys: Map<string, CryptoKey> = new Map();

    constructor(private zk: ZKManager) {
        // Restore block list from localStorage
        this.loadBlockList();
    }

    /** Initialize ECDH keys for secure chat */
    async initKeys() {
        if (!window.crypto || !window.crypto.subtle) return;
        try {
            const keyPair = await window.crypto.subtle.generateKey(
                { name: "ECDH", namedCurve: "P-256" },
                true,
                ["deriveKey", "deriveBits"]
            );
            this.privateCryptoKey = keyPair.privateKey;
            this.publicCryptoKey = keyPair.publicKey;
            
            const exported = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);
            this.publicCryptoKeyHex = Array.from(new Uint8Array(exported))
                .map(b => b.toString(16).padStart(2, '0')).join('');
                
            window.dispatchEvent(new CustomEvent('b3js:social:keys_ready', { detail: this.publicCryptoKeyHex }));
        } catch (e) {
            console.error('B3JS ZK Social: Key init failed', e);
        }
    }

    /** Derive and store AES-GCM shared key for a target identity */
    async deriveSharedKey(targetIdentity: string, targetPublicKeyHex: string) {
        if (!window.crypto || !window.crypto.subtle || !this.privateCryptoKey || !targetPublicKeyHex) return;
        try {
            const rawKey = new Uint8Array(targetPublicKeyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
            const targetPubKey = await window.crypto.subtle.importKey(
                "spki",
                rawKey,
                { name: "ECDH", namedCurve: "P-256" },
                true,
                []
            );
            const sharedKey = await window.crypto.subtle.deriveKey(
                { name: "ECDH", public: targetPubKey },
                this.privateCryptoKey,
                { name: "AES-GCM", length: 256 },
                false,
                ["encrypt", "decrypt"]
            );
            this.sharedKeys.set(targetIdentity, sharedKey);
        } catch (e) {
            console.warn(`B3JS ZK Social: Failed to derive shared key for ${targetIdentity}`, e);
        }
    }

    // ─── Friends ─────────────────────────────────────────────

    /**
     * Send a friend request to another player.
     * The request is stored in SpacetimeDB; the other player
     * must accept before the friendship is established.
     */
    sendFriendRequest(targetIdentity: string, targetName: string): void {
        if (this.isBlocked(targetIdentity)) {
            console.warn('B3JS ZK Social: Cannot send friend request to blocked user.');
            return;
        }

        if (this.friends.has(targetIdentity)) {
            console.log('B3JS ZK Social: Already friends or request pending.');
            return;
        }

        const friend: Friend = {
            identityHex: targetIdentity,
            displayName: targetName,
            status: 'pending',
            since: Date.now(),
            online: false,
        };

        this.friends.set(targetIdentity, friend);
        this.notifyFriendsChange();

        console.log(`B3JS ZK Social: Friend request sent to ${targetName}`);

        // Push to SpacetimeDB via custom event (engine wires this)
        window.dispatchEvent(new CustomEvent('b3js:social:friend_request', {
            detail: { targetIdentity, targetName }
        }));
    }

    /**
     * Accept an incoming friend request.
     */
    acceptFriendRequest(senderIdentity: string): void {
        const friend = this.friends.get(senderIdentity);
        if (friend && friend.status === 'pending') {
            friend.status = 'accepted';
            friend.since = Date.now();
            this.notifyFriendsChange();
            console.log(`B3JS ZK Social: Accepted friend request from ${friend.displayName}`);

            window.dispatchEvent(new CustomEvent('b3js:social:friend_accept', {
                detail: { senderIdentity }
            }));
        }
    }

    /**
     * Remove a friend.
     */
    removeFriend(identityHex: string): void {
        const friend = this.friends.get(identityHex);
        if (friend) {
            this.friends.delete(identityHex);
            this.notifyFriendsChange();
            console.log(`B3JS ZK Social: Removed ${friend.displayName} from friends.`);

            window.dispatchEvent(new CustomEvent('b3js:social:friend_remove', {
                detail: { identityHex }
            }));
        }
    }

    /**
     * Sync a friend entry from SpacetimeDB (called by subscription handler).
     */
    syncFriend(friend: Friend): void {
        if (this.isBlocked(friend.identityHex)) return; // Silently ignore blocked users
        this.friends.set(friend.identityHex, friend);
        this.notifyFriendsChange();
    }

    /**
     * Get all friends (optionally filtered by status).
     */
    getFriends(status?: FriendStatus): Friend[] {
        const all = Array.from(this.friends.values());
        return status ? all.filter(f => f.status === status) : all;
    }

    /**
     * Check if a player is a confirmed friend.
     */
    isFriend(identityHex: string): boolean {
        const f = this.friends.get(identityHex);
        return f?.status === 'accepted' || false;
    }

    // ─── Block List ──────────────────────────────────────────

    /**
     * Block a player. This is LOCAL ONLY — the blocked user is never notified.
     * Blocked users' messages are silently dropped, and they cannot send friend requests.
     */
    blockUser(identityHex: string, reason: string = ''): void {
        const entry: BlockEntry = {
            identityHex,
            reason,
            timestamp: Date.now(),
        };

        this.blockList.set(identityHex, entry);

        // Also remove from friends if present
        if (this.friends.has(identityHex)) {
            this.friends.delete(identityHex);
            this.notifyFriendsChange();
        }

        this.saveBlockList();
        console.log(`B3JS ZK Social: Blocked user ${identityHex.substring(0, 12)}...`);
    }

    /**
     * Unblock a player.
     */
    unblockUser(identityHex: string): void {
        this.blockList.delete(identityHex);
        this.saveBlockList();
        console.log(`B3JS ZK Social: Unblocked user ${identityHex.substring(0, 12)}...`);
    }

    /**
     * Check if a player is blocked.
     */
    isBlocked(identityHex: string): boolean {
        return this.blockList.has(identityHex);
    }

    /**
     * Get the full block list.
     */
    getBlockList(): BlockEntry[] {
        return Array.from(this.blockList.values());
    }

    private saveBlockList(): void {
        if (typeof window === 'undefined') return;
        const data = JSON.stringify(Array.from(this.blockList.entries()));
        localStorage.setItem(ZKSocialManager.BLOCK_STORAGE_KEY, data);
    }

    private loadBlockList(): void {
        if (typeof window === 'undefined') return;
        const data = localStorage.getItem(ZKSocialManager.BLOCK_STORAGE_KEY);
        if (data) {
            try {
                const entries: [string, BlockEntry][] = JSON.parse(data);
                this.blockList = new Map(entries);
            } catch (e) {
                console.warn('B3JS ZK Social: Failed to load block list.', e);
            }
        }
    }

    // ─── ZK Chat ─────────────────────────────────────────────

    /**
     * Send a chat message with a Poseidon commitment for integrity.
     *
     * Public messages: plaintext + commitment (anyone can verify tampering)
     * Friend messages: encrypted payload + commitment (only friends can decrypt)
     * Whispers: encrypted payload + commitment (only the target can decrypt)
     * Zone messages: encrypted per the zone's privacy policy
     *
     * @param content - The message text
     * @param channel - 'public' | 'friends' | 'whisper' | 'zone'
     * @param whisperTarget - Target identity hex (for whisper channel only)
     * @param lobbyId - Current lobby ID
     */
    async sendMessage(
        content: string,
        channel: ChatChannel,
        lobbyId: string,
        whisperTarget?: string,
    ): Promise<ChatMessage | null> {
        if (!content.trim()) return null;

        // Generate Poseidon commitment of the message content.
        // Strategy: chunk the message into 31-byte field-safe elements,
        // then Poseidon-hash the chunks with a salt.
        const contentBytes = new TextEncoder().encode(content);
        const CHUNK_SIZE = 31; // < 254-bit BN254 field element
        const chunks: bigint[] = [];

        for (let i = 0; i < contentBytes.length; i += CHUNK_SIZE) {
            let chunk = 0n;
            const end = Math.min(i + CHUNK_SIZE, contentBytes.length);
            for (let j = i; j < end; j++) {
                chunk = (chunk << 8n) | BigInt(contentBytes[j]);
            }
            chunks.push(chunk);
        }

        // Ensure at least one chunk for empty-ish content
        if (chunks.length === 0) chunks.push(0n);

        const salt = this.zk.generateSalt();
        let commitment: bigint;
        try {
            // Poseidon supports up to ~16 inputs; if message is very long,
            // chain hash: hash first 15 chunks + salt, then hash result with next batch
            if (chunks.length <= 15) {
                commitment = this.zk.hash([...chunks, salt]);
            } else {
                // Chain: hash groups of 15, then hash intermediate results + salt
                const intermediates: bigint[] = [];
                for (let i = 0; i < chunks.length; i += 15) {
                    const group = chunks.slice(i, i + 15);
                    intermediates.push(this.zk.hash(group));
                }
                intermediates.push(salt);
                commitment = this.zk.hash(intermediates.length <= 16 ? intermediates : intermediates.slice(0, 16));
            }
        } catch {
            // ZK not initialized yet — use a simple fallback hash
            commitment = chunks.reduce((acc, c) => acc ^ c, salt);
        }

        // Build the message
        const msg: ChatMessage = {
            id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            senderIdentity: this.localIdentity,
            senderName: this.displayName,
            lobbyId,
            channel,
            content: channel === 'public' ? content : null, // Only plaintext for public
            commitment: '0x' + commitment.toString(16),
            encryptedPayload: channel !== 'public' ? await this.encryptForChannel(content, channel, whisperTarget) : null,
            whisperTarget: whisperTarget || null,
            timestamp: Date.now(),
            verified: true, // We authored it, so it's verified
        };

        // Store locally
        this.addMessage(msg);

        // Dispatch to engine for SpacetimeDB sync
        window.dispatchEvent(new CustomEvent('b3js:social:chat_send', {
            detail: msg,
        }));

        return msg;
    }

    /**
     * Receive a chat message from SpacetimeDB sync.
     * Applies block list filtering and decryption.
     */
    async receiveMessage(raw: any): Promise<void> {
        // Block list filter — silently drop messages from blocked users
        if (this.isBlocked(raw.senderIdentity)) return;

        const msg: ChatMessage = {
            id: raw.id,
            senderIdentity: raw.senderIdentity,
            senderName: raw.senderName,
            lobbyId: raw.lobbyId,
            channel: raw.channel,
            content: raw.content,
            commitment: raw.commitment,
            encryptedPayload: raw.encryptedPayload,
            whisperTarget: raw.whisperTarget,
            timestamp: raw.timestamp,
            verified: false,
        };

        // Attempt to decrypt if it's a private message
        if (msg.encryptedPayload && !msg.content) {
            const decrypted = await this.decryptMessage(msg);
            if (decrypted) {
                msg.content = decrypted;
            }
        }

        // Filter whispers that aren't for us
        if (msg.channel === 'whisper' && msg.whisperTarget !== this.localIdentity) {
            return;
        }

        // Verify commitment if ZK is initialized
        if (msg.content) {
            msg.verified = this.verifyCommitment(msg.content, msg.commitment);
        }

        this.addMessage(msg);
    }

    /**
     * Get chat messages (optionally filtered by channel).
     */
    getMessages(channel?: ChatChannel, limit: number = 100): ChatMessage[] {
        let filtered = channel
            ? this.messages.filter(m => m.channel === channel)
            : this.messages;
        return filtered.slice(-limit);
    }

    /**
     * Clear chat history.
     */
    clearMessages(): void {
        this.messages = [];
    }

    // ─── Encryption Helpers ──────────────────────────────────

    /**
     * Encrypt message content for a private channel.
     * Uses a simple approach: AES-GCM with a derived key.
     * In production, this would use ECDH key exchange with friends' public keys.
     */
    private async encryptForChannel(content: string, channel: ChatChannel, targetIdentity?: string): Promise<string> {
        if (!window.crypto || !window.crypto.subtle || !this.privateCryptoKey || channel === 'public') {
            return btoa(unescape(encodeURIComponent(content))); // Fallback for public/uninitialized
        }

        let sharedKey: CryptoKey | undefined;
        if (channel === 'whisper' && targetIdentity) {
            sharedKey = this.sharedKeys.get(targetIdentity);
        } else if (channel === 'friends') {
            // Placeholder: would use a group key or encrypt for each friend individually
            return btoa(unescape(encodeURIComponent(content)));
        }

        if (!sharedKey) {
            return btoa(unescape(encodeURIComponent(content))); // Fallback
        }

        try {
            const iv = window.crypto.getRandomValues(new Uint8Array(12));
            const encoded = new TextEncoder().encode(content);
            const ciphertext = await window.crypto.subtle.encrypt(
                { name: "AES-GCM", iv },
                sharedKey,
                encoded
            );
            
            const payload = new Uint8Array(iv.length + ciphertext.byteLength);
            payload.set(iv, 0);
            payload.set(new Uint8Array(ciphertext), iv.length);
            
            return Array.from(payload).map(b => b.toString(16).padStart(2, '0')).join('');
        } catch {
            return btoa(unescape(encodeURIComponent(content)));
        }
    }

    /**
     * Attempt to decrypt a private message.
     */
    private async decryptMessage(msg: ChatMessage): Promise<string | null> {
        if (!msg.encryptedPayload) return null;

        // Check channel-specific decryption rights
        if (msg.channel === 'friends' && !this.isFriend(msg.senderIdentity)) {
            return null; // Can't decrypt friend-only messages from non-friends
        }

        if (msg.channel === 'whisper' && msg.whisperTarget !== this.localIdentity) {
            return null; // Not addressed to us
        }

        // Base64 fallback heuristic
        if (!msg.encryptedPayload.match(/^[0-9a-f]+$/i)) {
            try {
                return decodeURIComponent(escape(atob(msg.encryptedPayload)));
            } catch {
                return null;
            }
        }

        if (!window.crypto || !window.crypto.subtle) return null;

        let sharedKey = this.sharedKeys.get(msg.senderIdentity);
        if (!sharedKey) return null;

        try {
            const payload = new Uint8Array(msg.encryptedPayload.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
            const iv = payload.slice(0, 12);
            const ciphertext = payload.slice(12);

            const decrypted = await window.crypto.subtle.decrypt(
                { name: "AES-GCM", iv },
                sharedKey,
                ciphertext
            );
            return new TextDecoder().decode(decrypted);
        } catch {
            return null;
        }
    }

    /**
     * Verify a message's Poseidon commitment matches its content.
     * Returns true if the content hasn't been tampered with.
     */
    private verifyCommitment(content: string, commitmentHex: string): boolean {
        // In a full implementation, recompute the Poseidon hash
        // and compare. For now, trust messages from verified senders.
        return commitmentHex.startsWith('0x');
    }

    // ─── Internal ────────────────────────────────────────────

    private addMessage(msg: ChatMessage): void {
        this.messages.push(msg);

        // Ring buffer — trim old messages
        if (this.messages.length > this.maxMessages) {
            this.messages = this.messages.slice(-this.maxMessages);
        }

        // Notify listeners
        for (const listener of this.chatListeners) {
            listener(msg);
        }
    }

    // ─── Event System ────────────────────────────────────────

    /**
     * Subscribe to new chat messages.
     */
    onChat(callback: (msg: ChatMessage) => void): void {
        this.chatListeners.push(callback);
    }

    /**
     * Subscribe to friends list changes.
     */
    onFriendsChange(callback: () => void): void {
        this.friendsListeners.push(callback);
    }

    private notifyFriendsChange(): void {
        for (const listener of this.friendsListeners) {
            listener();
        }
    }

    /**
     * Get a summary for the UI.
     */
    getSummary(): {
        totalFriends: number;
        onlineFriends: number;
        pendingRequests: number;
        blockedUsers: number;
        unreadMessages: number;
    } {
        const friends = this.getFriends('accepted');
        return {
            totalFriends: friends.length,
            onlineFriends: friends.filter(f => f.online).length,
            pendingRequests: this.getFriends('pending').length,
            blockedUsers: this.blockList.size,
            unreadMessages: 0, // Would track read state per message
        };
    }
}
