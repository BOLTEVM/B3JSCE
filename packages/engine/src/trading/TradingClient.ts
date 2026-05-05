export class TradingClient {
    private ws: WebSocket | null = null;
    private listeners: ((event: any) => void)[] = [];
    public active: boolean = false;

    constructor(private url: string = "ws://localhost:8001/ws/trade") {}

    public connect() {
        if (this.ws && this.active) return;
        this.ws = new WebSocket(this.url);
        
        this.ws.onopen = () => {
            this.active = true;
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
        };
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
            console.warn("[TradingClient] Cannot start analysis: WS not open");
        }
    }

    public onMessage(callback: (event: any) => void) {
        this.listeners.push(callback);
    }
}

export const tradingClient = new TradingClient();
