from __future__ import annotations

from datetime import date, timedelta

# Score scaling: a deviation of 0.35 in depletion fraction saturates a component at 100.
DEVIATION_FULL_SCALE = 0.35
FORECAST_WEIGHT = 0.3
NOW_WEIGHT = 0.7


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
    return min(100.0, abs(deviation) / DEVIATION_FULL_SCALE * 100.0)


def score_value(deviation_now: float, deviation_forecast: float) -> int:
    now = _component(deviation_now)
    fut = _component(deviation_forecast)
    return int(min(100, round(NOW_WEIGHT * now + FORECAST_WEIGHT * fut)))


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
    return {
        "type": "pour",
        "needed_mm": round(needed, 1),
        "runtime_hours": runtime,
        "window": "tonight",
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
    return (
        f"Apply {round(needed)} mm ({pour_slip['runtime_hours']} h drip) tonight "
        f"to return to the {stage} glide path."
    )
