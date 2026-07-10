from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from ..providers.base import DailyWeather

SEED_FRACTION = 0.3  # depletion at 1 September = 0.3 x TAW


def clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def kc_for(kc_curves: dict, stage: str) -> float:
    return kc_curves.get(stage, kc_curves.get("dormant", 0.15))


@dataclass
class BalanceDay:
    date: date
    et0: float
    etc: float
    rain: float
    irrigation_mm: float
    depletion_mm: float
    depletion_fraction: float
    stage: str


def compute_balance(
    weather: list[DailyWeather],
    phenology: list[tuple[date, float, str]],
    kc_curves: dict,
    taw: float,
    irrigation_by_date: dict[date, float] | None = None,
) -> list[BalanceDay]:
    """Daily root-zone water balance from the start of the series.

    D_t = clamp(D_{t-1} + ETc - rain - irrigation, 0, TAW), seeded at 0.3 x TAW.
    `weather` and `phenology` must be aligned day-for-day.
    """
    irrigation_by_date = irrigation_by_date or {}
    stage_by_date = {d: stage for d, _gdd, stage in phenology}

    depletion = SEED_FRACTION * taw
    out: list[BalanceDay] = []
    for w in weather:
        stage = stage_by_date.get(w.date, "dormant")
        kc = kc_for(kc_curves, stage)
        etc = w.et0 * kc
        irr = irrigation_by_date.get(w.date, 0.0)
        depletion = clamp(depletion + etc - w.rain - irr, 0.0, taw)
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
            )
        )
    return out
