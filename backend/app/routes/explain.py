from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException

from ..deps import get_provider_dep, parse_as_of
from ..engine import ai_rephrase
from ..engine import insight as insight_engine

router = APIRouter(prefix="/api", tags=["explain"])


@router.get("/explain/{block_id}")
def explain(block_id: str, as_of: date = Depends(parse_as_of), provider=Depends(get_provider_dep)):
    """Legacy narrative endpoint, kept as a thin wrapper over the insight engine
    (POST /api/insight is the general 'explain anything' surface)."""
    ctx = {"as_of": as_of, "provider": provider}
    try:
        payload = insight_engine.build_insight("block_status", block_id, None, ctx)
    except insight_engine.SubjectNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    payload = ai_rephrase.maybe_rephrase(payload)
    return {
        "block_id": block_id,
        "as_of": as_of.isoformat(),
        "narrative": payload["explanation"],
        "source": payload["source"],
    }
