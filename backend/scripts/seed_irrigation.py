"""Regenerate the demo farm's managed-deficit irrigation history.

Run from the backend directory: `python -m scripts.seed_irrigation`

The demo farm is an irrigated vineyard, so its water balance reflects a season of
managed-deficit irrigation. This script produces that history deterministically by
simulating a glide-path controller against the same weather the app sees: it replaces
water on each block's cadence to hold it near its band midpoint, stops a per-block
number of days before as_of so blocks drift to a natural spread of states, and gives
one block a deliberate late over-irrigation to exercise the too-wet alert. The result
is written to app/data/irrigation_log.json and is fully auditable (log -> balance ->
status reconciles). Without it, a rain-fed balance saturates every block at full
depletion by mid-summer, erasing all glide-path contrast."""
import json
from datetime import date, timedelta
from pathlib import Path

from app.engine.phenology import build_phenology, variety_factor
from app.engine.scoring import band_for
from app.engine.water_balance import clamp, effective_rain, kc_for, stress_coefficient
from app.providers.fixture import FixtureProvider
from app.services import load_blocks, season_start, kc_curves, stress_targets

OUT_PATH = Path(__file__).resolve().parent.parent / "app" / "data" / "irrigation_log.json"

AS_OF = date(2026, 1, 20)
# Days since each block's last routine irrigation (a real farm rotates blocks, so
# they drift to different points on the glide path). Larger gap -> drier at as_of.
STOP_BUFFER_DAYS = {"B1": 6, "B2": 3, "B4": 7, "B5": 2, "B6": 4, "B7": 3}
DEFAULT_BUFFER = 3
IRRIGATION_INTERVAL = 3       # drip runs on a cadence, not daily
OVERWATER_BLOCK = "B3"        # deliberately over-irrigated block -> too_wet
OVERWATER_TARGET_FRACTION = 0.08

provider = FixtureProvider()
kc = kc_curves()
targets = stress_targets()
ss = season_start(AS_OF)

events = []
for block in load_blocks():
    factor = variety_factor(block.variety)
    history = provider.get_daily(block.lat, block.lon, ss, AS_OF)
    phen = build_phenology(history, factor)
    stage_by_date = {d: s for d, _g, s in phen}
    taw = block.taw_mm
    stop_date = AS_OF - timedelta(days=STOP_BUFFER_DAYS.get(block.id, DEFAULT_BUFFER))

    D = 0.30 * taw
    for w in history:
        stage = stage_by_date[w.date]
        # Match the engine balance exactly: FAO-56 Ks, measured ETa when present,
        # effective rainfall. Keeps log -> balance -> status reconciling day-for-day.
        ks = stress_coefficient(D, taw)
        etc = w.et0 * kc_for(kc, stage) * ks
        consumed = w.eta if w.eta is not None else etc
        D = clamp(D + consumed - effective_rain(w.rain), 0.0, taw)
        lo, hi = band_for(targets, stage, block.wine_style)
        mid = (lo + hi) / 2

        if block.id == OVERWATER_BLOCK and w.date == AS_OF - timedelta(days=1):
            target = OVERWATER_TARGET_FRACTION * taw
            if D > target:
                mm = round(D - target, 1)
                events.append({"block_id": block.id, "date": w.date.isoformat(), "mm": mm})
                D = target
            continue

        # Irrigate only on the block's scheduled cadence days, replacing to the band
        # midpoint. Between runs depletion drifts up, so a heat surge can overshoot
        # the band before the next scheduled irrigation.
        on_schedule = (stop_date - w.date).days % IRRIGATION_INTERVAL == 0
        if w.date <= stop_date and on_schedule and D > mid * taw:
            mm = round(D - mid * taw, 1)
            if mm >= 1.0:
                events.append({"block_id": block.id, "date": w.date.isoformat(), "mm": mm})
                D = mid * taw

events.sort(key=lambda e: (e["date"], e["block_id"]))
with open(OUT_PATH, "w") as f:
    json.dump(events, f, indent=2)
    f.write("\n")
print(f"wrote {len(events)} events to {OUT_PATH}")
