"""Runtime Settings-panel API: lets the demo operator switch weather providers,
rotate a TerraClim token, jump the app's simulated "today" (as_of), and inspect or
refresh the disk cache and data-pack status, all without restarting the server.
"""
from __future__ import annotations

import logging
from datetime import date, timedelta

from fastapi import APIRouter, Depends

from .. import settings_store
from ..config import get_settings, reload_settings
from ..deps import get_provider_dep, parse_as_of, reset_provider
from ..providers.cache import DiskCache
from ..providers.datapack import DataPackProvider
from ..providers.open_meteo import OpenMeteoProvider
from ..providers.terraclim import TerraClimProvider
from ..schemas import DemoDate, ProviderSwitch
from ..services import load_blocks, season_start

log = logging.getLogger("vino.settings")
router = APIRouter(prefix="/api/settings", tags=["settings"])


def _token_status(token: str) -> str:
    """Redact a token to its last 4 characters for display; the raw token is
    never echoed back to the client."""
    if not token:
        return "unset"
    return f"set (••••{token[-4:]})" if len(token) >= 4 else "set (••••)"


def _cache_stats(settings) -> dict:
    """Entry count and staleness of the on-disk weather cache, for the settings panel."""
    cache = DiskCache(settings.cache_ttl_hours)
    return {"entries": cache.entries(), "oldest_minutes": cache.oldest_age_minutes()}


def _datapack_info() -> dict:
    """Whether a curated data pack is present and, if so, a summary of its
    manifest (path, declared layers, whether it's the synthetic sample pack)."""
    pack = DataPackProvider()
    info = {"loaded": pack.loaded}
    if pack.loaded:
        info["path"] = str(pack.directory)
        info["layers"] = pack.manifest.get("layers", [])
        info["synthetic"] = bool(pack.manifest.get("synthetic", False))
    return info


@router.get("")
def read_settings(as_of: date = Depends(parse_as_of), provider=Depends(get_provider_dep)):
    """Current provider/token/cache/data-pack status, for the settings panel to render."""
    settings = get_settings()
    return {
        "provider": provider.name,
        "terraclim_ready": provider.terraclim_ready,
        "token_status": _token_status(settings.terraclim_token),
        "cache": _cache_stats(settings),
        "as_of": as_of.isoformat(),
        "datapack": _datapack_info(),
    }


def _live_test(provider_name: str, token: str, settings) -> tuple[bool, str | None]:
    """One live call to prove the chosen source works before we accept it. In
    forced-fixture mode (tests / offline demo) the synthetic source stands in, so
    the switch is verifiable without touching the network."""
    if settings.force_fixture:
        return True, None
    blocks = load_blocks()
    if not blocks:
        return False, "no blocks to test against"
    b = blocks[0]
    # Probe a short window ending 2 days before demo_date rather than "today": most
    # weather archives lag by a day or two, so testing right up to the edge could
    # read as a false failure even when the provider is healthy.
    end = settings.demo_date - timedelta(days=2)
    start = end - timedelta(days=3)
    try:
        if provider_name == "open-meteo":
            rows = OpenMeteoProvider().get_daily(b.lat, b.lon, start, end)
        elif provider_name == "terraclim":
            terra = TerraClimProvider(token)
            if not terra.ready:
                return False, "TerraClim adapter is not enabled in this build (pending Day-0 endpoints)"
            rows = terra.get_daily(b.lat, b.lon, start, end)
        elif provider_name == "datapack":
            pack = DataPackProvider()
            if not pack.loaded:
                return False, "no data pack loaded in app/data/datapack/"
            rows = pack.get_daily(b.lat, b.lon, season_start(settings.demo_date), settings.demo_date)
        else:
            return False, f"unknown provider '{provider_name}'"
        return (bool(rows), None if rows else "provider returned no data")
    except Exception as exc:  # surface the provider's own error for live debugging
        return False, str(exc)


@router.post("/provider")
def switch_provider(body: ProviderSwitch):
    """Switch the active weather provider after proving it works with a live call.
    On success, persists provider/token to the runtime settings store (disk),
    reloads Settings, and rebuilds the provider singleton so the new choice takes
    effect immediately for every subsequent request."""
    settings = get_settings()
    # A caller switching provider without rotating the key (e.g. just re-selecting
    # terraclim) omits `token`; fall back to whatever is already stored instead of
    # treating the switch as clearing it.
    token = (body.token or settings.terraclim_token or "").strip()
    ok, error = _live_test(body.provider, token, settings)
    if not ok:
        return {"ok": False, "error": error}

    updates = {"provider": body.provider}
    if body.token:
        updates["terraclim_token"] = body.token.strip()
    settings_store.save(updates)
    reload_settings()
    provider = reset_provider()
    new_settings = get_settings()
    return {
        "ok": True,
        "provider": provider.name,
        "terraclim_ready": provider.terraclim_ready,
        "token_status": _token_status(new_settings.terraclim_token),
    }


@router.post("/cache/refresh")
def refresh_cache(provider=Depends(get_provider_dep), as_of: date = Depends(parse_as_of)):
    """Purge the entire disk cache, then immediately re-fetch (and thereby re-cache)
    the current season's weather for every block, so a stale or corrupt cache never
    lingers into the next request. Reports per-block success so one provider hiccup
    doesn't fail the whole refresh."""
    settings = get_settings()
    removed = DiskCache(settings.cache_ttl_hours).purge()
    ss = season_start(as_of)
    results = []
    for b in load_blocks():
        try:
            rows = provider.get_daily(b.lat, b.lon, ss, as_of)
            results.append({"block_id": b.id, "ok": bool(rows),
                            "source": "fallback" if provider.using_fallback else provider.name})
        except Exception as exc:
            results.append({"block_id": b.id, "ok": False, "error": str(exc)})
    return {"ok": True, "purged": removed, "rewarmed": results}


@router.post("/demo-date")
def set_demo_date(body: DemoDate):
    """Move the app's simulated "today" (as_of) for the demo. Persisted to the
    runtime settings store so it survives a server restart."""
    settings_store.save({"demo_date": body.as_of.isoformat()})
    reload_settings()
    return {"ok": True, "as_of": body.as_of.isoformat()}
