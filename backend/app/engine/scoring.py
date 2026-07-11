from __future__ import annotations

import math
from datetime import date, timedelta

# Score scaling: a deviation of 0.35 in depletion fraction scores a component at 100.
DEVIATION_FULL_SCALE = 0.35
FORECAST_WEIGHT = 0.3
NOW_WEIGHT = 0.7
# Longest drip run that fits a single night; beyond it the slip window widens.
MAX_NIGHT_RUNTIME_H = 8.0


def _round_half_up(x: float) -> int:
    return int(math.floor(x + 0.5))


def band_for(targets: dict, stage: str, style: str) -> list[float]:
    stage_bands = targets.get(stage) or targets.get("dormant")
    band = stage_bands.get(style) or stage_bands.get("red")
    return [float(band[0]), float(band[1])]


def deviation_status(f: float, lo: float, hi: float) -> tuple[float, str]:
    if f > hi:
        return round(f - hi, 3), "too_dry"
    if f < lo:
        return round(f - lo, 3), "too_wet"
    return 0.0, "on_track"


def _component(deviation: float) -> float:
    # Uncapped: deviation / full-scale, in points. The single cap is applied once
    # to the blended score, per the contract's canonical formula.
    return abs(deviation) / DEVIATION_FULL_SCALE * 100.0


def score_value(deviation_now: float, deviation_forecast: float) -> int:
    deviation_component = _component(deviation_now)
    forecast_component = _component(deviation_forecast)
    blended = NOW_WEIGHT * deviation_component + FORECAST_WEIGHT * forecast_component
    return min(100, _round_half_up(blended))


def traffic_for(score: int) -> str:
    if score <= 25:
        return "stable"
    if score <= 50:
        return "watch"
    if score <= 75:
        return "high"
    return "critical"


def _pressure(value: float, high_at: float, medium_at: float, invert: bool = False) -> str:
    if invert:
        if value < high_at:
            return "high"
        if value < medium_at:
            return "medium"
        return "low"
    if value >= high_at:
        return "high"
    if value >= medium_at:
        return "medium"
    return "low"


def build_drivers(et0_7d: float, rain_7d: float, tmax_7d: float, forecast_rain_3d: float) -> list[dict]:
    return [
        {"key": "et0_7d", "label": "7-day ET0", "value": round(et0_7d, 1),
         "unit": "mm/day", "pressure": _pressure(et0_7d, 5.0, 3.5)},
        {"key": "rain_7d", "label": "7-day rainfall", "value": round(rain_7d, 1),
         "unit": "mm", "pressure": _pressure(rain_7d, 5.0, 15.0, invert=True)},
        {"key": "tmax_7d", "label": "7-day max temp", "value": round(tmax_7d, 1),
         "unit": "°C", "pressure": _pressure(tmax_7d, 30.0, 25.0)},
        {"key": "forecast_rain_3d", "label": "Rain next 3 days", "value": round(forecast_rain_3d, 1),
         "unit": "mm", "pressure": _pressure(forecast_rain_3d, 2.0, 10.0, invert=True)},
    ]


def build_measured_drivers(
    eta_7d: float | None,
    ndvi: float | None,
    transpiration_deficit_pct: float | None,
) -> list[dict]:
    """ETa/NDVI-derived drivers, appended only when the data source supplies them."""
    out: list[dict] = []
    if eta_7d is not None:
        out.append({"key": "eta_7d", "label": "7-day actual ET", "value": round(eta_7d, 1),
                    "unit": "mm/day", "pressure": _pressure(eta_7d, 5.0, 3.5)})
    if ndvi is not None:
        # Low vigour is the pressure signal, so invert the thresholds.
        out.append({"key": "ndvi", "label": "Canopy NDVI", "value": round(ndvi, 2),
                    "unit": "", "pressure": _pressure(ndvi, 0.45, 0.6, invert=True)})
    if transpiration_deficit_pct is not None:
        out.append({"key": "transpiration_deficit_pct", "label": "Transpiration below model",
                    "value": round(transpiration_deficit_pct, 1), "unit": "%",
                    "pressure": _pressure(transpiration_deficit_pct, 15.0, 8.0)})
    return out


def build_pour_slip(
    status: str,
    depletion_mm: float,
    taw: float,
    lo: float,
    hi: float,
    rate_mm_h: float,
    as_of: date,
    hold_days: int | None,
) -> dict:
    mid = (lo + hi) / 2
    next_check = (as_of + timedelta(days=3)).isoformat()

    if status == "too_wet":
        return {
            "type": "hold",
            "needed_mm": 0.0,
            "runtime_hours": 0.0,
            "window": "hold",
            "next_check": next_check,
            "hold_days": hold_days,
        }

    needed = max(0.0, depletion_mm - mid * taw)
    runtime = round(needed / rate_mm_h, 1) if rate_mm_h > 0 else 0.0
    # A drip set only fits one night up to ~8 h; longer runs split across two.
    window = "tonight" if runtime <= MAX_NIGHT_RUNTIME_H else "next two nights"
    return {
        "type": "pour",
        "needed_mm": round(needed, 1),
        "runtime_hours": runtime,
        "window": window,
        "next_check": next_check,
        "hold_days": None,
    }


def recommendation(
    status: str,
    stage: str,
    pour_slip: dict,
    deviation: float,
) -> str:
    if status == "too_wet":
        pct = abs(round(deviation * 100))
        days = pour_slip.get("hold_days")
        tail = f" Resume in ~{days} days once ETc restores the deficit." if days else ""
        return (
            f"Hold irrigation — depletion is {pct}% below the {stage} band; "
            f"watering now risks dilution and excess vigor.{tail}"
        )
    needed = pour_slip["needed_mm"]
    if needed <= 0.0:
        return f"On the {stage} glide path — no irrigation needed."
    timing = (
        "tonight" if pour_slip["window"] == "tonight" else "split over the next two nights"
    )
    return (
        f"Apply {round(needed)} mm ({pour_slip['runtime_hours']} h drip) {timing} "
        f"to return to the {stage} glide path."
    )
