from __future__ import annotations

import logging
from datetime import date

import httpx
from fastapi import APIRouter, Depends, HTTPException

from ..config import get_settings
from ..deps import get_provider_dep, parse_as_of
from ..services import Evaluation, evaluate_block, kc_curves, load_blocks, stress_targets

log = logging.getLogger("vino.explain")
router = APIRouter(prefix="/api", tags=["explain"])


def _template(ev: Evaluation) -> str:
    r = ev.response
    lo, hi = r["target_band"]
    fpct = round(r["depletion_fraction"] * 100)
    base = (
        f"{ev.block.name} ({ev.block.variety}) is in {r['stage']} at {r['gdd']} GDD. "
        f"Root-zone depletion is {r['depletion_mm']} mm ({fpct}% of capacity), against a "
        f"{r['stage']} target band of {round(lo * 100)}–{round(hi * 100)}%."
    )
    if r["status"] == "too_dry":
        return base + f" It has drifted too dry, so {r['recommendation'].lower()}"
    if r["status"] == "too_wet":
        return base + f" It is too wet for this stage. {r['recommendation']}"
    return base + " It is tracking its glide path and needs no action today."


def _ai_narrative(facts: str, api_key: str) -> str:
    resp = httpx.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": "claude-3-5-haiku-latest",
            "max_tokens": 220,
            "messages": [
                {
                    "role": "user",
                    "content": (
                        "Rewrite this vineyard irrigation status as two plain-English sentences "
                        "for a grower. Keep every number exactly as given; do not invent figures.\n\n"
                        + facts
                    ),
                }
            ],
        },
        timeout=httpx.Timeout(15.0, connect=6.0),
    )
    resp.raise_for_status()
    return resp.json()["content"][0]["text"].strip()


@router.get("/explain/{block_id}")
def explain(block_id: str, as_of: date = Depends(parse_as_of), provider=Depends(get_provider_dep)):
    block = next((b for b in load_blocks() if b.id == block_id), None)
    if block is None:
        raise HTTPException(status_code=404, detail=f"block '{block_id}' not found")

    ev = evaluate_block(block, as_of, provider, stress_targets(), kc_curves())
    narrative = _template(ev)
    source = "template"

    settings = get_settings()
    if settings.ai_key:
        try:
            narrative = _ai_narrative(narrative, settings.ai_key)
            source = "ai"
        except Exception as exc:  # AI is a nicety; never let it fail the endpoint
            log.warning("AI narrative failed (%s); using deterministic template", exc)

    return {"block_id": block.id, "as_of": as_of.isoformat(), "narrative": narrative, "source": source}
