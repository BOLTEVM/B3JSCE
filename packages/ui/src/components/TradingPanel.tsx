import * as webjsx from 'webjsx';
import { tradingClient, requestWalletTransaction } from '@b3js/engine';

export function TradingPanel(props?: any) {
    let tickerInput: HTMLInputElement;
    let apiKeyInput: HTMLInputElement;
    let providerSelect: HTMLSelectElement;
    let logContainer: HTMLDivElement;

    // Local state for UI feedback
    const [isAnalyzing, setIsAnalyzing] = webjsx.useState(false);
    const [lastDecision, setLastDecision] = webjsx.useState<string | null>(null);

    // Connect automatically if not already connected
    if (!tradingClient.active) {
        tradingClient.connect();
    }

    const appendLog = (type: string, content: string, color: string = 'gray-400') => {
        if (!logContainer) return;
        const entry = document.createElement('div');
        entry.className = 'text-sm mb-2 pb-2 border-b border-gray-700/50';
        entry.innerHTML = `<span class="text-${color} font-bold">[${type}]</span> ${content}`;
        logContainer.appendChild(entry);
        logContainer.scrollTop = logContainer.scrollHeight;
    };

    // Listen to incoming messages
    tradingClient.onMessage((msg) => {
        if (!logContainer) return;

        if (msg.type === 'status') {
            appendLog('Status', msg.message, 'blue-400');
        } else if (msg.type === 'decision') {
            appendLog('Decision', msg.decision, 'green-400');
            setLastDecision(msg.decision);
            setIsAnalyzing(false);
        } else if (msg.type === 'error') {
            appendLog('Error', msg.message, 'red-400');
            setIsAnalyzing(false);
        } else if (msg.type === 'node_update') {
            appendLog(msg.node, msg.content, 'yellow-400');
        }
    });

    const startAnalysis = () => {
        if (!tickerInput || !apiKeyInput || !providerSelect) return;
        
        const apiKey = apiKeyInput.value.trim();
        if (!apiKey && providerSelect.value !== 'ollama') {
            alert("Please enter an API Key for the selected provider.");
            return;
        }

        setIsAnalyzing(true);
        setLastDecision(null);

        const config = {
            llm_provider: providerSelect.value,
            api_key: apiKey
        };

        appendLog('System', `Initiating Agent Deployment for ${tickerInput.value}...`, 'gray-300');
        tradingClient.startAnalysis(tickerInput.value, '2026-01-15', config);
    };

    const executeTrade = async () => {
        if (!lastDecision || !tickerInput) return;

        // Parse decision (simple heuristic)
        const action = lastDecision.toUpperCase().includes('BUY') ? 'BUY' : 
                      lastDecision.toUpperCase().includes('SELL') ? 'SELL' : null;

        if (!action) {
            appendLog('Web3', 'Decision does not contain a clear BUY or SELL signal.', 'red-400');
            return;
        }

        appendLog('Web3', `Requesting Wallet Authorization for ${action} ${tickerInput.value}...`, 'purple-400');

        const success = await requestWalletTransaction({
            ticker: tickerInput.value,
            action: action as 'BUY' | 'SELL',
            amount: 1.0, // Default for demo, should be configurable
            timestamp: Date.now()
        });

        if (success) {
            appendLog('Web3', 'Transaction Submitted Successfully!', 'green-400');
        } else {
            appendLog('Web3', 'Transaction Failed or Cancelled.', 'red-400');
        }
    };

    const clearKeys = () => {
        if (apiKeyInput) apiKeyInput.value = '';
        appendLog('System', 'API Keys cleared from local session.', 'gray-500');
    };

    return (
        <div class="p-4 h-full flex flex-col bg-[#1a1b1e] text-white">
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
                        value="NVDA"
                        disabled={isAnalyzing}
                        class="w-full bg-black/30 border border-gray-700 rounded px-2 py-1 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-50"
                    />
                </div>
                
                <div>
                    <label class="block text-xs text-gray-400 mb-1">LLM Provider</label>
                    <select 
                        ref={(el: any) => { if(el) providerSelect = el; }}
                        disabled={isAnalyzing}
                        class="w-full bg-black/30 border border-gray-700 rounded px-2 py-1 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-50"
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
                {/* Logs will stream here */}
            </div>
        </div>
    );
}
