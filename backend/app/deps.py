from __future__ import annotations

from datetime import date
from functools import lru_cache

from fastapi import HTTPException, Query

from .config import get_settings
from .providers.factory import ResilientProvider, get_provider


@lru_cache
def provider_singleton() -> ResilientProvider:
    return get_provider(get_settings())


def get_provider_dep() -> ResilientProvider:
    return provider_singleton()


def reset_provider() -> ResilientProvider:
    """Rebuild the provider after a runtime settings change (Settings panel)."""
    provider_singleton.cache_clear()
    return provider_singleton()


def parse_as_of(as_of: str | None = Query(default=None)) -> date:
    if not as_of:
        return get_settings().demo_date
    try:
        return date.fromisoformat(as_of)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"invalid as_of '{as_of}'; expected YYYY-MM-DD") from exc
