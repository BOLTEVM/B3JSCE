import { B3Engine } from './index';

export interface IMiningTelemetry {
    hashrate: number;
    shares_accepted: number;
    shares_rejected: number;
    uptime: number;
    difficulty: number;
    running: boolean;
}

export type SubstrateType = 'FRACTAL' | 'QUAI' | 'QRL';

export class SubstrateSocket {
    private ws: WebSocket | null = null;
    public telemetry: IMiningTelemetry = {
        hashrate: 0,
        shares_accepted: 0,
        shares_rejected: 0,
        uptime: 0,
        difficulty: 0,
        running: false
    };

    constructor(
        public type: SubstrateType,
        public url: string,
        private onMessage: (data: IMiningTelemetry) => void
    ) {}

    connect() {
        if (this.ws) this.ws.close();
        
        try {
            this.ws = new WebSocket(this.url);
            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    // Normalization logic for different miner backends
                    this.telemetry = {
                        hashrate: data.hashrate || 0,
                        shares_accepted: data.shares_accepted || data.shares || 0,
                        shares_rejected: data.shares_rejected || 0,
                        uptime: data.uptime || 0,
                        difficulty: data.difficulty || 0,
                        running: data.miner_running || data.running || false
                    };
                    this.onMessage(this.telemetry);
                } catch (e) {
                    console.error(`B3JS Mining: [${this.type}] Parse Error`, e);
                }
            };
            this.ws.onclose = () => {
                this.telemetry.running = false;
                // Auto-reconnect after 5 seconds
                setTimeout(() => {
                    if (this.ws && this.ws.readyState === WebSocket.CLOSED) {
                        this.connect();
                    }
                }, 5000);
            };
            this.ws.onerror = (err) => {
                console.warn(`B3JS Mining: [${this.type}] Connection Error to ${this.url}`);
            };
        } catch (e) {
            console.error(`B3JS Mining: [${this.type}] WebSocket Init Error`, e);
        }
    }

    disconnect() {
        if (this.ws) {
            this.ws.onclose = null;
            this.ws.close();
            this.ws = null;
        }
        this.telemetry.running = false;
    }
}

export interface SubstrateConfig {
    useRemote: boolean;
    localUrl: string;
    remoteUrl: string;
}

export class MiningManager {
    private sockets: Map<SubstrateType, SubstrateSocket> = new Map();
    
    // Unified configuration — every substrate supports local/remote toggle
    public config: Record<string, SubstrateConfig> = {
        fractal: { 
            useRemote: false, 
            localUrl: 'ws://localhost:8000/ws', 
            remoteUrl: 'ws://node.boltevm.com:8000/ws' 
        },
        quai: { 
            useRemote: false, 
            localUrl: 'ws://localhost:8001/ws', 
            remoteUrl: 'ws://quai.boltevm.com:8001/ws' 
        },
        qrl: { 
            useRemote: false, 
            localUrl: 'ws://localhost:8002/ws', 
            remoteUrl: 'ws://qrl.boltevm.com:8002/ws' 
        }
    };

    constructor(private engine: B3Engine) {}

    public init() {
        this.reconnectSubstrate('FRACTAL');
        this.reconnectSubstrate('QUAI');
        this.reconnectSubstrate('QRL');
        console.log("B3JS Mining Manager: Substrate bridges initialized.");
    }

    /**
     * Universal remote toggle — works for any substrate.
     */
    public setRemote(type: SubstrateType, useRemote: boolean) {
        const key = type.toLowerCase();
        const cfg = this.config[key];
        if (!cfg || cfg.useRemote === useRemote) return;
        cfg.useRemote = useRemote;
        console.log(`B3JS Mining: Switching ${type} to ${useRemote ? 'REMOTE' : 'LOCAL'}`);
        this.reconnectSubstrate(type);
    }

    /** Backward-compatible shorthand for Fractal. */
    public setFractalRemote(useRemote: boolean) {
        this.setRemote('FRACTAL', useRemote);
    }

    private reconnectSubstrate(type: SubstrateType) {
        const old = this.sockets.get(type);
        if (old) old.disconnect();

        const cfg = this.config[type.toLowerCase()];
        const url = cfg.useRemote ? cfg.remoteUrl : cfg.localUrl;
        this.connectTo(type, url);
    }

    private connectTo(type: SubstrateType, url: string) {
        const socket = new SubstrateSocket(type, url, (data) => {
            window.dispatchEvent(new CustomEvent(`b3js:mining:${type.toLowerCase()}`, { detail: data }));
            this.notifyLogicBricks(type, data);
        });
        this.sockets.set(type, socket);
        socket.connect();
    }

    private notifyLogicBricks(type: SubstrateType, data: IMiningTelemetry) {
        this.engine.objects.forEach(obj => {
            obj.sensors.forEach(sensor => {
                if (sensor instanceof MiningSensor) {
                    sensor.onTelemetry({ hashrate: data.hashrate, shares: data.shares_accepted });
                }
            });
        });
    }

    public getSocket(type: SubstrateType): SubstrateSocket | undefined {
        return this.sockets.get(type);
    }

    /** Returns the current useRemote state for a given substrate. */
    public isRemote(type: SubstrateType): boolean {
        return this.config[type.toLowerCase()]?.useRemote ?? false;
    }

    public dispose() {
        this.sockets.forEach(s => s.disconnect());
        this.sockets.clear();
    }
}

// MiningSensor now lives in its own module — direct import avoids circular deps
import { MiningSensor } from './logic/sensors';
