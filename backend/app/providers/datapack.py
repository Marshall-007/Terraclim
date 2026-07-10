from __future__ import annotations

import csv
import json
import logging
from datetime import date
from pathlib import Path

from .base import DailyWeather, ProviderError

log = logging.getLogger("vino.provider.datapack")

DATAPACK_DIR = Path(__file__).resolve().parent.parent / "data" / "datapack"
MANIFEST_NAME = "datapack.json"
MATCH_TOLERANCE_DEG = 0.003  # ~330 m: block centroid -> manifest block match

_NUM_FIELDS = {"et0", "rain", "tmax", "tmin", "eta", "ndvi", "rh_mean", "wind_max", "solar"}
# CSV column aliases so a range of pack shapes load without editing.
_ALIASES = {
    "precip": "rain", "precipitation": "rain", "precipitation_sum": "rain",
    "et0_fao": "et0", "eto": "et0", "et_ref": "et0",
    "et_a": "eta", "eta_mm": "eta", "actual_et": "eta",
    "tmax_c": "tmax", "tmin_c": "tmin",
}


def _num(value):
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


class DataPackProvider:
    """Third provider for the ET-GEO curated data pack: local CSV per-block series
    (no extra deps) and/or GeoTIFF rasters read via rasterio zonal statistics
    (imported lazily — rasterio is an optional dependency, the CSV path never needs
    it). Retrospective by design: no forecast. Missing pack -> not loaded, and the
    factory falls through to the next provider."""

    name = "datapack"

    def __init__(self, directory: Path = DATAPACK_DIR):
        self.directory = Path(directory)
        self.manifest: dict = {}
        self.loaded = False
        self._series: dict[tuple, list[DailyWeather]] = {}
        self._load_manifest()

    def _load_manifest(self) -> None:
        manifest_path = self.directory / MANIFEST_NAME
        if not manifest_path.exists():
            return
        try:
            self.manifest = json.loads(manifest_path.read_text())
        except (ValueError, OSError) as exc:
            log.warning("datapack manifest unreadable: %s", exc)
            return
        for entry in self.manifest.get("blocks", []):
            lat, lon = entry.get("lat"), entry.get("lon")
            csv_rel = entry.get("csv")
            if lat is None or lon is None or not csv_rel:
                continue
            rows = self._read_csv(self.directory / csv_rel)
            if rows:
                self._series[(round(float(lat), 4), round(float(lon), 4))] = rows
        self.loaded = bool(self._series) or bool(self.manifest.get("rasters"))

    def _read_csv(self, path: Path) -> list[DailyWeather]:
        try:
            text = path.read_text()
        except OSError:
            return []
        out: list[DailyWeather] = []
        for raw in csv.DictReader(text.splitlines()):
            row = {(_ALIASES.get(k.strip().lower(), k.strip().lower())): v for k, v in raw.items()}
            d = row.get("date")
            if not d:
                continue
            try:
                day = date.fromisoformat(d.strip())
            except ValueError:
                continue
            vals = {f: _num(row.get(f)) for f in _NUM_FIELDS}
            if vals["et0"] is None or vals["tmax"] is None or vals["tmin"] is None:
                continue
            out.append(
                DailyWeather(
                    date=day, et0=vals["et0"], rain=vals["rain"] or 0.0,
                    tmax=vals["tmax"], tmin=vals["tmin"],
                    rh_mean=vals["rh_mean"], wind_max=vals["wind_max"], solar=vals["solar"],
                    eta=vals["eta"], ndvi=vals["ndvi"],
                )
            )
        out.sort(key=lambda w: w.date)
        return out

    def _match(self, lat: float, lon: float) -> list[DailyWeather] | None:
        best, best_d = None, MATCH_TOLERANCE_DEG
        for (blat, blon), rows in self._series.items():
            dist = abs(blat - lat) + abs(blon - lon)
            if dist <= best_d:
                best, best_d = rows, dist
        if best is not None:
            return best
        if self.manifest.get("rasters"):
            return self._zonal_from_rasters(lat, lon)
        return None

    def _zonal_from_rasters(self, lat: float, lon: float) -> list[DailyWeather] | None:
        # GeoTIFF zonal statistics over the block polygon. rasterio is optional and
        # imported here so the CSV path works without it; documented in the README.
        try:
            import rasterio  # noqa: F401
        except ImportError:
            log.info("datapack rasters present but rasterio not installed; skipping raster path")
            return None
        raise ProviderError(
            "datapack raster zonal statistics require a live pack + rasterio; "
            "CSV series is the tested path in this build"
        )

    def get_daily(self, lat: float, lon: float, start: date, end: date) -> list[DailyWeather]:
        if not self.loaded:
            raise ProviderError("data pack not loaded")
        rows = self._match(lat, lon)
        if not rows:
            raise ProviderError(f"data pack has no series near ({lat:.4f}, {lon:.4f})")
        window = [w for w in rows if start <= w.date <= end]
        if not window:
            raise ProviderError("data pack series does not cover the requested range")
        # Incomplete tail (e.g. a forward window past the pack's last day): fall back
        # rather than serve a truncated balance.
        if window[-1].date < end:
            raise ProviderError("data pack does not cover the full requested range")
        return window

    def get_forecast(self, lat: float, lon: float, days: int) -> list[DailyWeather]:
        # The pack is retrospective (measured ET / vigour); forecasting is the
        # forward layer's job. Raising lets the resilient wrapper supply a forecast.
        raise ProviderError("data pack is retrospective; no forecast series")
