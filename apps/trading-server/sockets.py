import asyncio
import json
import os
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Any

from tradingagents.graph.trading_graph import TradingAgentsGraph
from tradingagents.default_config import DEFAULT_CONFIG

router = APIRouter()

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()

# A mock function to stream output since TradingAgents 
# propagation might not natively stream asynchronously easily without patching.
# For integration purposes, we will simulate the graph stream if needed, 
# or use LangGraph's streaming capabilities if accessible.
async def run_trading_graph(ticker: str, target_date: str, config: Dict[str, Any], websocket: WebSocket):
    # Extract provider and key
    llm_provider = config.get("llm_provider", "openai")
    api_key = config.get("api_key", "")
    
    if not api_key and llm_provider != "ollama":
        await websocket.send_json({"type": "error", "message": f"API Key required for {llm_provider}"})
        return

    # Isolated configuration for this specific request
    ta_config = DEFAULT_CONFIG.copy()
    ta_config.update({
        "llm_provider": llm_provider,
        "api_key": api_key,  # Pass directly to avoid global env state
        "checkpoint_enabled": False,
        "debug_mode": True
    })

    await websocket.send_json({"type": "status", "message": f"Initializing Agents for {ticker}..."})
    
    try:
        # Each request gets its own graph instance
        ta = TradingAgentsGraph(debug=True, config=ta_config)

        await websocket.send_json({"type": "status", "message": f"Running analysis for {ticker} at {target_date}..."})
        
        # Execute the graph propagation in a thread to keep the event loop responsive
        loop = asyncio.get_event_loop()
        # We assume ta.propagate handles the logic correctly
        state, decision = await loop.run_in_executor(None, ta.propagate, ticker, target_date)
        
        await websocket.send_json({
            "type": "decision",
            "decision": decision,
            "state": str(state) if state else "No state returned"
        })
        
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"[TradingServer] Error in graph execution: {error_trace}")
        await websocket.send_json({
            "type": "error", 
            "message": f"Simulation Error: {str(e)}",
            "trace": error_trace if config.get("debug") else None
        })


@router.websocket("/ws/trade")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)
            
            action = payload.get("action")
            if action == "start_analysis":
                ticker = payload.get("ticker", "NVDA")
                target_date = payload.get("date", "2026-01-15")
                config = payload.get("config", {})
                
                # Start the analysis in a background task so we don't block the websocket
                asyncio.create_task(run_trading_graph(ticker, target_date, config, websocket))

    except WebSocketDisconnect:
        manager.disconnect(websocket)
