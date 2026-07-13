"""Forward water-balance projection: "what happens if we do nothing."

Given today's depletion/GDD state and a forward weather series, rolls the
FAO-56 balance ahead with zero irrigation so the API can show a multi-day
forecast panel, derive the forward-looking half of the urgency score, and
(fed a perturbed weather series from `scenario.py`) answer "what if" questions.
"""

from __future__ import annotations

from datetime import date

from ..providers.base import DailyWeather
from .phenology import gdd_increment, stage_after
from .scoring import band_for, deviation_status
from .water_balance import clamp, effective_rain, kc_for, stress_coefficient

# Mirrors phenology.STAGE_THRESHOLDS's "harvest" entry (1600 GDD). Kept as a
# standalone constant to avoid importing the whole stage table for one number;
# if the harvest threshold ever changes there, it must change here too.
HARVEST_GDD = 1600.0
DEFAULT_HORIZON = 7  # look-ahead window, in days, for the forecast score component


def project_forward(
    depletion: float,
    cum_gdd: float,
    harvest_onset: date | None,
    forward_weather: list[DailyWeather],
    factor: float,
    kc_curves: dict,
    taw: float,
    targets: dict,
    style: str,
) -> list[dict]:
    """Roll the water balance forward with no irrigation, tracking stage drift.

    Starts from today's actual depletion/GDD and simulates each day of
    `forward_weather`, so the API can show how many days remain before the block
    drifts out of its target band if nothing is done. Returns per-day projected
    records shaped for the timeseries `forecast` array.
    """
    depletion_p = depletion
    gdd = cum_gdd
    onset = harvest_onset
    out: list[dict] = []
    for w in forward_weather:
        gdd += gdd_increment(w)
        if onset is None and gdd >= HARVEST_GDD * factor:
            onset = w.date
        days_since_harvest = (w.date - onset).days if onset else None
        stage = stage_after(gdd, factor, days_since_harvest)
        # Forecast is the modelled layer: ET0 x Kc x Ks (measured ETa is retrospective).
        ks = stress_coefficient(depletion_p, taw)
        etc = w.et0 * kc_for(kc_curves, stage) * ks
        depletion_p = clamp(depletion_p + etc - effective_rain(w.rain), 0.0, taw)
        lo, hi = band_for(targets, stage, style)
        out.append(
            {
                "date": w.date.isoformat(),
                "et0": round(w.et0, 2),
                "etc": round(etc, 2),
                "rain": round(w.rain, 1),
                "depletion_fraction_projected": round(depletion_p / taw, 3),
                "band_lo": lo,
                "band_hi": hi,
                "stage": stage,
            }
        )
    return out


def projected_deviation(forecast: list[dict], horizon: int = DEFAULT_HORIZON) -> float:
    """Signed band deviation at a single point `horizon` days out.

    Feeds the forward-looking half of the urgency score (see
    scoring.score_value): a block that is on-track today but drifting should
    still raise urgency before it is actually out of band.
    """
    if not forecast:
        return 0.0
    idx = min(horizon, len(forecast)) - 1
    entry = forecast[idx]
    dev, _ = deviation_status(
        entry["depletion_fraction_projected"], entry["band_lo"], entry["band_hi"]
    )
    return dev


def hold_days_from_forecast(forecast: list[dict], current_lo: float) -> int | None:
    """Days until projected depletion (no irrigation) climbs back to the band floor.

    Only meaningful when the block is currently too wet; tells the grower how
    long to hold irrigation before the next check-in.
    """
    for i, entry in enumerate(forecast, start=1):
        if entry["depletion_fraction_projected"] >= current_lo:
            return i
    return len(forecast) if forecast else None
