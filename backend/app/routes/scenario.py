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
