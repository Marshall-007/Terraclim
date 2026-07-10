# Vino Backend

FastAPI backend for **Vino** — a vineyard irrigation intelligence engine built around
the *Stress Glide Path*: the target root-zone deficit band that moves with the season,
grape variety, and wine style. A block goes red when it drifts out of its band in
*either* direction — too dry, or (the alert nobody else has) too wet.

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

## Configuration (`.env`)

| var | default | meaning |
|---|---|---|
| `PORT` | 8000 | uvicorn port |
| `DEMO_DATE` | 2026-01-20 | default `as_of` evaluation date (peak deficit-irrigation window) |
| `TERRACLIM_TOKEN` | *(unset)* | when set *and* the adapter is marked ready, the app runs on TerraClim data |
| `AI_KEY` | *(unset)* | optional; enables the AI narrative in `/api/explain`. Numbers are never AI-generated |
| `CACHE_TTL_HOURS` | 6 | disk cache TTL (archive older than 7 days is cached indefinitely) |

Every read endpoint accepts `?as_of=YYYY-MM-DD`; the season starts on 1 September of
the season containing `as_of`.

## Data providers

The engine only ever sees the `ClimateProvider` interface (`app/providers/base.py`):

- **Open-Meteo** (default, no key) — historical archive + forecast, FAO-56 ET0.
- **TerraClim** — drop-in adapter, auto-selected once a token is present and the
  adapter is marked ready. Stubbed until Day-0 credentials arrive.
- **Fixture** — deterministic synthetic weather for tests (no network) and as a
  resilience fallback: if the live provider is unreachable, calls transparently fall
  back to synthetic data with a logged warning, so the demo never shows an error screen.

All provider calls flow through a disk cache in `app/data/cache/`.

## Demo irrigation history

The demo farm is an *irrigated* vineyard, so `app/data/irrigation_log.json` ships with
a season of managed-deficit irrigation events. This is what lets the blocks sit on
their glide paths (a mix of on-track, too-dry, and one deliberately over-watered
too-wet block) instead of saturating at full depletion, as an unirrigated rain-fed
balance would by mid-summer. The history is generated deterministically and is fully
auditable — the balance replays it exactly (log → balance → status):

```bash
python -m scripts.seed_irrigation      # regenerate app/data/irrigation_log.json
```

New irrigation events logged via `POST /api/irrigation` are appended to the same file.

## Tests

```bash
cd backend
VINO_FORCE_FIXTURE=1 pytest -q      # forced synthetic weather; no network
```

Covers GDD stage inference and variety factors, depletion clamping, too-dry and
too-wet status, pour vs hold slips, the rain-aware battle-plan scheduler, and the
season-bank shortfall verdict.

## Layout

```
app/
  main.py config.py deps.py schemas.py services.py
  routes/    health blocks battle_plan season_bank scenario backtest briefing irrigation explain
  engine/    phenology water_balance scoring forecast battle_plan season_bank backtest
  providers/ base open_meteo terraclim fixture cache factory
  data/      blocks.geojson kc_curves.json stress_targets.json irrigation_log.json cache/
```
