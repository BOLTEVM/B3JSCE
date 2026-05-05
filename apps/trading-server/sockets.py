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
    # Set the provider key based on the user's config
    llm_provider = config.get("llm_provider", "openai")
    api_key = config.get("api_key", "")
    
    if llm_provider == "openai":
        os.environ["OPENAI_API_KEY"] = api_key
    elif llm_provider == "google":
        os.environ["GOOGLE_API_KEY"] = api_key
    # Add other providers as needed

    ta_config = DEFAULT_CONFIG.copy()
    ta_config["llm_provider"] = llm_provider
    ta_config["checkpoint_enabled"] = False # simplify for now

    # We will wrap the execution to stream updates
    ta = TradingAgentsGraph(debug=True, config=ta_config)

    # In a real scenario with LangGraph, you'd iterate over the graph events:
    # async for event in ta.graph.astream({"ticker": ticker, ...}):
    #     await websocket.send_json({"type": "node_update", "node": node_name, "content": ...})
    
    # As a simple wrapper, we'll run propagate() in a thread and send a start/end message
    await websocket.send_json({"type": "status", "message": f"Starting analysis for {ticker}..."})
    
    try:
        # Since propagate is synchronous, run it in an executor
        loop = asyncio.get_event_loop()
        state, decision = await loop.run_in_executor(None, ta.propagate, ticker, target_date)
        
        # Send the final decision
        await websocket.send_json({
            "type": "decision",
            "decision": decision,
            "state": str(state) # simplify the state dump
        })
    except Exception as e:
        await websocket.send_json({"type": "error", "message": str(e)})


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
