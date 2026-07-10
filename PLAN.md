# Vino — Plan of Attack (v2)

**ET-GEO Hackathon 2026 · Team Marshall + Obey**
**Tagline:** *Know when to pour.*

v2 upgrades the concept from an "irrigation decision engine" to a **wine quality trajectory engine**, and locks the build architecture: the app is **built to run natively on TerraClim's ET-GEO data pack** (a `DataPackProvider` doing polygon zonal statistics over real traced block outlines), with free API and synthetic providers behind the same interface as fallbacks. TerraClim's terrain-precise ET-GEO science is the **foundation** — where each block sits; our forecast/decision layer adds where it's heading.

**Sprint dates (official run of show):** Thu 16 – Sun 19 July 2026. Demo day **Sun 19 July** — 5-minute live demo + 3-minute Q&A. Final prototype package submitted **Mon 20 July, 09:00**. Handover-readiness is a judged criterion.

---

## 1. The core insight (why this wins)

Every other team will build the same thing: a map, a stress score, "this block is dry, water it." That is row-crop logic.

Premium wine is made the other way around. Regulated Deficit Irrigation (RDI) means **the right amount of stress at the right phenological moment is the goal** — moderate deficit between fruit set and veraison concentrates berries and builds wine quality, while **over-watering is a defect**: dilution, excess vigor, disease pressure, worse wine.

So Vino's core metric is not "water stress." It is **deviation from the Stress Glide Path** — a target deficit band per block that moves with the season, the grape variety, and the wine goal. A block goes red when it drifts out of its band **in either direction**. Vino is the only tool in the room that will tell a grower: *"Stop watering — you're diluting your Cabernet."*

Water stops being a resource to minimize and becomes the winemaker's first instrument.

## 2. Feature set

### The brief-core (the judged feature set — built first, bulletproof)
0a. **Field/day dashboard** — ETo, ETa, Kc and NDVI at block level, per day. When the data pack supplies measured ETa, the balance consumes it directly; ETa below modelled ETc is a first-class stress signal.
0b. **Recommendation engine** — irrigate / hold / review, and **how much** (Pour Slip / Hold Slip).
0c. **Stress alerts** — blocks ranked by depletion; the triage list.
0d. **Validation view** — model vs WaPOR/FruitLook reference + logged pressure-bomb (MPa) readings + field-photo corroboration + information-limited backtest, with agreement stats.

### The engine (deterministic, auditable)
1. **Phenology engine** — Growing Degree Day accumulation (base 10 °C from 1 September) from climate data alone infers each block's stage: dormant → budbreak → flowering → fruit set → veraison → harvest → post-harvest. No sensors.
2. **Water balance (FAO-56, with Ks)** — daily, per block: `ETc_adj = ET0 × Kc(stage) × Ks`, where the FAO-56 stress coefficient `Ks = (TAW − D)/(TAW − RAW)` down-regulates ET past readily-available water; root-zone depletion `D_t = clamp(D_{t-1} + ETc_adj − eff_rain − irrigation, 0, TAW)` with capped effective rainfall. Measured ETa from the data pack overrides modelled ETc when present.
3. **Stress Glide Path** — target depletion band `[lo, hi]` per stage × wine style, anchored on FAO-56 grape `p = 0.45` and shown as an MSWP-equivalent band (MPa). Signed deviation drives everything: `on_track` / `too_dry` / `too_wet`.
4. **Forward layer** — projected ETc and deviation per block on a forecast *feed* (complementary to TerraClim's terrain history, not served by TerraClim); kills the "ET data is retrospective" industry weakness.

### The decisions (what the grower actually gets)
5. **Pour Slip** — a real prescription: mm needed → drip runtime in hours, per block, printable / WhatsApp-shareable. Includes "hold water" slips for too-wet blocks.
6. **Battle Plan** — constraint-solved multi-day schedule: "I have 6 hours/day" → ordered plan that skips blocks with rain inbound and prioritizes by stage sensitivity × wine value.
7. **Season Water Bank** — finite dam volume amortized over the remaining season by phenological priority. Burn-down chart + "you run dry on {date}" verdict. Day Zero resilience, built in.
8. **Field Mode (PWA)** — GPS detects the block you're standing in; one number on screen: "B4 · Pour 14.5 h — split over two nights." The daily-use hook.

### The proof (what convinces judges)
9. **Information-limited backtest** — replay the past season through the engine where each decision-day uses only data available through that day; record whether the projection breached the band *before* the actual event. No foreknowledge, no reading the archive. Lives inside the Validation view.
10. **Morning Briefing** — one cached daily sync of all blocks (fits TerraClim's ~50 queries/day API limit by design), served as a farm-wide daily brief.

### The product surfaces (now shipped, not roadmap)
- **Satellite basemap with hand-traced real block outlines** + in-app **"trace a block"** polygon tool feeding polygon zonal statistics (the TerraClim capability, demonstrated live).
- **Settings / data-source panel** — switch provider (data pack / TerraClim API / Open-Meteo), paste a masked token, validate with one live call, re-warm cache, set `as_of`. Header badge shows the active source ("Data: TerraClim ET-GEO").
- **Field photo capture** — deterministic canopy analysis (Green Leaf Index, canopy cover %, yellowing % via published RGB/HSV indices; Pillow + numpy, no ML), corroborating the model on the Validation screen.
- **Stem water potential (MPa)** language on every block; pressure-bomb calibration hook.

### Explicitly deferred (pitch as roadmap)
ESG/water-stewardship PDF export · Collaboration hub · ML gap-fill.

## 3. Data strategy: built on the ET-GEO data pack, with fallbacks behind one interface

The app is designed to run **natively on TerraClim's ET-GEO data pack**. All four providers implement one interface the engine never sees past; the active provider is chosen by the Settings screen, not a code change. **Provider order (highest priority first):**

```
ClimateProvider (interface)
  get_daily(polygon|lat,lon, start, end)  → eto, eta, ndvi, kc, rain, tmax, tmin, ...
  get_forecast(polygon|lat,lon, days)     → forward outlook (forecast feed only)
      │
      ├── DataPackProvider   (PRIMARY — reads the local ET-GEO data pack:
      │     10 m daily ETo/ETa/NDVI rasters, Kc/phenology records, RF ETa;
      │     performs POLYGON ZONAL STATISTICS over the real traced block outlines
      │     via rasterio + shapely. Folder gitignored, never leaves the machine.)
      ├── TerraClimProvider  (TerraClim API when a token is set:
      │     /api/point/ · /api/polygon/ · /api/nearest-station, cached morning batch)
      ├── OpenMeteoProvider  (free API fallback — proves the engine off free data)
      └── SyntheticProvider  (deterministic offline fixtures — demo / no-network safety)
```

TerraClim's terrain-precise ET-GEO science is the **foundation** (where each block sits); a forecast *feed* supplies the forward layer (where it's heading) — TerraClim does not serve a 14-day forecast, so that half stays a forecast feed by design. **There is no "one env var flips the whole app" claim** — the switch is a live, in-app mechanic: open Settings, load the data pack or paste the token, press Activate, the header badge flips to "Data: TerraClim ET-GEO." That is the honest demo line, and it happens on stage.

## 4. Architecture

```
React + Vite + TS + Tailwind + Leaflet PWA  (Vercel)
  Dashboard (satellite basemap + traced blocks + trace tool · ETo/ETa/Kc/NDVI)
  Block detail (glide path + MPa band) · Recommendation/Pour Slip · Stress alerts
  Validation (WaPOR/FruitLook + pressure-bomb + photo + backtest)
  Battle Plan · Season Bank · Field Mode (manual/simulated picker + camera) · Settings
        │ JSON over HTTPS (typed client, mock/synthetic fallback)
FastAPI backend  (Render / local)
  routes:   /api/health /api/blocks /api/blocks/{id}/status
            /api/blocks/{id}/timeseries /api/battle-plan
            /api/season-bank /api/scenario /api/backtest
            /api/briefing /api/irrigation (log events)
            /api/validation (references + pressure-bomb readings)
            /api/photos (upload + deterministic canopy analysis)
            /api/settings (provider, masked token, cache refresh, as_of)
  engine:   phenology.py · water_balance.py (Ks) · scoring.py
            forecast.py · battle_plan.py · season_bank.py · backtest.py
            canopy.py (GLI/cover/yellowing) · zonal.py (polygon stats)
  providers: datapack.py · terraclim.py · open_meteo.py · synthetic.py (one interface)
  cache:    disk JSON, 6 h TTL, one morning batch sync
  data:     blocks.geojson (traced) · kc_curves.json · stress_targets.json
            datapack/ (gitignored, never committed) · settings.json (gitignored)
```

Full request/response schemas: `docs/API_CONTRACT.md` (the build contract for all agents).

## 5. Run of show, demo farm & evaluation date

- **Sprint / run of show:** Thu 16 (kick-off: brief, data pack, starter kit, first data load) · Fri 17 (render ETo/ETa + vigour + first stress logic on the real data pack) · Sat 18 (recommendation engine + validation panel + alerts + UX polish) · **Sun 19 (demo day: 5-min live demo + 3-min Q&A, judging)** · **Mon 20, 09:00 (submit final prototype package for handover)**.
- **Farm:** 7 blocks on real Stellenbosch coordinates (≈ 18.86 E, −33.93 S), **hand-traced real parcels** (not rectangles), varieties spanning wine styles: Cabernet Sauvignon & Shiraz (premium red), Merlot & Pinotage (red), Chenin Blanc & Chardonnay (white), Sauvignon Blanc (fresh white). Different styles → different glide paths → visible contrast on the map.
- **Evaluation date (`as_of`):** July is dormant season in the Cape, so the app evaluates any date via `as_of` (Settings screen or `DEMO_DATE`, default 2026-01-20 — peak deficit-irrigation window). Data for that window is real (data pack / archive). Judges see mid-season action, not winter. A loud "Viewing: 20 Jan 2026 (peak season)" banner makes a slip obvious.

## 6. Build approach

Parallel agent build against the locked contract:
- **Backend agent** → complete FastAPI app + engine + providers + tests, runnable.
- **Frontend agent** → complete PWA, typed client, mock fallback so it demos even without backend.
- **Viticulture research agent** → verify Kc curves, GDD stage thresholds, RDI depletion bands for SA wine regions; sources documented in `docs/research/`.
- **Pitch agent** → judge-facing pitch narrative + demo script in `docs/`.
- **Red-team agent** → attack the concept as a hostile judge; findings drive final polish.

UI note: frontend ships with all design values centralized as tokens (single theme file) — deliberately neutral so the team can apply its own design language afterward. No AI-boilerplate comments, no placeholder lorem.

## 7. Non-negotiable rules

- Provider tokens live backend-side only (env var **or** the gitignored `settings.json` written from the Settings screen). Write-only from the UI, masked on read, never in frontend state/localStorage, never in git. `.env.example` only.
- The TerraClim data pack (`backend/app/data/datapack/`) is gitignored and never committed, published or shared (IP notice). Repo stays private through the hackathon.
- All external climate calls go through the backend and its cache.
- Scoring is deterministic; AI writes English only, never numbers.
- Every recommendation is auditable: stage → balance → deviation → prescription.
- Rate-limit-friendly by design: one batch sync per day serves all screens from cache.
- Handover-ready is a feature: clean docs, `.env.example`, one-command run, architecture doc.

## 8. Success criteria

Brief-core (must be flawless):
- A field/day dashboard showing ETo, ETa, Kc and NDVI at block level.
- A clear irrigate / hold / **how-much** recommendation per block ("B4 · Pour 14.5 h — split over two nights").
- Stress alerts ranking blocks by depletion.
- A Validation view: model vs WaPOR/FruitLook + a logged pressure-bomb (MPa) reading + a field-photo canopy read + the information-limited backtest.

Over-delivery (the winning margin):
- A "too wet" Hold Slip on at least one premium-red block — the moment nobody else has.
- A multi-day, forecast-aware, constraint-solved Battle Plan that skips a block on inbound rain.
- A season burn-down / Day-Zero verdict from the Water Bank.
- Field Mode (manual/simulated picker) + a working camera canopy check.

Data & handover:
- The app runs on the ET-GEO data pack via `DataPackProvider` (polygon zonal statistics); the live Settings flip switches source and flips the header badge to "Data: TerraClim ET-GEO" — **no env-var-flips-everything claim.**
- Handover-ready (judged): clean docs, `.env.example`, one-command run, architecture doc, and a provider seam TerraClim can carry forward — "a path toward a real TerraClim product." Data pack and tokens never committed.
