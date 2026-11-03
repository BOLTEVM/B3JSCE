import { ContractRegistry } from './ContractRegistry';
import { AssetRegistry } from './AssetRegistry';
import { VaultManager } from './VaultManager';
import { SwapProvider, SwapQuote, SwapQuoteParams, BridgeQuoteParams } from './SwapProvider';
import { QuaiMinerClient, HashrateTracker, quaiAxeSplit, formatQuai } from './QuaiMiner';

export { ContractRegistry, AssetRegistry, VaultManager, SwapProvider, QuaiMinerClient, HashrateTracker, quaiAxeSplit, formatQuai };
export type { SwapQuote, SwapQuoteParams, BridgeQuoteParams };
export type { QuaiMinerConfig, QuaiMinerTelemetry, QuaiMinerEvent, MinerConnectionState, ShareRecord, QuaiAxeSplit } from './QuaiMiner';
export {
    DEFAULT_QUAI_MINER_CONFIG,
    QUAIAXE_FEE_BPS,
    QUAIAXE_MAX_GAS_BPS,
    QUAIAXE_MIN_BURN_BPS,
    QUAI_WEI,
    BPS,
} from './QuaiMiner';

/**
 * B3JS Web3 Core
 */
export class B3Web3 {
    public static contracts = new ContractRegistry();
    public static assets = new AssetRegistry();
    public static vault = new VaultManager();
    public static swapProvider = new SwapProvider();

    static async connect() {
        console.log("B3JS: Connecting to Web3...");
        return { address: "0x123...456", status: "CONNECTED" };
    }

    /**
     * Checks if the connected wallet owns the B3 Governance NFT.
     * Used for unlocking AI administrative features.
     */
    static async isGovernanceMember(address: string): Promise<boolean> {
        console.log(`B3JS Web3: Verifying Governance NFT for ${address}...`);
        // In production, this would call a contract.balanceOf() or use an indexer API.
        // For now, we simulate ownership for the demo address.
        return address.startsWith("0x123") || address === "Admin";
    }
}

export type MiningStats = {
    hashrate: number;
    shares: number;
    status: 'ONLINE' | 'OFFLINE';
    miner: 'QRL' | 'QUAI';
};

/**
 * MinerClient: Bridge to local mining middleware
 */
export class MinerClient {
    private static instance: MinerClient;
    private qrlSocket: WebSocket | null = null;
    private quaiInterval: any = null;
    public stats: MiningStats = { hashrate: 0, shares: 0, status: 'OFFLINE', miner: 'QRL' };
    private listeners: ((stats: MiningStats) => void)[] = [];

    static getInstance() {
        if (!this.instance) this.instance = new MinerClient();
        return this.instance;
    }

    connectQRL(url: string = 'ws://localhost:8000/ws') {
        this.qrlSocket = new WebSocket(url);
        this.qrlSocket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.stats = {
                hashrate: data.hashrate || 0,
                shares: data.shares || 0,
                status: data.running ? 'ONLINE' : 'OFFLINE',
                miner: 'QRL'
            };
            this.notify();
        };
        this.qrlSocket.onclose = () => {
            this.stats.status = 'OFFLINE';
            this.notify();
        };
    }

    startQuaiPolling(url: string = 'http://localhost:8081/api/hardware') {
        if (this.quaiInterval) clearInterval(this.quaiInterval);
        this.quaiInterval = setInterval(async () => {
            try {
                const res = await fetch(url);
                const data = await res.json();
                this.stats = {
                    hashrate: data.hashrate || 0,
                    shares: data.shares || 0,
                    status: data.running ? 'ONLINE' : 'OFFLINE',
                    miner: 'QUAI'
                };
                this.notify();
            } catch (e) {
                this.stats.status = 'OFFLINE';
                this.notify();
            }
        }, 3000);
    }

    addListener(fn: (stats: MiningStats) => void) {
        this.listeners.push(fn);
        fn(this.stats);
    }

    private notify() {
        this.listeners.forEach(fn => fn(this.stats));
    }
}
