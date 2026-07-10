# Vino — Plan of Attack (v2)

**ET-GEO Hackathon 2026 · Team Marshall + Obey**
**Tagline:** *Know when to pour.*

v2 upgrades the concept from an "irrigation decision engine" to a **wine quality trajectory engine**, and locks the build architecture: free data providers now, TerraClim as a drop-in adapter when the token arrives.

---

## 1. The core insight (why this wins)

Every other team will build the same thing: a map, a stress score, "this block is dry, water it." That is row-crop logic.

Premium wine is made the other way around. Regulated Deficit Irrigation (RDI) means **the right amount of stress at the right phenological moment is the goal** — moderate deficit between fruit set and veraison concentrates berries and builds wine quality, while **over-watering is a defect**: dilution, excess vigor, disease pressure, worse wine.

So Vino's core metric is not "water stress." It is **deviation from the Stress Glide Path** — a target deficit band per block that moves with the season, the grape variety, and the wine goal. A block goes red when it drifts out of its band **in either direction**. Vino is the only tool in the room that will tell a grower: *"Stop watering — you're diluting your Cabernet."*

Water stops being a resource to minimize and becomes the winemaker's first instrument.

## 2. Feature set

### The engine (deterministic, auditable)
1. **Phenology engine** — Growing Degree Day accumulation (base 10 °C from 1 September) from climate data alone infers each block's stage: dormant → budbreak → flowering → fruit set → veraison → harvest → post-harvest. No sensors.
2. **Water balance** — daily, per block: `ETc = ET0 × Kc(stage)`, root-zone depletion `D_t = clamp(D_{t-1} + ETc − rain − irrigation, 0, TAW)`.
3. **Stress Glide Path** — target depletion band `[lo, hi]` per stage × wine style. Signed deviation drives everything: `on_track` / `too_dry` / `too_wet`.
4. **14-day forecast** — forward ETc and projected deviation per block; kills the "ET data is retrospective" industry weakness.

### The decisions (what the grower actually gets)
5. **Pour Slip** — a real prescription: mm needed → drip runtime in hours, per block, printable / WhatsApp-shareable. Includes "hold water" slips for too-wet blocks.
6. **Battle Plan** — constraint-solved multi-day schedule: "I have 6 hours/day" → ordered plan that skips blocks with rain inbound and prioritizes by stage sensitivity × wine value.
7. **Season Water Bank** — finite dam volume amortized over the remaining season by phenological priority. Burn-down chart + "you run dry on {date}" verdict. Day Zero resilience, built in.
8. **Field Mode (PWA)** — GPS detects the block you're standing in; one number on screen: "B4 · Pour 3.2 h tonight." The daily-use hook.

### The proof (what convinces judges)
9. **Backtest** — replay the past season through the engine; show it flagging real heat events early. Answers "how do you know it's right?" with data.
10. **Morning Briefing** — one cached daily sync of all blocks (fits TerraClim's 50 queries/day limit by design), served as a farm-wide daily brief.

### Explicitly deferred (pitch as roadmap)
Photo canopy cross-check · ESG/water-stewardship PDF export · Collaboration hub · ML gap-fill · Sentinel-2 NDVI overlay.

## 3. Data strategy: free now, TerraClim drop-in later

```
ClimateProvider (interface)
  get_daily(lat, lon, start, end)   → et0, rain, tmax, tmin, rh, wind, solar
  get_forecast(lat, lon, days)      → same shape, up to 16 days
      │
      ├── OpenMeteoProvider   (DEFAULT — free, no key, live today)
      │     forecast API + historical archive API, includes FAO-56 ET0
      └── TerraClimProvider   (auto-activates when TERRACLIM_TOKEN is set)
            /api/point/ · /api/polygon/ · /api/nearest-station
```

The engine only ever sees the provider interface. When TerraClim hands us the token on Day 0, we set one env var and the whole app runs on their data — that is the demo line: *"Built provider-agnostic, running on your network."*

## 4. Architecture

```
React + Vite + TS + Tailwind + Leaflet PWA  (Vercel)
  Dashboard · Block detail (glide path chart) · Battle Plan
  Season Bank · Field Mode · Pour Slip · Backtest · Scenario
        │ JSON over HTTPS (typed client, mock fallback)
FastAPI backend  (Render)
  routes:   /api/health /api/blocks /api/blocks/{id}/status
            /api/blocks/{id}/timeseries /api/battle-plan
            /api/season-bank /api/scenario /api/backtest
            /api/briefing /api/irrigation (log events)
  engine:   phenology.py · water_balance.py · scoring.py
            forecast.py · battle_plan.py · season_bank.py · backtest.py
  providers: open_meteo.py · terraclim.py (same interface)
  cache:    disk JSON, 6 h TTL, one morning batch sync
  data:     blocks.geojson · kc_curves.json · stress_targets.json
```

Full request/response schemas: `docs/API_CONTRACT.md` (the build contract for all agents).

## 5. Demo farm & demo date

- **Farm:** 7 blocks on real Stellenbosch coordinates (≈ 18.86 E, −33.93 S), varieties spanning wine styles: Cabernet Sauvignon & Shiraz (premium red), Merlot & Pinotage (red), Chenin Blanc & Chardonnay (white), Sauvignon Blanc (fresh white). Different styles → different glide paths → visible contrast on the map.
- **Demo date:** July is dormant season in the Cape, so the app supports `as_of` (env `DEMO_DATE`, default 2026-01-20 — peak deficit-irrigation window). Historical data for that window is real, via the archive API. Judges see mid-season action, not winter.

## 6. Build approach

Parallel agent build against the locked contract:
- **Backend agent** → complete FastAPI app + engine + providers + tests, runnable.
- **Frontend agent** → complete PWA, typed client, mock fallback so it demos even without backend.
- **Viticulture research agent** → verify Kc curves, GDD stage thresholds, RDI depletion bands for SA wine regions; sources documented in `docs/research/`.
- **Pitch agent** → judge-facing pitch narrative + demo script in `docs/`.
- **Red-team agent** → attack the concept as a hostile judge; findings drive final polish.

UI note: frontend ships with all design values centralized as tokens (single theme file) — deliberately neutral so the team can apply its own design language afterward. No AI-boilerplate comments, no placeholder lorem.

## 7. Non-negotiable rules

- Provider tokens live in backend env vars only. Never in frontend, never in git. `.env.example` only.
- All external climate calls go through the backend and its cache.
- Scoring is deterministic; AI writes English only, never numbers.
- Every recommendation is auditable: stage → balance → deviation → prescription.
- Rate-limit-friendly by design: one batch sync per day serves all screens from cache.

## 8. Success criteria

- A phone screen with a real, correct number for a real block ("Pour 3.2 h tonight").
- A "too wet" alert on at least one block — the moment nobody else has.
- A multi-day, forecast-aware, constraint-solved schedule with reasons.
- A season burn-down verdict from the Water Bank.
- A backtest replay that catches a real historical heat event.
- One env var flips the whole app from Open-Meteo to TerraClim.
