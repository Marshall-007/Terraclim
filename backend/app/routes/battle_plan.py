"""Battle-plan API: turns each block's current evaluation into a day-by-day
irrigation schedule that allocates a limited daily pump-hour budget to the blocks
that need it most (see app/engine/battle_plan.py for the ranking/allocation logic).
"""
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
    """Evaluate every block as of `as_of`, then greedily schedule the requested
    pump-hours per day over the horizon, prioritising the driest/highest-value
    blocks first (see build_plan for the ranking formula)."""
    evaluations = evaluate_all(as_of, provider)
    return build_plan(evaluations, body.available_hours_per_day, body.horizon_days, as_of)
