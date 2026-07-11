from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date
from functools import lru_cache

from . import settings_store


def _parse_date(raw: str, default: str) -> date:
    try:
        return date.fromisoformat(raw.strip())
    except ValueError:
        return date.fromisoformat(default)


@dataclass(frozen=True)
class Settings:
    demo_date: date
    terraclim_token: str
    ai_key: str
    ai_base_url: str
    ai_model: str
    cache_ttl_hours: float
    port: int
    force_fixture: bool
    provider: str  # "" = auto (datapack -> terraclim -> open-meteo); else forced choice


@lru_cache
def get_settings() -> Settings:
    """.env defaults, overlaid with the runtime Settings panel store (settings.json).
    The store may hold provider / token / demo_date chosen live at the venue."""
    overrides = settings_store.load()
    demo_default = "2026-01-20"
    demo_raw = str(overrides.get("demo_date") or os.getenv("DEMO_DATE", demo_default))
    token = str(overrides.get("terraclim_token") or os.getenv("TERRACLIM_TOKEN", "")).strip()
    provider = str(overrides.get("provider") or os.getenv("VINO_PROVIDER", "")).strip()
    if provider in {"auto", "default"}:
        provider = ""
    return Settings(
        demo_date=_parse_date(demo_raw, demo_default),
        terraclim_token=token,
        ai_key=os.getenv("AI_KEY", "").strip(),
        # OpenAI-compatible endpoint so any provider works; only the base varies.
        ai_base_url=os.getenv("AI_BASE_URL", "https://api.openai.com").strip().rstrip("/"),
        ai_model=os.getenv("AI_MODEL", "gpt-4o-mini").strip(),
        cache_ttl_hours=float(os.getenv("CACHE_TTL_HOURS", "6")),
        port=int(os.getenv("PORT", "8000")),
        # Tests set VINO_FORCE_FIXTURE=1 to guarantee no network is touched.
        force_fixture=os.getenv("VINO_FORCE_FIXTURE", "").strip() in {"1", "true", "True"},
        provider=provider,
    )


def reload_settings() -> Settings:
    """Re-read env + store after a runtime change so it applies without a restart."""
    get_settings.cache_clear()
    return get_settings()
