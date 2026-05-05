import * as webjsx from 'webjsx';
import { tradingClient } from '@b3js/engine';

export function TradingPanel(props?: any) {
    let tickerInput: HTMLInputElement;
    let apiKeyInput: HTMLInputElement;
    let providerSelect: HTMLSelectElement;
    let logContainer: HTMLDivElement;

    // Connect automatically if not already connected
    if (!tradingClient.active) {
        tradingClient.connect();
    }

    // Listen to incoming messages
    tradingClient.onMessage((msg) => {
        if (!logContainer) return;

        const entry = document.createElement('div');
        entry.className = 'text-sm mb-2 pb-2 border-b border-gray-700/50';
        
        if (msg.type === 'status') {
            entry.innerHTML = `<span class="text-blue-400 font-bold">[Status]</span> ${msg.message}`;
        } else if (msg.type === 'decision') {
            entry.innerHTML = `<span class="text-green-400 font-bold">[Decision]</span> ${msg.decision}`;
        } else if (msg.type === 'error') {
            entry.innerHTML = `<span class="text-red-400 font-bold">[Error]</span> ${msg.message}`;
        } else if (msg.type === 'node_update') {
            entry.innerHTML = `<span class="text-yellow-400 font-bold">[${msg.node}]</span> ${msg.content}`;
        } else {
            entry.textContent = JSON.stringify(msg);
        }

        logContainer.appendChild(entry);
        logContainer.scrollTop = logContainer.scrollHeight;
    });

    const startAnalysis = () => {
        if (!tickerInput || !apiKeyInput || !providerSelect) return;
        
        const config = {
            llm_provider: providerSelect.value,
            api_key: apiKeyInput.value
        };

        const entry = document.createElement('div');
        entry.className = 'text-sm mb-2 text-gray-400';
        entry.textContent = `Initiating analysis for ${tickerInput.value}...`;
        logContainer.appendChild(entry);

        tradingClient.startAnalysis(tickerInput.value, '2026-01-15', config);
    };

    return (
        <div class="p-4 h-full flex flex-col bg-[#1a1b1e] text-white">
            <h2 class="text-lg font-bold mb-4 flex items-center gap-2">
                <i class="fas fa-chart-line text-blue-500"></i>
                TradingAgents
            </h2>

            <div class="space-y-4 mb-4">
                <div>
                    <label class="block text-xs text-gray-400 mb-1">Ticker Symbol</label>
                    <input 
                        ref={(el: any) => { if(el) tickerInput = el; }} 
                        type="text" 
                        value="NVDA"
                        class="w-full bg-black/30 border border-gray-700 rounded px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                    />
                </div>
                
                <div>
                    <label class="block text-xs text-gray-400 mb-1">LLM Provider</label>
                    <select 
                        ref={(el: any) => { if(el) providerSelect = el; }}
                        class="w-full bg-black/30 border border-gray-700 rounded px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                    >
                        <option value="openai">OpenAI (GPT-5)</option>
                        <option value="google">Google (Gemini)</option>
                        <option value="deepseek">DeepSeek</option>
                        <option value="ollama">Local (Ollama)</option>
                    </select>
                </div>

                <div>
                    <label class="block text-xs text-gray-400 mb-1">Provider API Key</label>
                    <input 
                        ref={(el: any) => { if(el) apiKeyInput = el; }} 
                        type="password" 
                        placeholder="sk-..."
                        class="w-full bg-black/30 border border-gray-700 rounded px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                    />
                </div>

                <button 
                    onClick={startAnalysis}
                    class="w-full bg-blue-600 hover:bg-blue-500 text-white rounded py-2 text-sm font-medium transition-colors"
                >
                    Start Analysis & Deploy Agents
                </button>
            </div>

            <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Live Debate Log</h3>
            <div 
                ref={(el: any) => { if(el) logContainer = el; }}
                class="flex-1 overflow-y-auto bg-black/50 border border-gray-800 rounded p-2 font-mono text-xs"
            >
                {/* Logs will stream here */}
            </div>
        </div>
    );
}
