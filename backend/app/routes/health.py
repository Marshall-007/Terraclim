"""Liveness/readiness endpoint for ops and the frontend's connection banner."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends

from ..config import get_settings
from ..deps import get_provider_dep, parse_as_of
from ..providers.cache import DiskCache

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
def health(as_of: date = Depends(parse_as_of), provider=Depends(get_provider_dep)):
    """Reports which weather provider is actually serving data (not just configured),
    TerraClim/data-pack readiness, and disk-cache freshness, so the frontend can warn
    the grower when the app has silently fallen back to synthetic data."""
    settings = get_settings()
    cache_age = DiskCache(settings.cache_ttl_hours).newest_age_minutes()
    return {
        "status": "ok",
        "provider": provider.name,
        "terraclim_ready": provider.terraclim_ready,
        "datapack_loaded": getattr(provider, "datapack_loaded", False),
        "as_of": as_of.isoformat(),
        "cache_age_minutes": cache_age,
    }
