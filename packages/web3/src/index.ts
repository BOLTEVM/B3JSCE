import { PrivyProvider } from '@privy-io/react-auth';

/**
 * B3JS Web3 Core
 */
export class B3Web3 {
    static async connect() {
        console.log("B3JS: Connecting to Web3...");
        return { address: "0x123...456", status: "CONNECTED" };
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
                // Simulating Quai hashrate/shares since the middleware provided was hardware-only
                this.stats = {
                    hashrate: 450.5, // Mock hashrate for demonstration
                    shares: 12,
                    status: 'ONLINE',
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
