from __future__ import annotations

from datetime import date

from .base import DailyWeather

# TerraClim drop-in adapter. It constructs cleanly so the app can wire it up at
# startup, but its endpoints are not implemented until the hackathon token and
# API details are confirmed on Day 0. `ready` stays False until then, so the
# factory keeps serving Open-Meteo and the app never breaks. Request shapes below
# are documented against the published TerraClim surface so implementation is a
# fill-in, not a redesign.


class TerraClimProvider:
    name = "terraclim"

    # Flip to True once get_daily/get_forecast are implemented against a live token.
    ready = False

    BASE_URL = "https://api.terraclim.example/api"  # confirmed on Day 0

    def __init__(self, token: str):
        self.token = token
        self._headers = {"Token": token, "Accept": "application/json"}

    def get_daily(self, lat: float, lon: float, start: date, end: date) -> list[DailyWeather]:
        # POST {BASE_URL}/point/
        #   headers: {"Token": <token>}
        #   json: {
        #       "lat": lat, "lon": lon,
        #       "start": start.isoformat(), "end": end.isoformat(),
        #       "vars": ["et0", "precip", "tmax", "tmin", "rh", "wind", "solar"],
        #   }
        # Response rows map onto DailyWeather one-to-one.
        raise NotImplementedError(
            "TerraClimProvider.get_daily is stubbed pending the Day-0 token and "
            "endpoint confirmation; the factory serves Open-Meteo until `ready` is True."
        )

    def get_forecast(self, lat: float, lon: float, days: int) -> list[DailyWeather]:
        # GET {BASE_URL}/nearest-station?lat=&lon= to resolve the station, then
        # POST {BASE_URL}/polygon/ or /point/ with a forward horizon of `days`.
        raise NotImplementedError(
            "TerraClimProvider.get_forecast is stubbed pending the Day-0 token and "
            "endpoint confirmation; the factory serves Open-Meteo until `ready` is True."
        )
