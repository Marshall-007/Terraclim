"""Provider selection: turns app settings into a single resilient weather source.

Chooses among the curated data pack, TerraClim, and Open-Meteo (see
`_select_primary`), wraps the choice in the disk cache, and wraps that in
`ResilientProvider` so every caller gets a `ClimateProvider`-shaped object
that degrades to synthetic data instead of raising.
"""

from __future__ import annotations

import logging
from datetime import date

from .base import DailyWeather
from .cache import CachedProvider, DiskCache
from .datapack import DataPackProvider
from .fixture import FixtureProvider
from .open_meteo import OpenMeteoProvider
from .terraclim import TerraClimProvider

log = logging.getLogger("vino.provider")


class ResilientProvider:
    """Serves a primary provider through the cache, falling back to deterministic
    synthetic weather when the primary is unreachable. Guarantees the demo never
    surfaces an error screen even if the network or a token is unavailable."""

    def __init__(self, primary_cached: CachedProvider, primary_name: str, terraclim_ready: bool,
                 datapack_loaded: bool = False):
        self._primary = primary_cached
        self._fallback = FixtureProvider()
        self.name = primary_name
        self.terraclim_ready = terraclim_ready
        self.datapack_loaded = datapack_loaded
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


def _select_primary(settings) -> tuple[object, str, bool, bool]:
    """Return (primary_provider, name, terraclim_ready, datapack_loaded).

    Preference order: the curated data pack (if loaded) -> TerraClim (if a token is
    present and the adapter is ready) -> Open-Meteo. `settings.provider` forces a
    specific choice when set (Settings panel); otherwise the order above applies.
    Either way `datapack_loaded` / `terraclim_ready` are reported for the header."""
    datapack = DataPackProvider()
    terra = TerraClimProvider(settings.terraclim_token) if settings.terraclim_token else None
    terra_ready = bool(terra and terra.ready)

    forced = getattr(settings, "provider", "") or ""
    if forced == "datapack" and datapack.loaded:
        return datapack, datapack.name, terra_ready, True
    if forced == "terraclim" and terra_ready:
        return terra, terra.name, True, datapack.loaded
    if forced == "open-meteo":
        return OpenMeteoProvider(), OpenMeteoProvider.name, terra_ready, datapack.loaded

    if datapack.loaded:
        return datapack, datapack.name, terra_ready, True
    if terra_ready:
        return terra, terra.name, True, datapack.loaded
    if terra is not None:
        log.info("TERRACLIM_TOKEN present but provider not ready; staying on Open-Meteo")
    return OpenMeteoProvider(), OpenMeteoProvider.name, terra_ready, datapack.loaded


def get_provider(settings) -> ResilientProvider:
    """Build the app's resilient weather provider for the current settings.

    `force_fixture` is a demo/test override: when set it always serves the
    deterministic synthetic fixture (bypassing normal provider selection) so
    behaviour is fully reproducible regardless of network or token state.
    """
    cache = DiskCache(settings.cache_ttl_hours)
    if settings.force_fixture:
        fixture = FixtureProvider()
        return ResilientProvider(CachedProvider(fixture, cache), fixture.name, False)

    primary, name, terra_ready, datapack_loaded = _select_primary(settings)
    return ResilientProvider(
        CachedProvider(primary, cache), name, terra_ready, datapack_loaded
    )
