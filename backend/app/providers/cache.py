from __future__ import annotations

import hashlib
import json
import logging
import time
from datetime import date, timedelta
from pathlib import Path

from .base import DailyWeather

log = logging.getLogger("vino.cache")

CACHE_DIR = Path(__file__).resolve().parent.parent / "data" / "cache"
ARCHIVE_STABLE_AFTER_DAYS = 7  # archive older than this never changes -> cache forever


class DiskCache:
    def __init__(self, ttl_hours: float, directory: Path = CACHE_DIR):
        self.ttl_seconds = ttl_hours * 3600
        self.directory = directory
        self.directory.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        digest = hashlib.sha1(key.encode()).hexdigest()
        return self.directory / f"{digest}.json"

    def get(self, key: str, indefinite: bool = False) -> list[DailyWeather] | None:
        path = self._path(key)
        if not path.exists():
            return None
        try:
            payload = json.loads(path.read_text())
        except (ValueError, OSError):
            return None
        if not indefinite:
            age = time.time() - payload.get("stored_at", 0)
            if age > self.ttl_seconds:
                return None
        return [DailyWeather.from_dict(r) for r in payload.get("rows", [])]

    def set(self, key: str, rows: list[DailyWeather]) -> None:
        path = self._path(key)
        payload = {"stored_at": time.time(), "key": key, "rows": [r.to_dict() for r in rows]}
        try:
            path.write_text(json.dumps(payload))
        except OSError as exc:
            log.warning("cache write failed for %s: %s", key, exc)

    def newest_age_minutes(self) -> int | None:
        files = list(self.directory.glob("*.json"))
        if not files:
            return None
        newest = max(f.stat().st_mtime for f in files)
        return int((time.time() - newest) / 60)

    def oldest_age_minutes(self) -> int | None:
        files = list(self.directory.glob("*.json"))
        if not files:
            return None
        oldest = min(f.stat().st_mtime for f in files)
        return int((time.time() - oldest) / 60)

    def entries(self) -> int:
        return len(list(self.directory.glob("*.json")))

    def purge(self) -> int:
        removed = 0
        for f in self.directory.glob("*.json"):
            try:
                f.unlink()
                removed += 1
            except OSError:
                pass
        return removed


class CachedProvider:
    """Wraps a provider so every call flows through the disk cache."""

    def __init__(self, provider, cache: DiskCache):
        self._provider = provider
        self._cache = cache
        self.name = provider.name

    def get_daily(self, lat: float, lon: float, start: date, end: date) -> list[DailyWeather]:
        key = f"{self.name}:{lat:.4f}:{lon:.4f}:{start.isoformat()}:{end.isoformat()}:daily"
        indefinite = end < date.today() - timedelta(days=ARCHIVE_STABLE_AFTER_DAYS)
        cached = self._cache.get(key, indefinite=indefinite)
        if cached is not None:
            return cached
        rows = self._provider.get_daily(lat, lon, start, end)
        self._cache.set(key, rows)
        return rows

    def get_forecast(self, lat: float, lon: float, days: int) -> list[DailyWeather]:
        key = f"{self.name}:{lat:.4f}:{lon:.4f}:{date.today().isoformat()}:{days}:forecast"
        cached = self._cache.get(key)
        if cached is not None:
            return cached
        rows = self._provider.get_forecast(lat, lon, days)
        self._cache.set(key, rows)
        return rows
