from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends

from ..deps import get_provider_dep, parse_as_of
from ..services import evaluate_all

router = APIRouter(prefix="/api", tags=["briefing"])


def _headline(r: dict) -> str:
    stage = r["stage"]
    if r["status"] == "too_dry":
        slip = r["pour_slip"]
        return (
            f"Pour {round(slip['needed_mm'])} mm ({slip['runtime_hours']} h, "
            f"{slip['window']}) — {stage} drifting dry."
        )
    if r["status"] == "too_wet":
        return f"Hold irrigation — {stage} is too wet; watering risks dilution."
    return f"On the {stage} glide path — no action needed."


@router.get("/briefing")
def briefing(as_of: date = Depends(parse_as_of), provider=Depends(get_provider_dep)):
    evaluations = evaluate_all(as_of, provider)
    blocks = []
    for ev in evaluations:
        r = ev.response
        blocks.append(
            {
                "block_id": ev.block.id,
                "name": ev.block.name,
                "traffic": r["traffic"],
                "status": r["status"],
                "score": r["score"],
                "headline": _headline(r),
            }
        )
    blocks.sort(key=lambda b: b["score"], reverse=True)

    n_dry = sum(1 for b in blocks if b["status"] == "too_dry")
    n_wet = sum(1 for b in blocks if b["status"] == "too_wet")
    n_ok = sum(1 for b in blocks if b["status"] == "on_track")
    top = blocks[0] if blocks else None
    peak = f" Peak pressure: {top['block_id']} ({top['score']})." if top else ""
    farm_summary = (
        f"{n_dry} block(s) need water, {n_wet} too wet, {n_ok} on track.{peak}"
    )
    return {"as_of": as_of.isoformat(), "blocks": blocks, "farm_summary": farm_summary}
