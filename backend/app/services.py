from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

from .engine import forecast as fc
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


def load_blocks() -> list[Block]:
    fc_json = _load_json("blocks.geojson")
    blocks: list[Block] = []
    for feat in fc_json["features"]:
        p = feat["properties"]
        lon, lat = centroid(feat["geometry"])
        blocks.append(
            Block(
                id=p["id"], name=p["name"], variety=p["variety"],
                wine_style=p["wine_style"], area_ha=p["area_ha"],
                application_rate_mm_h=p["application_rate_mm_h"], taw_mm=p["taw_mm"],
                lon=lon, lat=lat, geometry=feat["geometry"],
            )
        )
    return blocks


def blocks_geojson() -> dict:
    return _load_json("blocks.geojson")


def kc_curves() -> dict:
    return _load_json("kc_curves.json")


def stress_targets() -> dict:
    return _load_json("stress_targets.json")


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

    hold_days = fc.hold_days_from_forecast(forecast, lo) if status == "too_wet" else None
    pour_slip = scoring.build_pour_slip(
        status, depletion_mm, block.taw_mm, lo, hi, block.application_rate_mm_h, as_of, hold_days
    )
    rec = scoring.recommendation(status, stage, pour_slip, deviation)

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
        "drivers": drivers,
        "recommendation": rec,
        "pour_slip": pour_slip,
    }
    return Evaluation(block=block, as_of=as_of, balance=balance, forecast=forecast, response=response)


def evaluate_all(as_of: date, provider, targets=None, kc=None) -> list[Evaluation]:
    targets = targets or stress_targets()
    kc = kc or kc_curves()
    return [evaluate_block(b, as_of, provider, targets, kc) for b in load_blocks()]
