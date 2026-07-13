"""MSWP field-validation API: lets growers log real pressure-bomb readings and
compares them against the engine's modelled MSWP-equivalent series, reporting
bias/RMSE and how often the model's target band actually bracketed reality.
"""
from __future__ import annotations

import math
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from ..deps import get_provider_dep, parse_as_of
from ..engine import mswp as mswp_engine
from ..engine.scoring import band_for
from ..providers.datapack import DataPackProvider
from ..schemas import ValidationReading
from ..services import (
    append_validation_reading,
    evaluate_block,
    kc_curves,
    load_blocks,
    mswp_map,
    stress_targets,
    validation_for_block,
)

router = APIRouter(prefix="/api/validation", tags=["validation"])


def _find_block(block_id: str):
    """Fetch a block by id or raise 404."""
    block = next((b for b in load_blocks() if b.id == block_id), None)
    if block is None:
        raise HTTPException(status_code=404, detail=f"block '{block_id}' not found")
    return block


def _model_mswp_on(block, on: date, provider) -> float | None:
    """The model's MSWP-equivalent for the block as of a given day."""
    ev = evaluate_block(block, on, provider, stress_targets(), kc_curves())
    return ev.response["mswp_estimate_mpa"]


def _model_series(block, as_of: date, provider) -> list[dict]:
    """Day-by-day modelled MSWP (and its target band) across the block's whole
    balance history, keyed for lookup by date against logged field readings."""
    ev = evaluate_block(block, as_of, provider, stress_targets(), kc_curves())
    mmap = mswp_map()
    series = []
    for bd in ev.balance:
        lo, hi = band_for(stress_targets(), bd.stage, block.wine_style)
        series.append(
            {
                "date": bd.date.isoformat(),
                "depletion_fraction": bd.depletion_fraction,
                "mswp_mpa": mswp_engine.estimate_mpa(mmap, bd.stage, bd.depletion_fraction),
                "mswp_band_mpa": mswp_engine.band_mpa(mmap, bd.stage, lo, hi),
                "stage": bd.stage,
            }
        )
    return series


def _reference_series(block) -> tuple[list[dict], str]:
    """WaPOR/FruitLook reference from the data pack when the pack ships one; else an
    empty series flagged pending_datapack (the sample pack carries no MSWP reference)."""
    pack = DataPackProvider()
    ref_map = pack.manifest.get("mswp_reference") if pack.loaded else None
    if not ref_map:
        return [], "pending_datapack"
    entry = ref_map.get(block.id)
    return (entry or []), ("datapack" if entry else "pending_datapack")


@router.post("/reading")
def log_reading(
    body: ValidationReading,
    as_of: date = Depends(parse_as_of),
    provider=Depends(get_provider_dep),
):
    """Log one field MSWP reading and immediately score it against the model's
    same-day estimate. Persists to app/data/validation_readings.json."""
    block = _find_block(body.block_id)
    model_mpa = _model_mswp_on(block, body.date, provider)
    delta = round(body.mswp_mpa - model_mpa, 2) if model_mpa is not None else None
    reading = {
        "block_id": block.id,
        "date": body.date.isoformat(),
        "mswp_mpa": body.mswp_mpa,
        "note": (body.note or "").strip()[:500] or None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    append_validation_reading(reading)
    return {"reading": reading, "model_mswp_mpa": model_mpa, "delta_mpa": delta}


@router.get("/{block_id}")
def validation_view(
    block_id: str,
    as_of: date = Depends(parse_as_of),
    provider=Depends(get_provider_dep),
):
    """Compare all logged field readings for a block against the model's series on
    the same dates: per-reading deltas plus aggregate bias, RMSE, and the percentage
    of readings that fell inside the model's target MPa band."""
    block = _find_block(block_id)
    model_series = _model_series(block, as_of, provider)
    by_date = {row["date"]: row for row in model_series}
    readings = validation_for_block(block_id)
    reference_series, reference_source = _reference_series(block)

    diffs = []
    within = 0
    for r in readings:
        m = by_date.get(r["date"])
        if not m:
            # Reading falls outside the block's current balance history (e.g. logged
            # before the season start or on a future/unevaluated date); skip rather
            # than compare against a nonexistent model value.
            continue
        diffs.append(r["mswp_mpa"] - m["mswp_mpa"])
        lo, hi = m["mswp_band_mpa"]
        if lo <= r["mswp_mpa"] <= hi:
            within += 1

    # Aggregate stats are None (not 0 or NaN) when no reading matched, since a
    # score of "0 bias" would misleadingly claim a perfect match rather than "no data".
    n = len(diffs)
    bias = round(sum(diffs) / n, 3) if n else None
    rmse = round(math.sqrt(sum(d * d for d in diffs) / n), 3) if n else None
    within_band_pct = round(within / n * 100.0, 1) if n else None

    return {
        "block_id": block_id,
        "model_series": model_series,
        "readings": readings,
        "reference_series": reference_series,
        "reference_source": reference_source,
        "agreement": {"bias": bias, "rmse": rmse, "n": n, "within_band_pct": within_band_pct},
    }
