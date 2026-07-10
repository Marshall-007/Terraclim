from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date
from functools import lru_cache


def _get_date(name: str, default: str) -> date:
    raw = os.getenv(name, default).strip()
    try:
        return date.fromisoformat(raw)
    except ValueError:
        return date.fromisoformat(default)


@dataclass(frozen=True)
class Settings:
    demo_date: date
    terraclim_token: str
    ai_key: str
    cache_ttl_hours: float
    port: int
    force_fixture: bool


@lru_cache
def get_settings() -> Settings:
    return Settings(
        demo_date=_get_date("DEMO_DATE", "2026-01-20"),
        terraclim_token=os.getenv("TERRACLIM_TOKEN", "").strip(),
        ai_key=os.getenv("AI_KEY", "").strip(),
        cache_ttl_hours=float(os.getenv("CACHE_TTL_HOURS", "6")),
        port=int(os.getenv("PORT", "8000")),
        # Tests set VINO_FORCE_FIXTURE=1 to guarantee no network is touched.
        force_fixture=os.getenv("VINO_FORCE_FIXTURE", "").strip() in {"1", "true", "True"},
    )
