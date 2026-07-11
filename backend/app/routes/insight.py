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
    return insight_engine.load_glossary()


@router.post("")
def insight(
    body: InsightRequest,
    as_of: date = Depends(parse_as_of),
    provider=Depends(get_provider_dep),
):
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
