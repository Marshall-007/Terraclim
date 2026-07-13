"""What-if scenario API: perturbs the forward weather forecast (heatwave, drought,
rain event, or cool spell) and re-scores every block against the perturbed
forecast, so growers can see which blocks are most exposed before an event
actually arrives (see app/engine/scenario.py for the perturbation math).
"""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends

from ..deps import get_provider_dep, parse_as_of
from ..engine.scenario import perturb_forward
from ..schemas import ScenarioRequest
from ..services import (
    FORWARD_DAYS,
    evaluate_block,
    forward_weather,
    kc_curves,
    load_blocks,
    stress_targets,
)

router = APIRouter(prefix="/api", tags=["scenario"])


@router.post("/scenario")
def scenario(
    body: ScenarioRequest,
    as_of: date = Depends(parse_as_of),
    provider=Depends(get_provider_dep),
):
    """Re-evaluate every block under a perturbed forecast and report each one's
    score delta against its real-forecast baseline, so the highest-delta blocks
    surface as the most exposed to the scenario."""
    targets = stress_targets()
    kc = kc_curves()
    results = []
    for block in load_blocks():
        baseline = evaluate_block(block, as_of, provider, targets, kc)
        forward = forward_weather(provider, block.lat, block.lon, as_of, FORWARD_DAYS)
        perturbed_forward = perturb_forward(forward, body.type, body.days)
        perturbed = evaluate_block(
            block, as_of, provider, targets, kc, forward_override=perturbed_forward
        )
        item = dict(perturbed.response)
        item["delta"] = perturbed.response["score"] - baseline.response["score"]
        results.append(item)
    return results
