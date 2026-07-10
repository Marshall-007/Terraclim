from __future__ import annotations

import hashlib
import math
from datetime import date, timedelta

from .base import DailyWeather

# Deterministic synthetic Cape winelands weather. Used for tests (no network) and
# as the resilience fallback when the live provider is unreachable. The model is a
# seasonal sinusoid (Southern Hemisphere: hot/dry January, cool/wet July) plus a
# reproducible per-day jitter, and one fixed heat spike so the backtest always has
# a real event to surface in the demo.

HEAT_SPIKE_DATE = date(2025, 12, 4)
HEAT_SPIKE_HALF_WIDTH_DAYS = 2


def _unit_noise(*parts: object) -> float:
    """Deterministic pseudo-random in [0, 1) from the given parts."""
    digest = hashlib.md5("|".join(str(p) for p in parts).encode()).hexdigest()
    return int(digest[:8], 16) / 0xFFFFFFFF


def _season_phase(d: date) -> float:
    """+1 at mid-January (peak summer), -1 at mid-July (peak winter)."""
    doy = d.timetuple().tm_yday
    return math.cos(2 * math.pi * (doy - 15) / 365.0)


def _heat_spike_bump(d: date) -> float:
    delta = abs((d - HEAT_SPIKE_DATE).days)
    if delta > HEAT_SPIKE_HALF_WIDTH_DAYS + 3:
        return 0.0
    return 9.0 * math.exp(-(delta ** 2) / (2 * (HEAT_SPIKE_HALF_WIDTH_DAYS ** 2) + 0.5))


def synthetic_daily(lat: float, lon: float, d: date) -> DailyWeather:
    phase = _season_phase(d)
    site = _unit_noise(round(lat, 3), round(lon, 3))
    jitter = _unit_noise(d.isoformat(), round(lat, 3)) - 0.5

    # Calibrated to Stellenbosch (Region III/IV): ~1200-1500 GDD by mid-January.
    spike = _heat_spike_bump(d)
    tmax = 24.0 + 6.5 * phase + 2.5 * jitter + spike
    diurnal = 9.0 + 2.5 * max(0.0, phase) + 1.5 * site
    tmin = tmax - diurnal
    tmean = (tmax + tmin) / 2

    # ET0 tracks temperature/season and surges during the heat spike (hot, dry air
    # drives evapotranspiration up — the mechanism the backtest is meant to catch).
    et0 = 3.4 + 2.9 * phase + 0.6 * jitter + 0.35 * spike
    et0 = max(0.4, et0)

    # Rain: rare and light in summer, frequent and heavier in winter.
    wet_bias = 0.5 - 0.42 * phase          # ~0.08 in summer, ~0.92 in winter
    roll = _unit_noise("rain", d.isoformat(), round(lat, 2))
    if roll < wet_bias:
        amount_roll = _unit_noise("amt", d.isoformat(), round(lon, 2))
        rain = round((2.0 + 22.0 * amount_roll) * (0.4 + 0.6 * wet_bias), 1)
    else:
        rain = 0.0

    rh = 55.0 - 12.0 * phase + 20.0 * (rain > 0) + 8.0 * site
    rh = max(20.0, min(98.0, rh))
    wind = 9.0 + 6.0 * _unit_noise("wind", d.isoformat()) + 3.0 * max(0.0, phase)
    solar = max(2.0, 12.0 + 10.0 * phase + 2.0 * jitter)

    # NDVI tracks canopy: high in summer full-leaf, low in winter dormancy.
    ndvi = 0.42 + 0.30 * max(0.0, phase) + 0.05 * (jitter + site - 0.5)
    ndvi = max(0.12, min(0.9, ndvi))

    # Measured actual ET (retrospective satellite/RF product). A partially-covered
    # vineyard transpires a fraction of ET0 scaled by canopy vigour; the heat spike
    # throttles the vines (stomatal closure), so ETa dips below the model — the
    # divergence the engine surfaces as a stress signal.
    canopy_frac = 0.34 + 0.55 * ndvi
    throttle = 1.0 - 0.06 * spike
    eta = et0 * canopy_frac * throttle
    eta = max(0.2, eta)

    return DailyWeather(
        date=d,
        et0=round(et0, 2),
        rain=rain,
        tmax=round(tmax, 1),
        tmin=round(tmin, 1),
        rh_mean=round(rh, 1),
        wind_max=round(wind, 1),
        solar=round(solar, 1),
        eta=round(eta, 2),
        ndvi=round(ndvi, 3),
    )


class FixtureProvider:
    name = "fixture"

    def get_daily(self, lat: float, lon: float, start: date, end: date) -> list[DailyWeather]:
        out: list[DailyWeather] = []
        d = start
        while d <= end:
            out.append(synthetic_daily(lat, lon, d))
            d += timedelta(days=1)
        return out

    def get_forecast(self, lat: float, lon: float, days: int) -> list[DailyWeather]:
        today = date.today()
        return [synthetic_daily(lat, lon, today + timedelta(days=i)) for i in range(1, days + 1)]
