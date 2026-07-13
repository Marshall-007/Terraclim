"""Season-bank API: the dam-water-vs-vineyard-demand ledger for the rest of the
season, projected day by day from each block's phenology and forward weather out
to its own harvest date (see app/engine/season_bank.py for the demand model).
"""
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
    """Project irrigation demand against `remaining_m3` of dam water still
    available, returning a burn-down curve and a sufficient/shortfall verdict for
    the rest of the season."""
    return compute_bank(season_bank_inputs(as_of, provider), remaining_m3, as_of, kc_curves())
