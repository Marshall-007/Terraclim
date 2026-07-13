"""Backtest API: replays the engine's own scoring over a historical window to show
how it would have flagged real stress events, using only data that would have been
knowable on each past day (see app/engine/backtest.py for the "information-limited"
replay methodology).
"""
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
    """Replay the last `months` of scoring and heat-spike events up to as_of, capped
    at a year so the per-day recompute across every block stays responsive."""
    return run_backtest(
        load_blocks(), provider, as_of, months, stress_targets(), kc_curves(), irrigation_for_block
    )
