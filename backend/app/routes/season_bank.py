from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query

from ..deps import get_provider_dep, parse_as_of
from ..engine.phenology import build_phenology, variety_factor
from ..engine.season_bank import HARVEST_GDD, compute_bank
from ..services import forward_weather, kc_curves, load_blocks, season_start

router = APIRouter(prefix="/api", tags=["season-bank"])


@router.get("/season-bank")
def season_bank(
    remaining_m3: float = Query(default=12000.0, ge=0),
    as_of: date = Depends(parse_as_of),
    provider=Depends(get_provider_dep),
):
    kc = kc_curves()
    ss = season_start(as_of)
    block_inputs = []
    for block in load_blocks():
        factor = variety_factor(block.variety)
        history = provider.get_daily(block.lat, block.lon, ss, as_of)
        phen = build_phenology(history, factor)
        cum_gdd = phen[-1][1] if phen else 0.0
        harvest_onset = next((d for d, gdd, _ in phen if gdd >= HARVEST_GDD * factor), None)
        forward = forward_weather(provider, block.lat, block.lon, as_of, 14)
        block_inputs.append(
            {
                "block": block,
                "factor": factor,
                "cum_gdd": cum_gdd,
                "harvest_onset": harvest_onset,
                "forward": forward,
            }
        )
    return compute_bank(block_inputs, remaining_m3, as_of, kc)
