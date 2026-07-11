from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query

from ..deps import get_provider_dep, parse_as_of
from ..engine.season_bank import compute_bank
from ..services import kc_curves, season_bank_inputs

router = APIRouter(prefix="/api", tags=["season-bank"])


@router.get("/season-bank")
def season_bank(
    remaining_m3: float = Query(default=12000.0, ge=0),
    as_of: date = Depends(parse_as_of),
    provider=Depends(get_provider_dep),
):
    return compute_bank(season_bank_inputs(as_of, provider), remaining_m3, as_of, kc_curves())
