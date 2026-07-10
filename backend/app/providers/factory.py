from __future__ import annotations

import logging
from datetime import date

from .base import DailyWeather
from .cache import CachedProvider, DiskCache
from .fixture import FixtureProvider
from .open_meteo import OpenMeteoProvider
from .terraclim import TerraClimProvider

log = logging.getLogger("vino.provider")


class ResilientProvider:
    """Serves a primary provider through the cache, falling back to deterministic
    synthetic weather when the primary is unreachable. Guarantees the demo never
    surfaces an error screen even if the network or a token is unavailable."""

    def __init__(self, primary_cached: CachedProvider, primary_name: str, terraclim_ready: bool):
        self._primary = primary_cached
        self._fallback = FixtureProvider()
        self.name = primary_name
        self.terraclim_ready = terraclim_ready
        self.using_fallback = False

    def get_daily(self, lat: float, lon: float, start: date, end: date) -> list[DailyWeather]:
        try:
            rows = self._primary.get_daily(lat, lon, start, end)
            self.using_fallback = False
            return rows
        except Exception as exc:  # deliberate catch-all: the demo must never error out
            log.warning("primary provider get_daily failed (%s); using synthetic fallback", exc)
            self.using_fallback = True
            return self._fallback.get_daily(lat, lon, start, end)

    def get_forecast(self, lat: float, lon: float, days: int) -> list[DailyWeather]:
        try:
            rows = self._primary.get_forecast(lat, lon, days)
            self.using_fallback = False
            return rows
        except Exception as exc:  # deliberate catch-all: the demo must never error out
            log.warning("primary provider get_forecast failed (%s); using synthetic fallback", exc)
            self.using_fallback = True
            return self._fallback.get_forecast(lat, lon, days)


def _select_primary(settings) -> tuple[object, str, bool]:
    """Return (primary_provider, primary_name, terraclim_ready)."""
    if settings.terraclim_token:
        terra = TerraClimProvider(settings.terraclim_token)
        if terra.ready:
            return terra, terra.name, True
        log.info("TERRACLIM_TOKEN present but provider not ready; staying on Open-Meteo")
        return OpenMeteoProvider(), OpenMeteoProvider.name, False
    return OpenMeteoProvider(), OpenMeteoProvider.name, False


def get_provider(settings) -> ResilientProvider:
    if settings.force_fixture:
        fixture = FixtureProvider()
        cache = DiskCache(settings.cache_ttl_hours)
        return ResilientProvider(CachedProvider(fixture, cache), fixture.name, False)

    primary, name, terra_ready = _select_primary(settings)
    cache = DiskCache(settings.cache_ttl_hours)
    return ResilientProvider(CachedProvider(primary, cache), name, terra_ready)
