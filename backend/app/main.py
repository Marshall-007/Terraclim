from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes import (
    backtest,
    battle_plan,
    blocks,
    briefing,
    explain,
    health,
    irrigation,
    scenario,
    season_bank,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI(
    title="Vino API",
    version="1.0",
    description="Vineyard irrigation intelligence — the Stress Glide Path engine.",
)

# Dev CORS: allow all origins so the Vite frontend can call from any port.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in (health, blocks, battle_plan, season_bank, scenario, backtest, briefing, irrigation, explain):
    app.include_router(module.router)


@app.get("/")
def root():
    return {"name": "Vino API", "docs": "/docs", "health": "/api/health"}
