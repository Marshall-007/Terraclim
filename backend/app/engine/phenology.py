from __future__ import annotations

from datetime import date

from ..providers.base import DailyWeather

# GDD base 10 °C, accumulated from 1 September (Southern Hemisphere).
GDD_BASE = 10.0

# Stage entry thresholds in GDD, before the variety factor is applied.
STAGE_THRESHOLDS: list[tuple[str, float]] = [
    ("budbreak", 100.0),
    ("flowering", 400.0),
    ("fruit_set", 500.0),
    ("veraison", 1150.0),
    ("harvest", 1600.0),
]

POST_HARVEST_AFTER_DAYS = 30

VARIETY_FACTORS: dict[str, float] = {
    "Sauvignon Blanc": 0.90,
    "Chardonnay": 0.95,
    "Chenin Blanc": 1.00,
    "Merlot": 1.00,
    "Pinotage": 1.00,
    "Shiraz": 1.05,
    "Cabernet Sauvignon": 1.15,
}

STAGE_ORDER = ["dormant", "budbreak", "flowering", "fruit_set", "veraison", "harvest", "post_harvest"]


def variety_factor(variety: str) -> float:
    return VARIETY_FACTORS.get(variety, 1.0)


def gdd_increment(w: DailyWeather) -> float:
    return max(0.0, (w.tmax + w.tmin) / 2 - GDD_BASE)


def _base_stage(cum_gdd: float, factor: float) -> str:
    stage = "dormant"
    for name, threshold in STAGE_THRESHOLDS:
        if cum_gdd >= threshold * factor:
            stage = name
        else:
            break
    return stage


def build_phenology(weather: list[DailyWeather], factor: float) -> list[tuple[date, float, str]]:
    """Return per-day (date, cumulative_gdd, stage) from the start of the series.

    Weather must begin on 1 September of the season. Post-harvest is date-driven:
    30 days after the day the harvest GDD threshold is first reached.
    """
    cum = 0.0
    prelim: list[list] = []
    harvest_date: date | None = None
    for w in weather:
        cum += gdd_increment(w)
        stage = _base_stage(cum, factor)
        if stage == "harvest" and harvest_date is None:
            harvest_date = w.date
        prelim.append([w.date, cum, stage])

    result: list[tuple[date, float, str]] = []
    for d, c, stage in prelim:
        if harvest_date is not None and (d - harvest_date).days > POST_HARVEST_AFTER_DAYS:
            stage = "post_harvest"
        result.append((d, round(c, 1), stage))
    return result


def stage_after(cum_gdd: float, factor: float, days_since_harvest: int | None) -> str:
    """Stage for a projected day given cumulative GDD and days since harvest onset."""
    if days_since_harvest is not None and days_since_harvest > POST_HARVEST_AFTER_DAYS:
        return "post_harvest"
    return _base_stage(cum_gdd, factor)
