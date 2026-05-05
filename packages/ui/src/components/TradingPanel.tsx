import * as webjsx from 'webjsx';
import { tradingClient, requestWalletTransaction } from '@b3js/engine';
import { B3Web3 } from '@b3js/web3';

let isAnalyzing = false;
let lastDecision: string | null = null;
let currentTicker = 'NVDA';
let currentProvider = 'openai';
let logEntries: { type: string, content: string, color: string }[] = [];
let hasConnected = false;
let vaultPassword = '';

export function TradingPanel({ onRender }: any) {
    let tickerInput: HTMLInputElement;
    let apiKeyInput: HTMLInputElement;
    let providerSelect: HTMLSelectElement;
    let logContainer: HTMLDivElement;
    let passInput: HTMLInputElement;

    // Connect automatically if not already connected
    if (!tradingClient.active && !hasConnected) {
        tradingClient.connect();
        hasConnected = true;
    }

    const appendLog = (type: string, content: string, color: string = 'gray-400') => {
        logEntries.push({ type, content, color });
        if (logContainer) {
            const entry = document.createElement('div');
            entry.className = 'text-sm mb-2 pb-2 border-b border-gray-700/50';
            entry.innerHTML = `<span class="text-${color} font-bold">[${type}]</span> ${content}`;
            logContainer.appendChild(entry);
            logContainer.scrollTop = logContainer.scrollHeight;
        }
    };

    // Set up message handler if not already set
    if (!(tradingClient as any)._hasUIListener) {
        tradingClient.onMessage((msg) => {
            if (msg.type === 'status') {
                appendLog('Status', msg.message, 'blue-400');
            } else if (msg.type === 'decision') {
                appendLog('Decision', msg.decision, 'green-400');
                lastDecision = msg.decision;
                isAnalyzing = false;
                if (onRender) onRender();
            } else if (msg.type === 'error') {
                appendLog('Error', msg.message, 'red-400');
                isAnalyzing = false;
                if (onRender) onRender();
            } else if (msg.type === 'node_update') {
                appendLog(msg.node, msg.content, 'yellow-400');
            }
        });
        (tradingClient as any)._hasUIListener = true;
    }

    const startAnalysis = () => {
        if (!tickerInput || !apiKeyInput || !providerSelect) return;
        
        const apiKey = apiKeyInput.value.trim();
        if (!apiKey && providerSelect.value !== 'ollama') {
            alert("Please enter an API Key for the selected provider.");
            return;
        }

        isAnalyzing = true;
        lastDecision = null;
        currentTicker = tickerInput.value;
        currentProvider = providerSelect.value;

        const config = {
            llm_provider: providerSelect.value,
            api_key: apiKey
        };

        appendLog('System', `Initiating Agent Deployment for ${tickerInput.value}...`, 'gray-300');
        tradingClient.startAnalysis(tickerInput.value, '2026-01-15', config);
        if (onRender) onRender();
    };

    const executeTrade = async () => {
        if (!lastDecision) return;

        // Parse decision (simple heuristic)
        const action = lastDecision.toUpperCase().includes('BUY') ? 'BUY' : 
                      lastDecision.toUpperCase().includes('SELL') ? 'SELL' : null;

        if (!action) {
            appendLog('Web3', 'Decision does not contain a clear BUY or SELL signal.', 'red-400');
            return;
        }

        appendLog('Web3', `Requesting Wallet Authorization for ${action} ${currentTicker}...`, 'purple-400');

        const success = await requestWalletTransaction({
            ticker: currentTicker,
            action: action as 'BUY' | 'SELL',
            amount: 1.0, 
            timestamp: Date.now()
        });

        if (success) {
            appendLog('Web3', 'Transaction Submitted Successfully!', 'green-400');
        } else {
            appendLog('Web3', 'Transaction Failed or Cancelled.', 'red-400');
        }
    };

    const unlockVault = async () => {
        if (!passInput) return;
        const success = await B3Web3.vault.unlock(passInput.value);
        if (success) {
            appendLog('Vault', 'Hardened Core Unlocked', 'green-400');
            if (onRender) onRender();
        } else {
            alert("Invalid Vault Password");
        }
    };

    const clearKeys = () => {
        if (apiKeyInput) apiKeyInput.value = '';
        appendLog('System', 'API Keys cleared from local session.', 'gray-500');
    };

    const isVaultLocked = B3Web3.vault.isLocked();

    return (
        <div class="p-4 h-full flex flex-col bg-[#1a1b1e] text-white relative">
            
            {/* Vault Lockdown Overlay */}
            {isVaultLocked && (
                <div class="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center">
                    <i class="fas fa-lock text-4xl text-blue-500 mb-4"></i>
                    <h3 class="text-xl font-bold mb-2">Vault Lockdown</h3>
                    <p class="text-xs text-gray-400 mb-6 leading-relaxed">
                        The hardened wallet core is encrypted. Unlock to enable secure Web3 execution for autonomous agents.
                    </p>
                    <input 
                        ref={(el: any) => { if(el) passInput = el; }}
                        type="password" 
                        placeholder="Enter Vault Password"
                        class="w-full max-w-xs bg-white/5 border border-white/10 rounded px-3 py-2 text-sm mb-4 focus:border-blue-500 outline-none"
                        onKeyDown={(e: any) => { if(e.key === 'Enter') unlockVault(); }}
                    />
                    <button 
                        onClick={unlockVault}
                        class="w-full max-w-xs bg-blue-600 hover:bg-blue-500 text-white rounded py-2 text-sm font-medium transition-all"
                    >
                        Unlock Hardened Core
                    </button>
                    <p class="text-[10px] text-gray-600 mt-4">
                        Powered by BoltOS OWS-Core v1.0
                    </p>
                </div>
            )}

            <h2 class="text-lg font-bold mb-4 flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <i class="fas fa-chart-line text-blue-500"></i>
                    TradingAgents
                </div>
                {isAnalyzing && (
                    <div class="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded animate-pulse uppercase">
                        Analyzing...
                    </div>
                )}
            </h2>

            <div class="space-y-4 mb-4">
                <div>
                    <label class="block text-xs text-gray-400 mb-1">Ticker Symbol</label>
                    <input 
                        ref={(el: any) => { if(el) tickerInput = el; }} 
                        type="text" 
                        value={currentTicker}
                        disabled={isAnalyzing}
                        class="w-full bg-black/30 border border-gray-700 rounded px-2 py-1 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-50"
                        onInput={(e: any) => { currentTicker = e.target.value; }}
                    />
                </div>
                
                <div>
                    <label class="block text-xs text-gray-400 mb-1">LLM Provider</label>
                    <select 
                        ref={(el: any) => { if(el) providerSelect = el; }}
                        disabled={isAnalyzing}
                        value={currentProvider}
                        class="w-full bg-black/30 border border-gray-700 rounded px-2 py-1 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-50"
                        onChange={(e: any) => { currentProvider = e.target.value; if(onRender) onRender(); }}
                    >
                        <option value="openai">OpenAI (GPT-5)</option>
                        <option value="google">Google (Gemini)</option>
                        <option value="deepseek">DeepSeek</option>
                        <option value="ollama">Local (Ollama)</option>
                    </select>
                </div>

                <div>
                    <div class="flex items-center justify-between mb-1">
                        <label class="block text-xs text-gray-400">Provider API Key</label>
                        <button onClick={clearKeys} class="text-[10px] text-gray-500 hover:text-red-400 transition-colors">Clear Key</button>
                    </div>
                    <input 
                        ref={(el: any) => { if(el) apiKeyInput = el; }} 
                        type="password" 
                        placeholder="sk-..."
                        disabled={isAnalyzing}
                        class="w-full bg-black/30 border border-gray-700 rounded px-2 py-1 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-50"
                    />
                </div>

                <div class="flex gap-2">
                    <button 
                        onClick={startAnalysis}
                        disabled={isAnalyzing}
                        class="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white rounded py-2 text-sm font-medium transition-colors"
                    >
                        {isAnalyzing ? 'Simulation Active...' : 'Deploy Agents'}
                    </button>

                    {lastDecision && (
                        <button 
                            onClick={executeTrade}
                            class="flex-1 bg-green-600 hover:bg-green-500 text-white rounded py-2 text-sm font-medium transition-colors border-l border-green-700"
                        >
                            Authorize Web3 Trade
                        </button>
                    )}
                </div>
            </div>

            <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Live Agent Debate Log</h3>
            <div 
                ref={(el: any) => { if(el) logContainer = el; }}
                class="flex-1 overflow-y-auto bg-black/50 border border-gray-800 rounded p-2 font-mono text-[11px] leading-relaxed"
            >
                {logEntries.map(log => (
                    <div class="text-sm mb-2 pb-2 border-b border-gray-700/50">
                        <span class={`text-${log.color} font-bold`}>[{log.type}]</span> {log.content}
                    </div>
                ))}
            </div>
        </div>
    );
}
