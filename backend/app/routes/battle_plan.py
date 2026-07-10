from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends

from ..deps import get_provider_dep, parse_as_of
from ..engine.battle_plan import build_plan
from ..schemas import BattlePlanRequest
from ..services import evaluate_all

router = APIRouter(prefix="/api", tags=["battle-plan"])


@router.post("/battle-plan")
def battle_plan(
    body: BattlePlanRequest,
    as_of: date = Depends(parse_as_of),
    provider=Depends(get_provider_dep),
):
    evaluations = evaluate_all(as_of, provider)
    return build_plan(evaluations, body.available_hours_per_day, body.horizon_days, as_of)
