# Vino Backend

FastAPI backend for **Vino**, a vineyard irrigation intelligence engine built around
the *Stress Glide Path*: the target root-zone deficit band that moves with the season,
grape variety, and wine style. A block goes red when it drifts out of its band in
*either* direction: too dry, or (the alert nobody else has) too wet.

The engine is deterministic and auditable end to end: **stage → water balance →
deviation → prescription**. AI is never used for numbers.

## Run

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # optional; defaults work with no edits
uvicorn app.main:app --reload
```

Then:

```bash
curl localhost:8000/api/health
curl localhost:8000/api/blocks
curl "localhost:8000/api/blocks/B1/status?as_of=2026-01-20"
curl -X POST localhost:8000/api/battle-plan -H 'content-type: application/json' \
     -d '{"available_hours_per_day":6,"horizon_days":3}'
curl "localhost:8000/api/season-bank?remaining_m3=12000"
curl "localhost:8000/api/backtest?months=4"
curl localhost:8000/api/briefing
```

Interactive docs at `http://localhost:8000/docs`.

## v2 endpoints (Contract addendum)

```bash
# ETa/NDVI + MSWP now ride on the status/timeseries payloads (additive):
curl localhost:8000/api/blocks/B4/status         # + mswp_estimate_mpa, mswp_band_mpa, eta_7d/ndvi/transpiration_deficit_pct drivers
curl "localhost:8000/api/blocks/B1/timeseries?days=45"   # rows gain kc, eta, ndvi

# Validation (pressure-bomb readings + photo GLI, WaPOR/FruitLook reference when the pack ships one)
curl -X POST localhost:8000/api/validation/reading -H 'content-type: application/json' \
     -d '{"block_id":"B4","date":"2026-01-15","mswp_mpa":-1.3}'
curl localhost:8000/api/validation/B4
curl -F block_id=B1 -F image=@canopy.jpg localhost:8000/api/photos
curl localhost:8000/api/photos/B1
curl localhost:8000/api/photos/file/<photo_id> --output out.jpg

# Settings / Data Source panel (provider swap validated live, token masked, applied without restart)
curl localhost:8000/api/settings
curl -X POST localhost:8000/api/settings/provider -H 'content-type: application/json' \
     -d '{"provider":"open-meteo"}'
curl -X POST localhost:8000/api/settings/cache/refresh
curl -X POST localhost:8000/api/settings/demo-date -H 'content-type: application/json' -d '{"as_of":"2026-01-20"}'

# Trace a block (user-created; scored like any block; delete user blocks only)
curl -X POST localhost:8000/api/blocks -H 'content-type: application/json' \
     -d '{"name":"New Parcel","variety":"Merlot","wine_style":"red","application_rate_mm_h":2.0,"geometry":{"type":"Polygon","coordinates":[[[18.86,-33.93],[18.862,-33.9305],[18.863,-33.9288],[18.861,-33.928],[18.86,-33.93]]]}}'
curl -X DELETE localhost:8000/api/blocks/U1
```

The engine additions: FAO-56 `Ks` stress coefficient (`RAW = 0.45×TAW`, `ETc_adj = ET0×Kc×Ks`),
effective rainfall (`<2 mm` ignored, `40 mm/day` infiltration cap), measured `ETa` consumed
directly by the balance when a source supplies it (modelled `ETc×Ks` remains the forward layer),
a modelled MSWP-equivalent (`app/data/mswp_map.json`, marked modelled), and an
**information-limited** backtest (each day-D flag uses only data ≤ D plus the engine's own forward
projection; `"methodology": "information_limited"`).

## Configuration (`.env`)

| var | default | meaning |
|---|---|---|
| `PORT` | 8000 | uvicorn port |
| `DEMO_DATE` | 2026-01-20 | default `as_of` evaluation date (peak deficit-irrigation window) |
| `TERRACLIM_TOKEN` | *(unset)* | when set *and* the adapter is marked ready, the app runs on TerraClim data |
| `AI_KEY` | *(unset)* | optional; enables the AI narrative in `/api/explain`. Numbers are never AI-generated |
| `CACHE_TTL_HOURS` | 6 | disk cache TTL (archive older than 7 days is cached indefinitely) |
| `VINO_PROVIDER` | *(unset)* | force a provider (`open-meteo`/`terraclim`/`datapack`); the Settings panel writes this at runtime |

Runtime overrides chosen in the Settings panel persist to gitignored `app/data/settings.json`
(owner-only perms; token never echoed) and layer over these `.env` defaults.

Every read endpoint accepts `?as_of=YYYY-MM-DD`; the season starts on 1 September of
the season containing `as_of`.

## Data providers

The engine only ever sees the `ClimateProvider` interface (`app/providers/base.py`).
Selection order: **data pack** (if loaded) → **TerraClim** (if ready) → **Open-Meteo** → synthetic fallback.

- **DataPackProvider**: reads the ET-GEO curated pack from `app/data/datapack/` (gitignored)
  via a `datapack.json` manifest. CSV per-block series work with **no extra dependencies**;
  GeoTIFF raster zonal statistics use **rasterio, imported lazily** and **optional**. It is
  *not* in `requirements.txt`. Install it (`pip install rasterio shapely`) only to read raster
  layers; the CSV path needs neither. Retrospective source: no forecast (the forward layer
  supplies that). A synthetic sample pack for testing:
  ```bash
  python -m scripts.make_sample_datapack   # writes CSV sample data: clearly labelled synthetic, NOT TerraClim data
  ```
- **Open-Meteo** (default, no key): historical archive + forecast, FAO-56 ET0.
- **TerraClim**: drop-in adapter, auto-selected once a token is present and the
  adapter is marked ready. Stubbed until Day-0 credentials arrive.
- **Fixture**: deterministic synthetic weather for tests (no network) and as a
  resilience fallback: if the live provider is unreachable, calls transparently fall
  back to synthetic data with a logged warning, so the demo never shows an error screen.
  Synthetic weather includes plausible `eta`/`ndvi` so the measured-channel paths are exercised.

All provider calls flow through a disk cache in `app/data/cache/`.

## Demo irrigation history

The demo farm is an *irrigated* vineyard, so `app/data/irrigation_log.json` ships with
a season of managed-deficit irrigation events. This is what lets the blocks sit on
their glide paths (a mix of on-track, too-dry, and one deliberately over-watered
too-wet block) instead of saturating at full depletion, as an unirrigated rain-fed
balance would by mid-summer. The history is generated deterministically and is fully
auditable: the balance replays it exactly (log → balance → status):

```bash
python -m scripts.seed_irrigation      # regenerate app/data/irrigation_log.json
```

New irrigation events logged via `POST /api/irrigation` are appended to the same file.

## Tests

```bash
cd backend
VINO_FORCE_FIXTURE=1 pytest -q      # forced synthetic weather; no network
```

Covers GDD stage inference and variety factors, depletion clamping, FAO-56 `Ks` onset above
RAW, effective-rainfall threshold/cap, measured ETa overriding modelled ET, too-dry and
too-wet status, the canonical score formula, pour vs hold slips, the rain-aware battle-plan
scheduler, the season-bank shortfall verdict, the DataPackProvider CSV path, MSWP + validation,
photo GLI analysis on a generated test image, the Settings provider switch (persist + mask token),
user-block create/score/delete, and the information-limited backtest catching the seeded event.

## Layout

```
app/
  main.py config.py deps.py schemas.py services.py settings_store.py
  routes/    health blocks battle_plan season_bank scenario backtest briefing irrigation
             explain validation photos settings
  engine/    phenology water_balance scoring forecast battle_plan season_bank backtest
             mswp photo_analysis
  providers/ base open_meteo terraclim datapack fixture cache factory
  data/      blocks.geojson kc_curves.json stress_targets.json mswp_map.json
             irrigation_log.json cache/ photos/ datapack/ (gitignored: settings.json,
             user_blocks.geojson, validation_readings.json, photos/*, datapack/)
scripts/     seed_irrigation.py make_sample_datapack.py
```
