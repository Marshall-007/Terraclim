from __future__ import annotations

import json
import logging
import math
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

from .engine import forecast as fc
from .engine import mswp as mswp_engine
from .engine import phenology as ph
from .engine import scoring
from .engine.water_balance import BalanceDay, compute_balance
from .providers.base import DailyWeather

log = logging.getLogger("vino.services")

DATA_DIR = Path(__file__).resolve().parent / "data"
FORWARD_DAYS = 14
HARVEST_GDD = 1600.0


@dataclass
class Block:
    id: str
    name: str
    variety: str
    wine_style: str
    area_ha: float
    application_rate_mm_h: float
    taw_mm: float
    lon: float
    lat: float
    geometry: dict

    @property
    def area_m2(self) -> float:
        return self.area_ha * 10_000.0


@dataclass
class Evaluation:
    block: Block
    as_of: date
    balance: list[BalanceDay]
    forecast: list[dict]
    response: dict


def _load_json(name: str):
    return json.loads((DATA_DIR / name).read_text())


def centroid(geometry: dict) -> tuple[float, float]:
    ring = geometry["coordinates"][0]
    pts = ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring
    lon = sum(p[0] for p in pts) / len(pts)
    lat = sum(p[1] for p in pts) / len(pts)
    return lon, lat


def _feature_to_block(feat: dict) -> Block:
    p = feat["properties"]
    lon, lat = centroid(feat["geometry"])
    return Block(
        id=p["id"], name=p["name"], variety=p["variety"],
        wine_style=p["wine_style"], area_ha=p["area_ha"],
        application_rate_mm_h=p["application_rate_mm_h"], taw_mm=p.get("taw_mm", 120),
        lon=lon, lat=lat, geometry=feat["geometry"],
    )


def load_blocks() -> list[Block]:
    features = blocks_geojson()["features"]
    return [_feature_to_block(feat) for feat in features]


def blocks_geojson() -> dict:
    """Demo fixture blocks plus any user-traced blocks, as one FeatureCollection."""
    fc_json = _load_json("blocks.geojson")
    features = list(fc_json["features"])
    features.extend(read_user_blocks()["features"])
    return {"type": "FeatureCollection", "features": features}


def kc_curves() -> dict:
    return _load_json("kc_curves.json")


def stress_targets() -> dict:
    return _load_json("stress_targets.json")


def mswp_map() -> dict:
    return _load_json("mswp_map.json")


def season_start(as_of: date) -> date:
    """1 September of the Southern-Hemisphere season containing as_of."""
    year = as_of.year if as_of.month >= 9 else as_of.year - 1
    return date(year, 9, 1)


# --- irrigation log -------------------------------------------------------

_LOG_PATH = DATA_DIR / "irrigation_log.json"


def read_irrigation_log() -> list[dict]:
    try:
        return json.loads(_LOG_PATH.read_text())
    except (ValueError, OSError):
        return []


def append_irrigation(event: dict) -> None:
    log_rows = read_irrigation_log()
    log_rows.append(event)
    _LOG_PATH.write_text(json.dumps(log_rows, indent=2))


def irrigation_for_block(block_id: str) -> dict[date, float]:
    out: dict[date, float] = {}
    for row in read_irrigation_log():
        if row.get("block_id") != block_id:
            continue
        try:
            d = date.fromisoformat(row["date"])
        except (ValueError, KeyError):
            continue
        out[d] = out.get(d, 0.0) + float(row.get("mm", 0.0))
    return out


# --- user-traced blocks ---------------------------------------------------

_USER_BLOCKS_PATH = DATA_DIR / "user_blocks.geojson"
EARTH_RADIUS_M = 6_371_000.0


def read_user_blocks() -> dict:
    try:
        fc_json = json.loads(_USER_BLOCKS_PATH.read_text())
        if fc_json.get("type") == "FeatureCollection" and isinstance(fc_json.get("features"), list):
            return fc_json
    except (ValueError, OSError):
        pass
    return {"type": "FeatureCollection", "features": []}


def write_user_blocks(fc_json: dict) -> None:
    _USER_BLOCKS_PATH.write_text(json.dumps(fc_json, indent=2))


def next_user_block_id() -> str:
    existing = {f["properties"].get("id", "") for f in read_user_blocks()["features"]}
    n = 1
    while f"U{n}" in existing:
        n += 1
    return f"U{n}"


def polygon_area_ha(geometry: dict) -> float:
    """Spherical-approximation planar area of a lon/lat polygon ring, in hectares.
    Equirectangular projection about the ring centroid — accurate at parcel scale."""
    ring = geometry["coordinates"][0]
    pts = ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring
    if len(pts) < 3:
        return 0.0
    lat0 = math.radians(sum(p[1] for p in pts) / len(pts))
    xy = [
        (math.radians(lon) * EARTH_RADIUS_M * math.cos(lat0),
         math.radians(lat) * EARTH_RADIUS_M)
        for lon, lat in pts
    ]
    area2 = 0.0
    for (x0, y0), (x1, y1) in zip(xy, xy[1:] + xy[:1]):
        area2 += x0 * y1 - x1 * y0
    return round(abs(area2) / 2.0 / 10_000.0, 2)


# --- validation readings --------------------------------------------------

_VALIDATION_PATH = DATA_DIR / "validation_readings.json"


def read_validation_readings() -> list[dict]:
    try:
        return json.loads(_VALIDATION_PATH.read_text())
    except (ValueError, OSError):
        return []


def append_validation_reading(reading: dict) -> None:
    rows = read_validation_readings()
    rows.append(reading)
    _VALIDATION_PATH.write_text(json.dumps(rows, indent=2))


def validation_for_block(block_id: str) -> list[dict]:
    return [r for r in read_validation_readings() if r.get("block_id") == block_id]


# --- field photos ---------------------------------------------------------

PHOTOS_DIR = DATA_DIR / "photos"
_PHOTO_INDEX = PHOTOS_DIR / "index.json"


def read_photo_index() -> list[dict]:
    try:
        return json.loads(_PHOTO_INDEX.read_text())
    except (ValueError, OSError):
        return []


def _write_photo_index(rows: list[dict]) -> None:
    PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
    _PHOTO_INDEX.write_text(json.dumps(rows, indent=2))


def store_photo(photo_id: str, jpeg_bytes: bytes, meta: dict) -> dict:
    """Persist the re-encoded JPEG under a server-generated id and index its
    metadata. The filename derives only from the id, never from user input."""
    PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{photo_id}.jpg"
    (PHOTOS_DIR / filename).write_bytes(jpeg_bytes)
    record = {**meta, "photo_id": photo_id, "filename": filename}
    rows = read_photo_index()
    rows.append(record)
    _write_photo_index(rows)
    return record


def photos_for_block(block_id: str) -> list[dict]:
    rows = [r for r in read_photo_index() if r.get("block_id") == block_id]
    rows.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    return rows


def photo_record(photo_id: str) -> dict | None:
    """Look up a photo strictly by id (no path is ever built from user input)."""
    for r in read_photo_index():
        if r.get("photo_id") == photo_id:
            return r
    return None


def photo_path(record: dict) -> Path:
    return PHOTOS_DIR / record["filename"]


# --- weather orchestration ------------------------------------------------

def forward_weather(provider, lat: float, lon: float, as_of: date, days: int) -> list[DailyWeather]:
    """Weather for the `days` following as_of. Uses archive when the window is in
    the past (the demo case), forecast when it is in the future, or a blend when
    it straddles today. The resilient provider substitutes synthetic data on error."""
    start = as_of + timedelta(days=1)
    end = as_of + timedelta(days=days)
    today = date.today()
    if end <= today:
        return provider.get_daily(lat, lon, start, end)
    if start > today:
        return provider.get_forecast(lat, lon, days)
    hist = provider.get_daily(lat, lon, start, today)
    remaining = (end - today).days
    fut = provider.get_forecast(lat, lon, remaining) if remaining > 0 else []
    return hist + fut


# --- core evaluation ------------------------------------------------------

def evaluate_block(
    block: Block,
    as_of: date,
    provider,
    targets: dict,
    kc: dict,
    forward_days: int = FORWARD_DAYS,
    extra_irrigation: dict[date, float] | None = None,
    forward_override: list[DailyWeather] | None = None,
) -> Evaluation:
    factor = ph.variety_factor(block.variety)
    ss = season_start(as_of)

    history = provider.get_daily(block.lat, block.lon, ss, as_of)
    phen = ph.build_phenology(history, factor)
    cum_gdd = phen[-1][1] if phen else 0.0
    harvest_onset = next((d for d, gdd, _ in phen if gdd >= HARVEST_GDD * factor), None)

    irr = irrigation_for_block(block.id)
    if extra_irrigation:
        for d, mm in extra_irrigation.items():
            irr[d] = irr.get(d, 0.0) + mm

    balance = compute_balance(history, phen, kc, block.taw_mm, irr)
    last = balance[-1]
    stage = last.stage
    depletion_mm = last.depletion_mm
    f = last.depletion_fraction

    lo, hi = scoring.band_for(targets, stage, block.wine_style)
    deviation, status = scoring.deviation_status(f, lo, hi)

    forward = forward_override if forward_override is not None else forward_weather(
        provider, block.lat, block.lon, as_of, forward_days
    )
    forecast = fc.project_forward(
        depletion_mm, cum_gdd, harvest_onset, forward, factor, kc, block.taw_mm, targets, block.wine_style
    )
    dev7 = fc.projected_deviation(forecast, 7)
    score = scoring.score_value(deviation, dev7)
    traffic = scoring.traffic_for(score)

    last7 = history[-7:] if len(history) >= 7 else history
    et0_7d = sum(w.et0 for w in last7) / len(last7) if last7 else 0.0
    rain_7d = sum(w.rain for w in last7)
    tmax_7d = sum(w.tmax for w in last7) / len(last7) if last7 else 0.0
    forecast_rain_3d = sum(e["rain"] for e in forecast[:3])
    drivers = scoring.build_drivers(et0_7d, rain_7d, tmax_7d, forecast_rain_3d)
    drivers.extend(scoring.build_measured_drivers(*_measured_channels(balance)))

    hold_days = fc.hold_days_from_forecast(forecast, lo) if status == "too_wet" else None
    pour_slip = scoring.build_pour_slip(
        status, depletion_mm, block.taw_mm, lo, hi, block.application_rate_mm_h, as_of, hold_days
    )
    rec = scoring.recommendation(status, stage, pour_slip, deviation)

    mmap = mswp_map()
    response = {
        "block_id": block.id,
        "as_of": as_of.isoformat(),
        "stage": stage,
        "gdd": round(cum_gdd, 1),
        "depletion_mm": depletion_mm,
        "depletion_fraction": f,
        "target_band": [lo, hi],
        "status": status,
        "deviation": round(deviation, 3),
        "score": score,
        "traffic": traffic,
        "mswp_estimate_mpa": mswp_engine.estimate_mpa(mmap, stage, f),
        "mswp_band_mpa": mswp_engine.band_mpa(mmap, stage, lo, hi),
        "drivers": drivers,
        "recommendation": rec,
        "pour_slip": pour_slip,
    }
    return Evaluation(block=block, as_of=as_of, balance=balance, forecast=forecast, response=response)


def _measured_channels(balance: list[BalanceDay]):
    """(eta_7d, ndvi, transpiration_deficit_pct) from the trailing week, or Nones
    when the source carries no ETa/NDVI so the drivers are simply omitted."""
    last7 = [bd for bd in balance[-7:] if bd.eta is not None]
    if not last7:
        latest_ndvi = next((bd.ndvi for bd in reversed(balance) if bd.ndvi is not None), None)
        return None, latest_ndvi, None
    eta_7d = sum(bd.eta for bd in last7) / len(last7)
    # Transpiration deficit: measured ETa below the unstressed crop demand (ET0 x Kc).
    # Positive = vines throttling below potential; the first-class stress signal (R12).
    pot_sum = sum(bd.etc_potential for bd in last7)
    eta_sum = sum(bd.eta for bd in last7)
    deficit_pct = (pot_sum - eta_sum) / pot_sum * 100.0 if pot_sum > 0 else 0.0
    latest_ndvi = next((bd.ndvi for bd in reversed(balance) if bd.ndvi is not None), None)
    return eta_7d, latest_ndvi, deficit_pct


def evaluate_all(as_of: date, provider, targets=None, kc=None) -> list[Evaluation]:
    targets = targets or stress_targets()
    kc = kc or kc_curves()
    return [evaluate_block(b, as_of, provider, targets, kc) for b in load_blocks()]
