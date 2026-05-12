import { B3Web3, SwapQuoteParams } from '@b3js/web3';

export interface TradeIntent {
    ticker: string;
    action: 'BUY' | 'SELL';
    amount: number;
    price?: number;
    timestamp: number;
    chainId?: string;
    targetToken?: string;
}

/**
 * Wallet Integration
 * Connects the engine's economic intents to the user's detected browser wallet 
 * or the hardened BoltOS internal vault via LI.FI aggregator.
 */
export async function requestWalletTransaction(intent: TradeIntent): Promise<boolean> {
    // 1. Validation
    if (!intent.ticker || !intent.action || !intent.amount) {
        console.error("[WalletIntegration] Invalid trade intent:", intent);
        return false;
    }

    const activeChainId = intent.chainId || 'ethereum';
    
    // 2. Determine Tokens based on Action
    // BUY: Swap native for ticker
    // SELL: Swap ticker for native
    const fromToken = intent.action === 'BUY' ? 'native' : intent.ticker;
    const toToken = intent.action === 'BUY' ? intent.ticker : 'native';
    
    // 3. Fetch Quote from Aggregator
    console.log(`[WalletIntegration] Fetching quote for ${intent.action} ${intent.amount} ${intent.ticker}...`);
    
    // In a real scenario, the fromAddress needs to be the wallet's address.
    // For now, we will attempt to get it from the Vault or MetaMask.
    let fromAddress = '';
    let useVault = false;
    let walletId = '';
    
    if (!B3Web3.vault.isLocked()) {
        const wallets = await B3Web3.vault.listWallets();
        if (wallets.length > 0) {
            fromAddress = wallets[0].address;
            walletId = wallets[0].id;
            useVault = true;
        }
    } else if (typeof (window as any).ethereum !== 'undefined') {
        const accounts = await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
        if (accounts && accounts.length > 0) {
            fromAddress = accounts[0];
        }
    }

    if (!fromAddress) {
        console.error("[WalletIntegration] No wallet provider available (Vault locked & No MetaMask).");
        return false;
    }

    try {
        const quoteParams: SwapQuoteParams = {
            fromChainKey: activeChainId,
            toChainKey: activeChainId,
            fromToken,
            toToken,
            fromAmount: intent.amount.toString(),
            fromAddress,
            slippage: 0.005
        };

        const quote = await B3Web3.swapProvider.getQuote(quoteParams);
        
        // Handle Approval
        if (quote.approvalRequired && quote.approvalAddress) {
            console.log(`[WalletIntegration] Approval required for ${quote.approvalAddress}`);
            const approvalReq = await B3Web3.swapProvider.checkApproval(
                quote.fromToken.address,
                fromAddress,
                quote.approvalAddress,
                quote.fromAmount,
                activeChainId
            );
            
            if (approvalReq) {
                if (useVault) {
                    const signedApproval = await B3Web3.vault.signTransaction(walletId, {
                        to: approvalReq.to,
                        data: approvalReq.data,
                        value: approvalReq.value,
                        gasLimit: approvalReq.gasLimit,
                        chainId: approvalReq.chainId
                    });
                    await B3Web3.vault.broadcastTransaction(signedApproval);
                } else {
                    await (window as any).ethereum.request({
                        method: 'eth_sendTransaction',
                        params: [{
                            to: approvalReq.to,
                            from: fromAddress,
                            data: approvalReq.data,
                        }],
                    });
                }
                console.log(`[WalletIntegration] Approval transaction sent.`);
            }
        }

        // ─── Provider Branching ───────────────────────────────────────

        // Option A: Internal Vault (BoltOS Hardened Core)
        if (useVault) {
            console.log("[WalletIntegration] Using Internal Hardened Vault...");
            B3Web3.vault.setActiveChain(activeChainId);
            const txHash = await B3Web3.vault.executeSwap(walletId, quote);
            console.log(`[WalletIntegration] Vault Swap successful: ${txHash}`);
            return true;
        }

        // Option B: External Browser Wallet (MetaMask)
        if (typeof (window as any).ethereum !== 'undefined') {
            console.log(`[WalletIntegration] Preparing ${intent.action} order for ${intent.ticker} via MetaMask...`);

            const txParams = {
                to: quote.transactionRequest.to,
                from: fromAddress,
                value: "0x" + BigInt(quote.transactionRequest.value || "0").toString(16), 
                data: quote.transactionRequest.data,
                gas: "0x" + BigInt(quote.transactionRequest.gasLimit || "100000").toString(16)
            };

            const txHash = await (window as any).ethereum.request({
                method: 'eth_sendTransaction',
                params: [txParams],
            });

            console.log(`[WalletIntegration] MetaMask Swap submitted: ${txHash}`);
            return true;
        }
        
    } catch (error: any) {
        console.error("[WalletIntegration] Transaction failed or rejected:", error);
        if (useVault) {
             B3Web3.vault.logEvent('security', `Transaction failed: ${error.message}`, 'error');
        }
        return false;
    }
    
    return false;
}
