"""Disk-backed response cache for weather providers.

Wraps any `ClimateProvider` (`CachedProvider`) so identical requests within
the TTL window are served from a flat-file JSON cache instead of re-hitting
the network, and treats old-enough historical archive requests as
permanently cacheable. Used by `factory.py` to wrap whichever provider is
selected.
"""

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
    """Flat-file JSON cache for provider responses, one file per cache key.

    Filenames are a SHA1 hash of the key (see `_path`) so arbitrary key
    strings (provider name, lat/lon, date range) never have to be
    filesystem-safe. Each entry is timestamped on write so `get` can enforce
    a TTL, or be told to treat the entry as permanent (`indefinite`) for data
    that is known never to change.
    """

    def __init__(self, ttl_hours: float, directory: Path = CACHE_DIR):
        self.ttl_seconds = ttl_hours * 3600
        self.directory = directory
        self.directory.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        # SHA1 into a flat filename: keys embed provider name / lat / lon / dates
        # and colons, which aren't safe or convenient as a filename directly.
        digest = hashlib.sha1(key.encode()).hexdigest()
        return self.directory / f"{digest}.json"

    def get(self, key: str, indefinite: bool = False) -> list[DailyWeather] | None:
        """Return cached rows for `key`, or None on a miss, corrupt file, or
        expired entry.

        `indefinite=True` skips the TTL check (see ARCHIVE_STABLE_AFTER_DAYS):
        used for archive requests old enough that the underlying data can
        never change.
        """
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
            # Cache writes are best-effort: a full disk or permissions issue should
            # degrade to "no caching," never break the request that produced the data.
            log.warning("cache write failed for %s: %s", key, exc)

    def newest_age_minutes(self) -> int | None:
        """Minutes since the most recently written cache entry, or None if the
        cache is empty. Surfaced on /health to show cache freshness."""
        files = list(self.directory.glob("*.json"))
        if not files:
            return None
        newest = max(f.stat().st_mtime for f in files)
        return int((time.time() - newest) / 60)

    def oldest_age_minutes(self) -> int | None:
        """Minutes since the least recently written cache entry. Surfaced in the
        settings panel's cache diagnostics."""
        files = list(self.directory.glob("*.json"))
        if not files:
            return None
        oldest = min(f.stat().st_mtime for f in files)
        return int((time.time() - oldest) / 60)

    def entries(self) -> int:
        """Number of cached response files on disk (settings panel diagnostics)."""
        return len(list(self.directory.glob("*.json")))

    def purge(self) -> int:
        """Delete every cache file; return how many were removed (settings
        panel "clear cache" action)."""
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
        # Lat/lon rounded to 4dp (~11 m): distinct requests for the same block
        # always collapse onto the same cache key even with tiny float jitter.
        key = f"{self.name}:{lat:.4f}:{lon:.4f}:{start.isoformat()}:{end.isoformat()}:daily"
        indefinite = end < date.today() - timedelta(days=ARCHIVE_STABLE_AFTER_DAYS)
        cached = self._cache.get(key, indefinite=indefinite)
        if cached is not None:
            return cached
        rows = self._provider.get_daily(lat, lon, start, end)
        self._cache.set(key, rows)
        return rows

    def get_forecast(self, lat: float, lon: float, days: int) -> list[DailyWeather]:
        # Keyed by today's date rather than a range: a forecast issued today is
        # only valid for today, so tomorrow's request naturally misses this entry.
        key = f"{self.name}:{lat:.4f}:{lon:.4f}:{date.today().isoformat()}:{days}:forecast"
        cached = self._cache.get(key)
        if cached is not None:
            return cached
        rows = self._provider.get_forecast(lat, lon, days)
        self._cache.set(key, rows)
        return rows
