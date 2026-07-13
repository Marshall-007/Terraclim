"""Provider-agnostic weather data contract.

Every climate data source (fixture, data pack, TerraClim, Open-Meteo) speaks
this shape, so the rest of the app never needs to know which provider is
active. Optional fields (rh_mean, wind_max, solar, eta, ndvi) are None when a
given provider doesn't supply that channel.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Protocol, runtime_checkable


@dataclass
class DailyWeather:
    """One day of weather/vigour data for one location."""
    date: date
    et0: float          # mm, reference (FAO-56) evapotranspiration
    rain: float         # mm
    tmax: float         # °C
    tmin: float         # °C
    rh_mean: float | None = None    # %
    wind_max: float | None = None   # km/h
    solar: float | None = None      # MJ/m²
    eta: float | None = None        # mm, measured actual ET (data pack), when available
    ndvi: float | None = None       # Sentinel-2 canopy vigour, when available

    def to_dict(self) -> dict:
        """JSON-safe representation (ISO date string), used by the response
        cache to serialize provider results to disk."""
        return {
            "date": self.date.isoformat(),
            "et0": self.et0,
            "rain": self.rain,
            "tmax": self.tmax,
            "tmin": self.tmin,
            "rh_mean": self.rh_mean,
            "wind_max": self.wind_max,
            "solar": self.solar,
            "eta": self.eta,
            "ndvi": self.ndvi,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "DailyWeather":
        """Inverse of to_dict; rebuilds a DailyWeather from a cached JSON row."""
        return cls(
            date=date.fromisoformat(d["date"]),
            et0=d["et0"],
            rain=d["rain"],
            tmax=d["tmax"],
            tmin=d["tmin"],
            rh_mean=d.get("rh_mean"),
            wind_max=d.get("wind_max"),
            solar=d.get("solar"),
            eta=d.get("eta"),
            ndvi=d.get("ndvi"),
        )


@runtime_checkable
class ClimateProvider(Protocol):
    """Structural interface every weather source implements: a name for
    diagnostics, a historical/backfill lookup, and a forward forecast lookup.
    `@runtime_checkable` lets callers `isinstance()`-check a provider instance
    against this Protocol without every provider inheriting from it."""

    name: str

    def get_daily(self, lat: float, lon: float, start: date, end: date) -> list[DailyWeather]: ...

    def get_forecast(self, lat: float, lon: float, days: int) -> list[DailyWeather]: ...


class ProviderError(RuntimeError):
    """Raised when a provider cannot satisfy a request (network, auth, upstream)."""
