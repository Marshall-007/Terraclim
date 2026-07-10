from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query

from ..deps import get_provider_dep, parse_as_of
from ..engine.scoring import band_for
from ..services import evaluate_block, blocks_geojson, kc_curves, load_blocks, stress_targets

router = APIRouter(prefix="/api/blocks", tags=["blocks"])


def _find_block(block_id: str):
    for b in load_blocks():
        if b.id == block_id:
            return b
    raise HTTPException(status_code=404, detail=f"block '{block_id}' not found")


@router.get("")
def list_blocks():
    return blocks_geojson()


@router.get("/{block_id}/status")
def block_status(block_id: str, as_of: date = Depends(parse_as_of), provider=Depends(get_provider_dep)):
    block = _find_block(block_id)
    ev = evaluate_block(block, as_of, provider, stress_targets(), kc_curves())
    return ev.response


@router.get("/{block_id}/timeseries")
def block_timeseries(
    block_id: str,
    days: int = Query(default=45, gt=0, le=200),
    as_of: date = Depends(parse_as_of),
    provider=Depends(get_provider_dep),
):
    block = _find_block(block_id)
    targets = stress_targets()
    ev = evaluate_block(block, as_of, provider, targets, kc_curves())

    history = []
    for bd in ev.balance[-days:]:
        lo, hi = band_for(targets, bd.stage, block.wine_style)
        history.append(
            {
                "date": bd.date.isoformat(),
                "et0": bd.et0,
                "etc": bd.etc,
                "rain": bd.rain,
                "irrigation_mm": bd.irrigation_mm,
                "depletion_fraction": bd.depletion_fraction,
                "band_lo": lo,
                "band_hi": hi,
                "stage": bd.stage,
            }
        )

    forecast = [
        {
            "date": e["date"],
            "et0": e["et0"],
            "etc": e["etc"],
            "rain": e["rain"],
            "depletion_fraction_projected": e["depletion_fraction_projected"],
            "band_lo": e["band_lo"],
            "band_hi": e["band_hi"],
        }
        for e in ev.forecast
    ]
    return {"block_id": block.id, "history": history, "forecast": forecast}
