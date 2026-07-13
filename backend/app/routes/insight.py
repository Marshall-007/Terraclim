"""Generic "explain anything" API: the single endpoint the frontend calls whenever
a user clicks a number, badge, or chart point to ask what it means and why.

All subject-specific copy lives in app.engine.insight; this module just wires the
request/response and maps the engine's validation errors onto HTTP status codes.
"""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException

from ..deps import get_provider_dep, parse_as_of
from ..engine import ai_rephrase
from ..engine import insight as insight_engine
from ..schemas import InsightRequest

router = APIRouter(prefix="/api/insight", tags=["insight"])


@router.get("/glossary")
def glossary():
    """Full glossary of domain terms (MSWP, TAW, GDD, ...) referenced across the
    insight copy, for a frontend glossary panel or inline tooltips."""
    return insight_engine.load_glossary()


@router.post("")
def insight(
    body: InsightRequest,
    as_of: date = Depends(parse_as_of),
    provider=Depends(get_provider_dep),
):
    """Build a deterministic, fact-grounded explanation for any subject_type (block
    status, score, driver, glide path, pour slip, battle-plan entry/skip, season
    bank, backtest event, scenario delta, photo analysis, or glossary term), then
    optionally run it through the AI rephraser. Unknown subject_type or a malformed
    field maps to 422; a well-formed request for a subject that doesn't exist
    (unknown block, driver, event date, etc.) maps to 404."""
    # Server context wins over client extras: as_of/provider are never client-set.
    ctx = dict(body.context or {})
    ctx["as_of"] = as_of
    ctx["provider"] = provider
    try:
        payload = insight_engine.build_insight(body.subject_type, body.block_id, body.subject_id, ctx)
    except (insight_engine.UnknownSubjectType, insight_engine.InvalidRequest) as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except insight_engine.SubjectNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return ai_rephrase.maybe_rephrase(payload)
