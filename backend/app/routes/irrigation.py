"""Manual irrigation logging API.

Lets a grower record water actually applied to a block outside the engine's own
recommendations, so the modelled soil-water balance stays honest against reality.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..schemas import IrrigationEvent
from ..services import append_irrigation, load_blocks

router = APIRouter(prefix="/api", tags=["irrigation"])


@router.post("/irrigation")
def log_irrigation(event: IrrigationEvent):
    """Append one logged irrigation event for a block. Persists to
    app/data/irrigation_log.json (append-only; no dedupe), which the water-balance
    model reads back to offset modelled depletion on that date."""
    if not any(b.id == event.block_id for b in load_blocks()):
        raise HTTPException(status_code=404, detail=f"block '{event.block_id}' not found")
    append_irrigation(
        {"block_id": event.block_id, "date": event.date.isoformat(), "mm": event.mm}
    )
    return {"ok": True}
