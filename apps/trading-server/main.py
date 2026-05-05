from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sockets import router as websocket_router

app = FastAPI(title="TradingAgents Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(websocket_router)

@app.get("/")
async def root():
    return {"message": "TradingAgents API is running"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
