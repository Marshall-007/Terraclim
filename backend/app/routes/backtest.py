from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query

from ..deps import get_provider_dep, parse_as_of
from ..engine.backtest import run_backtest
from ..services import irrigation_for_block, kc_curves, load_blocks, stress_targets

router = APIRouter(prefix="/api", tags=["backtest"])


@router.get("/backtest")
def backtest(
    months: int = Query(default=4, gt=0, le=12),
    as_of: date = Depends(parse_as_of),
    provider=Depends(get_provider_dep),
):
    return run_backtest(
        load_blocks(), provider, as_of, months, stress_targets(), kc_curves(), irrigation_for_block
    )
