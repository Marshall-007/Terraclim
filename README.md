# Vino: Know when to pour.

Vineyard water intelligence for the **TerraClim ET-GEO Hackathon 2026**. Vino turns TerraClim's 10 m ET-GEO science into the one answer the brief asks for (*irrigate, hold, or how much, per block, today*), and it is the only tool in the room that knows premium wine has a **too-wet failure mode**: it tells a grower when to pour, and when to stop.

**Live demo:** https://marshall-007.github.io/Terraclim/ (runs on bundled demo data; the full stack runs locally below)

## Why it's different

Standard irrigation tools treat all water stress as bad: row-crop logic. Wine grapes are farmed on **regulated deficit irrigation (RDI)**: the *right* stress at the *right* phenological stage concentrates berries and builds quality, while over-watering dilutes flavour and drives vigor and disease. Vino scores every block against a **Stress Glide Path** (a target depletion band that moves with growth stage, variety, and wine style) and flags deviation in *either* direction. "Stop watering: you're diluting your Cabernet" is a first-class alert.

## What it does

| Screen | What the grower gets |
|---|---|
| Dashboard | Satellite map, traced block outlines, blocks ranked by depletion; ETo, ETa, Kc, NDVI per block per day |
| Block detail | Glide-path chart with target band, stem water potential (MPa), driver breakdown, recommendation |
| Pour Slip | The prescription: mm needed → drip hours; printable, WhatsApp-shareable; Hold Slips for wet blocks |
| Battle Plan | "I have 6 hours/day" → multi-day schedule that skips blocks with rain inbound |
| Season Water Bank | Finite dam volume amortized over the season; "you run dry on {date}" verdict |
| Field Mode | GPS finds the block you're standing in; one number on screen; camera capture |
| Validate | Model vs reference series, pressure-bomb readings with agreement stats, photo canopy analysis (GLI), information-limited backtest |
| Settings | Live data-source switch: ET-GEO data pack / TerraClim API token / Open-Meteo; cache controls |

The engine is deterministic and auditable end-to-end: GDD phenology → FAO-56 water balance (`ETc_adj = ET0 × Kc × Ks`) → glide-path deviation → prescription. Measured ETa from the data pack overrides the model when present; AI is never used for numbers.

## Quickstart

```bash
make dev        # installs anything missing, runs backend :8000 + frontend :5173
```

Or by hand:

```bash
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --port 8000
# separate shell
cd frontend && npm install && npm run dev
```

Open http://localhost:5173. With no configuration the app runs on deterministic demo data (evaluation date 2026-01-20, mid-season Stellenbosch); the frontend also falls back to bundled mocks if the backend is down, so there is always something to demo.

```bash
make test       # backend test suite (36 tests)
make build      # production frontend build
```

## Data sources

All climate access goes through one provider interface, selected at runtime in Settings:

1. **ET-GEO DataPackProvider**: reads the TerraClim data pack from a local folder (CSV series and/or GeoTIFF rasters via optional rasterio) and runs polygon zonal statistics over the traced block outlines. The pack folder is gitignored and never leaves the machine, per the hackathon data notice.
2. **TerraClim API**: activates when a token is pasted in Settings (validated live, stored masked and server-side only).
3. **Open-Meteo**: free fallback, no key, includes FAO-56 ET0.
4. **Synthetic**: deterministic offline fixtures so a dead network can never kill the demo.

## Repository layout

```
backend/   FastAPI · engine (phenology, water balance, scoring, forecast,
           battle plan, season bank, backtest) · providers · tests
frontend/  React + Vite + TS PWA · Leaflet satellite map · Recharts
docs/      brief, API contract, pitch, demo script, research, audits
scripts/   dev.sh (one-command run)
```

Environment variables (backend, all optional): copy `backend/.env.example` to `backend/.env`. `TERRACLIM_TOKEN` can be set there or pasted in the Settings screen at runtime; `DEMO_DATE` moves the evaluation date.

## Team

Marshall Dube · Obey Musimbo, ET-GEO Hackathon 2026.

TerraClim data, research assets, and challenge materials remain the property of TerraClim and are never committed to this repository.
