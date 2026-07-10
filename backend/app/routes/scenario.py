from __future__ import annotations

from dataclasses import replace
from datetime import date

from fastapi import APIRouter, Depends

from ..deps import get_provider_dep, parse_as_of
from ..providers.base import DailyWeather
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


def _perturb(forward: list[DailyWeather], kind: str, days: int) -> list[DailyWeather]:
    out: list[DailyWeather] = []
    for i, w in enumerate(forward):
        w = replace(w)
        if i < days:
            if kind == "heatwave":
                w.tmax += 6.0
                w.tmin += 6.0
                w.et0 = round(w.et0 * 1.30, 2)
            elif kind == "drought":
                w.rain = 0.0
            elif kind == "rain_event" and i < 2:
                w.rain += 12.5
            elif kind == "cool_spell":
                w.tmax -= 5.0
                w.tmin -= 5.0
                w.et0 = round(w.et0 * 0.80, 2)
        out.append(w)
    return out


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
        perturbed_forward = _perturb(forward, body.type, body.days)
        perturbed = evaluate_block(
            block, as_of, provider, targets, kc, forward_override=perturbed_forward
        )
        item = dict(perturbed.response)
        item["delta"] = perturbed.response["score"] - baseline.response["score"]
        results.append(item)
    return results
