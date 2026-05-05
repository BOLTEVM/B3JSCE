import { B3Web3 } from '@b3js/web3';

export interface TradeIntent {
    ticker: string;
    action: 'BUY' | 'SELL';
    amount: number;
    price?: number;
    timestamp: number;
    chainId?: string;
}

/**
 * Wallet Integration
 * Connects the engine's economic intents to the user's detected browser wallet 
 * or the hardened BoltOS internal vault.
 */
export async function requestWalletTransaction(intent: TradeIntent): Promise<boolean> {
    // 1. Validation
    if (!intent.ticker || !intent.action || !intent.amount) {
        console.error("[WalletIntegration] Invalid trade intent:", intent);
        return false;
    }

    const activeChainId = intent.chainId || 'ethereum';
    
    // 2. Resolve Contract Address
    const ROUTER_ADDRESS = (window as any).B3_ROUTER_ADDRESS || '0x74726164696e6720726f757465722062336a73'; 

    // 3. Construct Transaction Data (Hardened Tag Format)
    const actionTag = intent.action === 'BUY' ? '01' : '02';
    const tickerHex = Buffer.from(intent.ticker.padEnd(8, ' ')).toString('hex');
    const amountHex = intent.amount.toString(16).padStart(16, '0');
    const data = `0xb3ee${actionTag}${tickerHex}${amountHex}`;

    // ─── Provider Branching ───────────────────────────────────────

    // Option A: Internal Vault (BoltOS Hardened Core)
    if (!B3Web3.vault.isLocked()) {
        console.log("[WalletIntegration] Using Internal Hardened Vault...");
        try {
            B3Web3.vault.setActiveChain(activeChainId);
            const wallets = await B3Web3.vault.listWallets();
            if (wallets.length === 0) throw new Error("No wallets in vault");
            
            const walletId = wallets[0].id; // Default to first wallet for demo
            
            const txParams = {
                to: ROUTER_ADDRESS,
                value: '0',
                data: data,
                gasLimit: 100000n, // Reasonable default for contract call
                nonce: 0 // In real use, fetch this from provider
            };

            const signedTx = await B3Web3.vault.signTransaction(walletId, txParams);
            const txHash = await B3Web3.vault.broadcastTransaction(signedTx);
            
            console.log(`[WalletIntegration] Vault Transaction successful: ${txHash}`);
            return true;
        } catch (e: any) {
            console.error("[WalletIntegration] Internal Vault Error:", e);
            B3Web3.vault.logEvent('security', `Transaction failed: ${e.message}`, 'error');
            // Fallback to MetaMask if vault fails
        }
    }

    // Option B: External Browser Wallet (MetaMask)
    if (typeof (window as any).ethereum !== 'undefined') {
        const ethereum = (window as any).ethereum;
        try {
            const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
            const account = accounts[0];

            console.log(`[WalletIntegration] Preparing ${intent.action} order for ${intent.ticker} via MetaMask...`);

            const txParams = {
                to: ROUTER_ADDRESS,
                from: account,
                value: '0x00', 
                data: data,
                gas: '0x186A0' // 100,000 gas
            };

            const txHash = await ethereum.request({
                method: 'eth_sendTransaction',
                params: [txParams],
            });

            console.log(`[WalletIntegration] MetaMask Transaction submitted: ${txHash}`);
            return true;
        } catch (error) {
            console.error("[WalletIntegration] MetaMask Transaction failed or rejected", error);
            return false;
        }
    } else {
        console.error("[WalletIntegration] No wallet provider available (Vault locked & No MetaMask).");
        return false;
    }
}
