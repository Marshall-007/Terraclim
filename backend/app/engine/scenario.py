from __future__ import annotations

from dataclasses import replace

from ..providers.base import DailyWeather

# Human-readable perturbation summaries, kept next to the math they describe so
# the scenario route and the insight engine can never drift apart.
PERTURBATION_STORY = {
    "heatwave": "the next {days} days made 6 °C hotter with 30% more drying power (ET0 +30%)",
    "drought": "all rain removed from the next {days} days",
    "rain_event": "an extra 25 mm of rain landed over the first two days",
    "cool_spell": "the next {days} days made 5 °C cooler with 20% less drying power (ET0 −20%)",
}


def perturb_forward(forward: list[DailyWeather], kind: str, days: int) -> list[DailyWeather]:
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
