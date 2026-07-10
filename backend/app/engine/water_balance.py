from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from ..providers.base import DailyWeather

SEED_FRACTION = 0.3  # depletion at 1 September = 0.3 x TAW

# FAO-56 soil-water stress. RAW = p x TAW is the readily-available water; below it
# the crop transpires unstressed (Ks=1), above it Ks scales ET down linearly.
P_DEPLETION = 0.45              # depletion fraction at stress onset (grapes-wine, FAO-56)
# Effective rainfall: light days evaporate before infiltrating; heavy days shed
# the excess as runoff/deep drainage past the root zone.
RAIN_MIN_MM = 2.0
INFILTRATION_CAP_MM = 40.0


def clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def kc_for(kc_curves: dict, stage: str) -> float:
    return kc_curves.get(stage, kc_curves.get("dormant", 0.15))


def stress_coefficient(depletion: float, taw: float, p: float = P_DEPLETION) -> float:
    """FAO-56 Ks: 1 while depletion <= RAW, then falls linearly to 0 at TAW."""
    raw = p * taw
    if depletion <= raw:
        return 1.0
    return clamp((taw - depletion) / (taw - raw), 0.0, 1.0)


def effective_rain(rain: float) -> float:
    """Rain that reaches the root zone: sub-threshold days evaporate, and daily
    infiltration is capped (excess runs off / drains past the roots)."""
    if rain < RAIN_MIN_MM:
        return 0.0
    return min(rain, INFILTRATION_CAP_MM)


@dataclass
class BalanceDay:
    date: date
    et0: float
    etc: float                       # modelled crop ET, adjusted for stress (ET0 x Kc x Ks)
    rain: float
    irrigation_mm: float
    depletion_mm: float
    depletion_fraction: float
    stage: str
    eta: float | None = None         # measured actual ET, when the source provides it
    ndvi: float | None = None


def compute_balance(
    weather: list[DailyWeather],
    phenology: list[tuple[date, float, str]],
    kc_curves: dict,
    taw: float,
    irrigation_by_date: dict[date, float] | None = None,
) -> list[BalanceDay]:
    """Daily root-zone water balance from the start of the series.

    D_t = clamp(D_{t-1} + ET - rain_eff - irrigation, 0, TAW), seeded at 0.3 x TAW.
    ET is the measured ETa when the day carries one, else the modelled ET0 x Kc x Ks.
    Ks uses the prior day's depletion so the stress feedback is causal. `weather` and
    `phenology` must be aligned day-for-day.
    """
    irrigation_by_date = irrigation_by_date or {}
    stage_by_date = {d: stage for d, _gdd, stage in phenology}

    depletion = SEED_FRACTION * taw
    out: list[BalanceDay] = []
    for w in weather:
        stage = stage_by_date.get(w.date, "dormant")
        kc = kc_for(kc_curves, stage)
        ks = stress_coefficient(depletion, taw)
        etc = w.et0 * kc * ks
        consumed = w.eta if w.eta is not None else etc
        irr = irrigation_by_date.get(w.date, 0.0)
        depletion = clamp(depletion + consumed - effective_rain(w.rain) - irr, 0.0, taw)
        out.append(
            BalanceDay(
                date=w.date,
                et0=round(w.et0, 2),
                etc=round(etc, 2),
                rain=round(w.rain, 1),
                irrigation_mm=round(irr, 1),
                depletion_mm=round(depletion, 1),
                depletion_fraction=round(depletion / taw, 3),
                stage=stage,
                eta=None if w.eta is None else round(w.eta, 2),
                ndvi=None if w.ndvi is None else round(w.ndvi, 3),
            )
        )
    return out
