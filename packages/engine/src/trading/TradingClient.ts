export class TradingClient {
    private ws: WebSocket | null = null;
    private listeners: ((event: any) => void)[] = [];
    private reconnectAttempts: number = 0;
    private maxReconnectDelay: number = 30000;
    public active: boolean = false;

    constructor(private url: string = "ws://localhost:8001/ws/trade") {}

    public connect() {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
        
        console.log(`[TradingClient] Connecting to ${this.url}...`);
        this.ws = new WebSocket(this.url);
        
        this.ws.onopen = () => {
            this.active = true;
            this.reconnectAttempts = 0;
            console.log("[TradingClient] Connected to Trading Server");
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.listeners.forEach(l => l(data));
            } catch (e) {
                console.error("[TradingClient] Failed to parse message:", e);
            }
        };

        this.ws.onerror = (e) => {
            console.error("[TradingClient] WS Error", e);
            this.active = false;
        };

        this.ws.onclose = () => {
            this.active = false;
            console.log("[TradingClient] Disconnected");
            this.scheduleReconnect();
        };
    }

    private scheduleReconnect() {
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);
        console.log(`[TradingClient] Reconnecting in ${delay}ms (Attempt ${this.reconnectAttempts})`);
        setTimeout(() => this.connect(), delay);
    }

    public startAnalysis(ticker: string, date: string, config: any) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                action: "start_analysis",
                ticker,
                date,
                config
            }));
        } else {
            console.warn("[TradingClient] Cannot start analysis: WS not open. Attempting to connect...");
            this.connect();
        }
    }

    public onMessage(callback: (event: any) => void) {
        this.listeners.push(callback);
    }
}

export const tradingClient = new TradingClient();
