import { ethers } from 'ethers';

const VAULT_KEY = 'b3_vault_v1';

export interface WalletMetadata {
    id: string;
    name: string;
    address: string;
    index: number;
    createdAt: string;
}

export interface VaultData {
    encryptedMnemonic: string;
    salt: string;
    iv: string;
    isEncrypted: boolean;
    wallets: WalletMetadata[];
}

/**
 * VaultManager: Handles encrypted storage of mnemonics and HD derivation.
 * Ported from Handtracking Wallet (ows-core.ts)
 */
export class VaultManager {
    private sessionMnemonic: string | null = null;
    private activeChainId: string = 'ethereum';

    constructor() {}

    public isLocked(): boolean {
        return !this.sessionMnemonic;
    }

    public async isSetup(): Promise<boolean> {
        const vault = await this.getVault();
        return vault.isEncrypted;
    }

    public async setup(password: string): Promise<string> {
        const wallet = ethers.Wallet.createRandom();
        const mnemonic = wallet.mnemonic?.phrase || '';
        const encrypted = await this.encrypt(mnemonic, password);

        const vault = await this.getVault();
        vault.encryptedMnemonic = encrypted.encrypted;
        vault.salt = encrypted.salt;
        vault.iv = encrypted.iv;
        vault.isEncrypted = true;

        await this.saveVault(vault);
        this.sessionMnemonic = mnemonic;
        return mnemonic;
    }

    public async unlock(password: string): Promise<boolean> {
        const vault = await this.getVault();
        if (!vault.isEncrypted) return false;
        try {
            this.sessionMnemonic = await this.decrypt(vault.encryptedMnemonic, vault.salt, vault.iv, password);
            return true;
        } catch (e) {
            return false;
        }
    }

    public async createWallet(name: string): Promise<WalletMetadata> {
        if (!this.sessionMnemonic) throw new Error("Vault is locked");
        const vault = await this.getVault();
        const index = vault.wallets.length;
        const address = this.deriveAddress(this.sessionMnemonic, index);

        const newWallet: WalletMetadata = {
            id: `wallet_${Math.random().toString(16).substring(2, 10)}`,
            name: name || `Wallet ${index + 1}`,
            address,
            index,
            createdAt: new Date().toISOString()
        };

        vault.wallets.push(newWallet);
        await this.saveVault(vault);
        return newWallet;
    }

    public async listWallets(): Promise<WalletMetadata[]> {
        const vault = await this.getVault();
        return vault.wallets.map(w => ({
            ...w,
            address: this.sessionMnemonic ? this.deriveAddress(this.sessionMnemonic, w.index) : w.address
        }));
    }

    // ─── Derivation ───────────────────────────────────────────────

    private deriveAddress(mnemonic: string, index: number): string {
        const path = `m/44'/60'/0'/0/${index}`;
        try {
            const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, path);
            return wallet.address;
        } catch (e) {
            console.error("[VAULT] Derivation Error:", e);
            return "0x0000...0000";
        }
    }

    // ─── Encryption Helpers ───────────────────────────────────────

    private async deriveKey(password: string, salt: Uint8Array) {
        const encoder = new TextEncoder();
        const passwordKey = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            'PBKDF2',
            false,
            ['deriveKey']
        );
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: salt as any, iterations: 100000, hash: 'SHA-256' },
            passwordKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    private async encrypt(data: string, password: string) {
        const encoder = new TextEncoder();
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await this.deriveKey(password, salt);
        const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(data));

        // Use browser-native base64 encoding
        const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
            const bytes = new Uint8Array(buffer);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
            return btoa(binary);
        };

        return {
            encrypted: arrayBufferToBase64(encrypted),
            salt: arrayBufferToBase64(salt.buffer),
            iv: arrayBufferToBase64(iv.buffer)
        };
    }

    private async decrypt(encrypted: string, salt: string, iv: string, password: string) {
        const decoder = new TextDecoder();
        
        const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
            const binaryString = atob(base64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
            return bytes.buffer;
        };

        const saltArr = new Uint8Array(base64ToArrayBuffer(salt));
        const ivArr = new Uint8Array(base64ToArrayBuffer(iv));
        const encryptedArr = new Uint8Array(base64ToArrayBuffer(encrypted));
        
        const key = await this.deriveKey(password, saltArr);
        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivArr }, key, encryptedArr);
        return decoder.decode(decrypted);
    }

    // ─── Storage ──────────────────────────────────────────────────

    private async getVault(): Promise<VaultData> {
        if (typeof window === 'undefined') return this.initializeVault();
        const data = localStorage.getItem(VAULT_KEY);
        if (data) return JSON.parse(data);
        return this.initializeVault();
    }

    private initializeVault(): VaultData {
        const newData: VaultData = {
            encryptedMnemonic: '',
            salt: '',
            iv: '',
            isEncrypted: false,
            wallets: []
        };
        this.saveVault(newData);
        return newData;
    }

    private async saveVault(data: VaultData) {
        if (typeof window === 'undefined') return;
        localStorage.setItem(VAULT_KEY, JSON.stringify(data));
    }
}
