/**
 * Wallet Integration
 * Connects the engine's economic intents to the user's detected browser wallet (e.g. MetaMask).
 */

export interface TradeIntent {
    ticker: string;
    action: 'BUY' | 'SELL';
    amount: number;
    price?: number;
    timestamp: number;
}

export async function requestWalletTransaction(intent: TradeIntent): Promise<boolean> {
    // 1. Validation
    if (!intent.ticker || !intent.action || !intent.amount) {
        console.error("[WalletIntegration] Invalid trade intent:", intent);
        return false;
    }

    if (typeof (window as any).ethereum !== 'undefined') {
        const ethereum = (window as any).ethereum;
        try {
            // Request account access
            const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
            const account = accounts[0];

            console.log(`[WalletIntegration] Preparing ${intent.action} order for ${intent.ticker}...`);

            // 2. Resolve Contract Address
            // In a production environment, this would come from a ContractRegistry.
            // For now, we use a placeholder for the B3 Trading Router.
            const ROUTER_ADDRESS = (window as any).B3_ROUTER_ADDRESS || '0x74726164696e6720726f757465722062336a73'; 

            // 3. Construct Transaction Data
            // We avoid raw JSON in 'data' for security. 
            // We use a simple tag format: [B3][ACTION][TICKER][AMOUNT]
            const actionTag = intent.action === 'BUY' ? '01' : '02';
            const tickerHex = Buffer.from(intent.ticker.padEnd(8, ' ')).toString('hex');
            const amountHex = intent.amount.toString(16).padStart(16, '0');
            const data = `0xb3ee${actionTag}${tickerHex}${amountHex}`;

            const txParams = {
                to: ROUTER_ADDRESS,
                from: account,
                value: '0x00', 
                data: data,
                gas: '0x5208' // 21000 base + buffer, should ideally be estimated
            };

            console.log("[WalletIntegration] Prompting wallet with data:", data);

            const txHash = await ethereum.request({
                method: 'eth_sendTransaction',
                params: [txParams],
            });

            console.log(`[WalletIntegration] Transaction submitted: ${txHash}`);
            return true;
        } catch (error) {
            console.error("[WalletIntegration] Transaction failed or rejected", error);
            return false;
        }
    } else {
        console.error("[WalletIntegration] Web3 Wallet not detected. Action aborted.");
        return false;
    }
}
