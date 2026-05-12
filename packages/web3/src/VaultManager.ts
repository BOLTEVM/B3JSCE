import { ethers, wordlists } from 'ethers';
import { LangEn } from 'ethers/wordlists';
import { CHAINS, ChainConfig } from './chains';
import type { SwapQuote } from './SwapProvider';

// BOLT-09: Robust wordlist resolution to prevent "FAILED" errors in minified builds
if (typeof window !== 'undefined') {
    try {
        const en = LangEn.wordlist();
        if (!(wordlists as any).en) (wordlists as any).en = en;
    } catch (e) {
        console.warn("[VAULT] Wordlist initialization warning:", e);
    }
}

const VAULT_KEY = 'b3_vault_v1';

export interface WalletMetadata {
    id: string;
    name: string;
    address: string;
    index: number;
    createdAt: string;
}

export interface HistoryData {
    hash: string;
    type: 'send' | 'receive' | 'contract_call';
    from: string;
    to: string;
    value: string;
    asset: string;
    timestamp: string;
    chainId: string;
    status: 'success' | 'failed' | 'pending';
}

export interface LogEvent {
    id: string;
    type: 'rpc' | 'security' | 'session' | 'fallback';
    message: string;
    status: 'success' | 'error' | 'warning' | 'info';
    timestamp: number;
    metadata?: any;
}

export interface VaultData {
    encryptedMnemonic: string;
    salt: string;
    iv: string;
    isEncrypted: boolean;
    wallets: WalletMetadata[];
    history: HistoryData[];
}

/**
 * VaultManager: Handles encrypted storage of mnemonics and HD derivation.
 * Hardened version integrated from BoltOS Core.
 */
export class VaultManager {
    private sessionMnemonic: string | null = null;
    private activeChainId: string = 'ethereum';
    private logs: LogEvent[] = [];
    private logListeners: ((l: LogEvent[]) => void)[] = [];
    private providerCache: Record<string, ethers.JsonRpcProvider> = {};

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
        this.logEvent('security', 'Vault setup successful', 'success');
        return mnemonic;
    }

    public async unlock(password: string): Promise<boolean> {
        const vault = await this.getVault();
        if (!vault.isEncrypted) return false;
        try {
            this.sessionMnemonic = await this.decrypt(vault.encryptedMnemonic, vault.salt, vault.iv, password);
            this.logEvent('session', 'Vault unlocked', 'success');
            return true;
        } catch (e) {
            this.logEvent('security', 'Invalid vault password attempt', 'error');
            return false;
        }
    }

    public lock() {
        this.sessionMnemonic = null;
        this.logEvent('session', 'Vault locked', 'info');
    }

    public async createWallet(name: string): Promise<WalletMetadata> {
        if (!this.sessionMnemonic) throw new Error("Vault is locked");
        const vault = await this.getVault();
        const index = vault.wallets.length;
        const address = this.deriveAddress(this.sessionMnemonic, index, this.activeChainId);

        const newWallet: WalletMetadata = {
            id: `wallet_${Math.random().toString(16).substring(2, 10)}`,
            name: name || `Wallet ${index + 1}`,
            address,
            index,
            createdAt: new Date().toISOString()
        };

        vault.wallets.push(newWallet);
        await this.saveVault(vault);
        this.logEvent('security', `New wallet created: ${newWallet.name}`, 'success');
        return newWallet;
    }

    public async listWallets(): Promise<WalletMetadata[]> {
        const vault = await this.getVault();
        return vault.wallets.map(w => ({
            ...w,
            address: this.sessionMnemonic ? this.deriveAddress(this.sessionMnemonic, w.index, this.activeChainId) : w.address
        }));
    }

    // ─── Blockchain Interaction ───────────────────────────────────

    public async getNativeBalance(address: string): Promise<string> {
        const rpc = CHAINS[this.activeChainId]?.rpc;
        if (!rpc) return "0.00";
        const provider = this.getProvider(rpc);
        try {
            const balance = await provider.getBalance(address);
            return ethers.formatEther(balance);
        } catch (e) {
            this.logEvent('rpc', `Balance fetch error for ${address}`, 'error');
            return "0.00";
        }
    }

    public async signTransaction(walletId: string, txParams: any): Promise<string> {
        if (!this.sessionMnemonic) throw new Error("Vault is locked");
        const vault = await this.getVault();
        const w = vault.wallets.find(x => x.id === walletId || x.name === walletId);
        if (!w) throw new Error("Wallet not found");

        const chain = CHAINS[this.activeChainId];
        const fullPath = (chain.derivationPath || "m/44'/60'/0'/0/") + w.index;
        
        const wordlist = (wordlists as any).en || LangEn.wordlist();
        const hdNode = ethers.HDNodeWallet.fromPhrase(this.sessionMnemonic, undefined, fullPath, wordlist);
        const wallet = new ethers.Wallet(hdNode.privateKey);

        this.logEvent('security', `Signing transaction for ${chain.name}...`, 'info');

        const signedTx = await wallet.signTransaction({
            to: txParams.to,
            value: txParams.value ? ethers.parseEther(txParams.value.toString()) : 0n,
            data: txParams.data || '0x',
            nonce: txParams.nonce,
            gasLimit: txParams.gasLimit || 21000n,
            gasPrice: txParams.gasPrice || ethers.parseUnits('1', 'gwei'),
            chainId: Number(chain.id)
        });

        return signedTx;
    }

    public async broadcastTransaction(signedTx: string): Promise<string> {
        const rpc = CHAINS[this.activeChainId]?.rpc;
        if (!rpc) throw new Error("No RPC configured for active chain");
        const provider = this.getProvider(rpc);
        
        this.logEvent('rpc', 'Broadcasting transaction...', 'info');
        const txResponse = await provider.broadcastTransaction(signedTx);
        
        // Log to history
        const vault = await this.getVault();
        const newHistory: HistoryData = {
            hash: txResponse.hash,
            type: 'send',
            from: txResponse.from || '0x',
            to: txResponse.to || '0x',
            value: ethers.formatEther(txResponse.value || 0n),
            asset: CHAINS[this.activeChainId]?.nativeCurrency.symbol || 'ETH',
            timestamp: new Date().toISOString(),
            chainId: this.activeChainId,
            status: 'pending'
        };
        (vault as any).history = [newHistory, ...(vault as any).history || []];
        await this.saveVault(vault as any);

        this.logEvent('rpc', `Transaction broadcast: ${txResponse.hash}`, 'success');
        return txResponse.hash;
    }

    public async executeSwap(walletId: string, quote: SwapQuote): Promise<string> {
        if (!quote.transactionRequest?.to || !quote.transactionRequest?.data) {
            throw new Error('Invalid swap quote: missing transaction request data.');
        }
        
        const txParams = {
            to: quote.transactionRequest.to,
            value: quote.transactionRequest.value || '0',
            data: quote.transactionRequest.data,
            gasLimit: quote.transactionRequest.gasLimit,
            gasPrice: quote.transactionRequest.gasPrice
        };
        
        const signedTx = await this.signTransaction(walletId, txParams);
        return await this.broadcastTransaction(signedTx);
    }

    public async executeBridge(walletId: string, quote: SwapQuote): Promise<string> {
        return this.executeSwap(walletId, quote);
    }

    // ─── Utility & Log System ─────────────────────────────────────

    public setActiveChain(chainId: string) {
        if (!CHAINS[chainId]) throw new Error(`Unsupported chain: ${chainId}`);
        this.activeChainId = chainId;
        this.logEvent('session', `Active chain set to ${chainId}`, 'info');
    }

    public logEvent(type: LogEvent['type'], message: string, status: LogEvent['status'] = 'info', metadata?: any) {
        const event: LogEvent = {
            id: Math.random().toString(36).substring(2, 11),
            type,
            message,
            status,
            timestamp: Date.now(),
            metadata
        };
        this.logs = [event, ...this.logs].slice(0, 100);
        this.logListeners.forEach(l => l(this.logs));
    }

    public onLogs(callback: (l: LogEvent[]) => void) {
        this.logListeners.push(callback);
        callback(this.logs);
    }

    // ─── Private Helpers ──────────────────────────────────────────

    private deriveAddress(mnemonic: string, index: number, chainId: string): string {
        const chain = CHAINS[chainId];
        const path = (chain.derivationPath || "m/44'/60'/0'/0/") + index;
        try {
            const wordlist = (wordlists as any).en || LangEn.wordlist();
            const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, path, wordlist);
            return wallet.address;
        } catch (e) {
            console.error("[VAULT] Derivation Error:", e);
            return "0x0000...0000";
        }
    }

    private getProvider(rpcUrl: string): ethers.JsonRpcProvider {
        if (!this.providerCache[rpcUrl]) {
            this.providerCache[rpcUrl] = new ethers.JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
        }
        return this.providerCache[rpcUrl];
    }

    private async deriveKey(password: string, salt: Uint8Array) {
        const encoder = new TextEncoder();
        const passwordKey = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
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
        const key = await this.deriveKey(password, new Uint8Array(base64ToArrayBuffer(salt)));
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: new Uint8Array(base64ToArrayBuffer(iv)) },
            key,
            new Uint8Array(base64ToArrayBuffer(encrypted))
        );
        return decoder.decode(decrypted);
    }

    private async getVault(): Promise<VaultData> {
        if (typeof window === 'undefined') return this.initializeVault();
        const data = localStorage.getItem(VAULT_KEY);
        return data ? JSON.parse(data) : this.initializeVault();
    }

    private initializeVault(): VaultData {
        const newData: VaultData = {
            encryptedMnemonic: '', salt: '', iv: '', isEncrypted: false,
            wallets: [], history: []
        };
        this.saveVault(newData);
        return newData;
    }

    private async saveVault(data: VaultData) {
        if (typeof window !== 'undefined') localStorage.setItem(VAULT_KEY, JSON.stringify(data));
    }
}
