from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from ..providers.base import DailyWeather
from .phenology import stage_after
from .water_balance import kc_for

HARVEST_GDD = 1600.0
PROJECTION_CAP_DAYS = 170

# Stage-mean climatology for the Cape winelands, used to extend the demand model
# past the forecast horizon (first 14 days use real/forecast weather).
STAGE_CLIMATE: dict[str, dict[str, float]] = {
    "dormant": {"et0": 1.6, "rain": 3.5, "tmean": 13.0},
    "budbreak": {"et0": 3.6, "rain": 2.6, "tmean": 16.0},
    "flowering": {"et0": 4.6, "rain": 1.6, "tmean": 18.5},
    "fruit_set": {"et0": 5.4, "rain": 1.1, "tmean": 20.5},
    "veraison": {"et0": 6.0, "rain": 0.8, "tmean": 22.5},
    "harvest": {"et0": 5.0, "rain": 1.2, "tmean": 21.0},
    "post_harvest": {"et0": 3.6, "rain": 1.9, "tmean": 17.5},
}


def _block_demand_series(inp: dict, as_of: date, kc: dict) -> list[tuple[date, float]]:
    """Daily irrigation demand (m³) to hold the block at its band midpoint, from the
    day after as_of until it reaches harvest. Forecast weather first, then climatology."""
    block = inp["block"]
    factor = inp["factor"]
    forward: list[DailyWeather] = inp["forward"]
    area_m2 = block.area_m2

    gdd = inp["cum_gdd"]
    onset = inp["harvest_onset"]
    series: list[tuple[date, float]] = []

    for day in range(1, PROJECTION_CAP_DAYS + 1):
        d = as_of + timedelta(days=day)
        days_since_harvest = (d - onset).days if onset else None
        stage = stage_after(gdd, factor, days_since_harvest)
        if stage in ("harvest", "post_harvest"):
            break  # demand is accounted only up to harvest

        if day <= len(forward):
            w = forward[day - 1]
            et0, rain, tmean = w.et0, w.rain, (w.tmax + w.tmin) / 2
        else:
            clim = STAGE_CLIMATE.get(stage, STAGE_CLIMATE["veraison"])
            et0, rain, tmean = clim["et0"], clim["rain"], clim["tmean"]

        etc = et0 * kc_for(kc, stage)
        demand_m3 = max(0.0, etc - rain) * area_m2 / 1000.0
        series.append((d, demand_m3))

        gdd += max(0.0, tmean - 10.0)
        if onset is None and gdd >= HARVEST_GDD * factor:
            onset = d

    return series


def compute_bank(block_inputs: list[dict], remaining_m3: float, as_of: date, kc: dict) -> dict:
    demand_by_date: dict[date, float] = defaultdict(float)
    white_demand = 0.0

    for inp in block_inputs:
        series = _block_demand_series(inp, as_of, kc)
        block_total = sum(dem for _, dem in series)
        if inp["block"].wine_style in ("white", "fresh_white"):
            white_demand += block_total
        for d, dem in series:
            demand_by_date[d] += dem

    dates = sorted(demand_by_date)
    projected_demand = sum(demand_by_date.values())

    burn_down: list[dict] = []
    cumulative = 0.0
    run_dry_date: date | None = None
    for d in dates:
        cumulative += demand_by_date[d]
        bank = remaining_m3 - cumulative
        if run_dry_date is None and cumulative > remaining_m3:
            run_dry_date = d
        burn_down.append(
            {
                "date": d.isoformat(),
                "bank_m3": round(bank),
                "demand_to_date_m3": round(cumulative),
            }
        )

    shortfall = max(0.0, projected_demand - remaining_m3)
    verdict = "shortfall" if shortfall > 0 else "sufficient"

    days_short = 0
    if run_dry_date is not None and dates:
        days_short = (dates[-1] - run_dry_date).days

    if verdict == "shortfall":
        savings = round(white_demand * 0.15)
        advice = (
            f"Projected {round(shortfall):,} m³ shortfall before harvest. "
            f"Tighten white blocks to the lower band edge to save ~{savings:,} m³."
        )
    else:
        advice = (
            f"Bank on track: projected demand {round(projected_demand):,} m³ "
            f"vs {round(remaining_m3):,} m³ available."
        )

    return {
        "as_of": as_of.isoformat(),
        "remaining_m3": round(remaining_m3),
        "projected_demand_m3": round(projected_demand),
        "verdict": verdict,
        "run_dry_date": run_dry_date.isoformat() if run_dry_date else None,
        "days_short": days_short,
        "burn_down": burn_down,
        "advice": advice,
    }
