from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Protocol, runtime_checkable


@dataclass
class DailyWeather:
    date: date
    et0: float          # mm — reference (FAO-56) evapotranspiration
    rain: float         # mm
    tmax: float         # °C
    tmin: float         # °C
    rh_mean: float | None = None    # %
    wind_max: float | None = None   # km/h
    solar: float | None = None      # MJ/m²
    eta: float | None = None        # mm — measured actual ET (data pack), when available
    ndvi: float | None = None       # Sentinel-2 canopy vigour, when available

    def to_dict(self) -> dict:
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
    name: str

    def get_daily(self, lat: float, lon: float, start: date, end: date) -> list[DailyWeather]: ...

    def get_forecast(self, lat: float, lon: float, days: int) -> list[DailyWeather]: ...


class ProviderError(RuntimeError):
    """Raised when a provider cannot satisfy a request (network, auth, upstream)."""
