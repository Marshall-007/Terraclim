from __future__ import annotations

import logging
from datetime import date, timedelta

import httpx

from .base import DailyWeather, ProviderError

log = logging.getLogger("vino.provider.open_meteo")

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
TIMEZONE = "Africa/Johannesburg"

DAILY_VARS = [
    "et0_fao_evapotranspiration",
    "precipitation_sum",
    "temperature_2m_max",
    "temperature_2m_min",
    "wind_speed_10m_max",
    "shortwave_radiation_sum",
    "relative_humidity_2m_mean",
]

_TIMEOUT = httpx.Timeout(12.0, connect=6.0)


def _num(value, fallback=0.0):
    return fallback if value is None else float(value)


def _parse_daily(payload: dict) -> list[DailyWeather]:
    daily = payload.get("daily")
    if not daily or "time" not in daily:
        raise ProviderError("Open-Meteo response missing daily block")

    times = daily["time"]
    et0 = daily.get("et0_fao_evapotranspiration", [])
    rain = daily.get("precipitation_sum", [])
    tmax = daily.get("temperature_2m_max", [])
    tmin = daily.get("temperature_2m_min", [])
    wind = daily.get("wind_speed_10m_max", [])
    solar = daily.get("shortwave_radiation_sum", [])
    rh = daily.get("relative_humidity_2m_mean", [])

    out: list[DailyWeather] = []
    for i, t in enumerate(times):
        d = date.fromisoformat(t)
        day_tmax = _num(tmax[i] if i < len(tmax) else None, 25.0)
        day_tmin = _num(tmin[i] if i < len(tmin) else None, day_tmax - 8.0)
        # ET0 can be null in the archive on sparse days; derive a temperature-based
        # floor rather than dropping the row so the balance stays continuous.
        raw_et0 = et0[i] if i < len(et0) else None
        day_et0 = _num(raw_et0, max(0.4, 0.2 * (day_tmax - 8.0)))
        out.append(
            DailyWeather(
                date=d,
                et0=round(day_et0, 2),
                rain=round(_num(rain[i] if i < len(rain) else None), 1),
                tmax=round(day_tmax, 1),
                tmin=round(day_tmin, 1),
                rh_mean=None if i >= len(rh) or rh[i] is None else round(float(rh[i]), 1),
                wind_max=None if i >= len(wind) or wind[i] is None else round(float(wind[i]), 1),
                solar=None if i >= len(solar) or solar[i] is None else round(float(solar[i]), 1),
            )
        )
    if not out:
        raise ProviderError("Open-Meteo returned an empty series")
    return out


class OpenMeteoProvider:
    name = "open-meteo"

    def get_daily(self, lat: float, lon: float, start: date, end: date) -> list[DailyWeather]:
        params = {
            "latitude": lat,
            "longitude": lon,
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "daily": ",".join(DAILY_VARS),
            "timezone": TIMEZONE,
        }
        return self._request(ARCHIVE_URL, params)

    def get_forecast(self, lat: float, lon: float, days: int) -> list[DailyWeather]:
        # Open-Meteo forecast starts today; request enough days and return the
        # future slice (tomorrow onward).
        params = {
            "latitude": lat,
            "longitude": lon,
            "daily": ",".join(DAILY_VARS),
            "timezone": TIMEZONE,
            "forecast_days": min(16, max(1, days + 1)),
        }
        series = self._request(FORECAST_URL, params)
        today = date.today()
        future = [d for d in series if d.date > today]
        return future[:days]

    def _request(self, url: str, params: dict) -> list[DailyWeather]:
        try:
            resp = httpx.get(url, params=params, timeout=_TIMEOUT)
            resp.raise_for_status()
            return _parse_daily(resp.json())
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            raise ProviderError(f"Open-Meteo request failed: {exc}") from exc
