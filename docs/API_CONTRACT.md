# Vino API Contract (v1)

This is the binding interface between backend and frontend. Both sides build against this document. Any change must be reflected here first.

Backend base URL: `http://localhost:8000` in dev; frontend reads `VITE_API_BASE`.
All responses are JSON. All dates are ISO `YYYY-MM-DD`. All endpoints accept an optional `as_of=YYYY-MM-DD` query param (defaults to env `DEMO_DATE`, then to today). The engine evaluates the farm as of that date.

---

## Domain model

### Wine styles
`premium_red` · `red` · `white` · `fresh_white`

### Phenological stages (Southern Hemisphere, season starts 1 September)
GDD = Σ max(0, (Tmax+Tmin)/2 − 10) accumulated from 1 Sep. Stage thresholds (GDD, scaled by variety factor):

| stage | enters at GDD |
|---|---|
| dormant | (before budbreak / after post_harvest window) |
| budbreak | 100 |
| flowering | 400 |
| fruit_set | 500 |
| veraison | 1150 |
| harvest | 1600 |
| post_harvest | after harvest + 30 days |

Variety factors (multiply thresholds): Sauvignon Blanc 0.90, Chardonnay 0.95, Chenin Blanc 1.00, Merlot 1.00, Pinotage 1.00, Shiraz 1.05, Cabernet Sauvignon 1.15.

### Kc by stage
dormant 0.15 · budbreak 0.30 · flowering 0.45 · fruit_set 0.60 · veraison 0.70 · harvest 0.55 · post_harvest 0.40

### Water balance
- TAW (total available water in root zone): 120 mm default, per-block override allowed.
- Depletion: `D_t = clamp(D_{t-1} + ETc_t − rain_t − irrigation_t, 0, TAW)`; depletion fraction `f = D/TAW`.
- Balance is computed from 1 September of the current season to `as_of`, seeded `D=0.3×TAW`.

### Stress Glide Path: target depletion-fraction bands [lo, hi] per stage × style

| stage | premium_red | red | white | fresh_white |
|---|---|---|---|---|
| dormant | 0.00–0.60 | 0.00–0.60 | 0.00–0.60 | 0.00–0.60 |
| budbreak | 0.15–0.35 | 0.15–0.35 | 0.15–0.35 | 0.15–0.35 |
| flowering | 0.20–0.40 | 0.20–0.40 | 0.20–0.40 | 0.20–0.40 |
| fruit_set | 0.45–0.65 | 0.40–0.60 | 0.30–0.50 | 0.25–0.45 |
| veraison | 0.35–0.55 | 0.35–0.55 | 0.30–0.50 | 0.25–0.40 |
| harvest | 0.35–0.55 | 0.35–0.55 | 0.30–0.50 | 0.25–0.40 |
| post_harvest | 0.20–0.40 | 0.20–0.40 | 0.20–0.40 | 0.20–0.40 |

(Defaults from FAO-56 + RDI literature; `docs/research/` may refine values. Engine reads them from `backend/app/data/stress_targets.json`, never hardcodes.)

### Deviation & status
- `deviation = f − hi` if `f > hi` (positive, **too_dry**); `deviation = f − lo` if `f < lo` (negative, **too_wet**); else `0` (**on_track**).
- `score` (0–100), canonical single formulation: `deviation_component = |deviation| / 0.35 × 100` (uncapped); `forecast_component = |projected deviation in 7 days| / 0.35 × 100` (uncapped); `score = min(100, round(0.7 × deviation_component + 0.3 × forecast_component))`, round half up, single cap applied once at the end. Both engine and frontend mocks implement exactly this.
- Traffic light: 0–25 `stable`, 26–50 `watch`, 51–75 `high`, 76–100 `critical`. Status string is independent: `on_track` / `too_dry` / `too_wet`.

### Pour Slip math
- `needed_mm = max(0, D − mid×TAW)` where `mid = (lo+hi)/2` (bringing depletion back to band midpoint).
- `runtime_hours = needed_mm / application_rate_mm_h` (block property), rounded to 0.1 h.
- `window`: `"tonight"` when `runtime_hours ≤ 8` (a drip set fits one night); `"next two nights"` for longer runs.
- If status is `too_wet`: slip type `hold` with `hold_days` estimate (days for ETc to bring `f` back above `lo`, using forecast).

---

## Endpoints

### `GET /api/health`
```json
{ "status": "ok", "provider": "open-meteo", "terraclim_ready": false, "as_of": "2026-01-20", "cache_age_minutes": 42 }
```

### `GET /api/blocks`
GeoJSON FeatureCollection. Feature properties:
```json
{
  "id": "B1", "name": "Bosberg Cabernet", "variety": "Cabernet Sauvignon",
  "wine_style": "premium_red", "area_ha": 2.8,
  "application_rate_mm_h": 2.0, "taw_mm": 120
}
```

### `GET /api/blocks/{id}/status`

Worked example: **B4 Windberg Pinotage** (variety factor 1.00, so veraison begins at GDD 1150 unscaled). Demo-canonical block states: **B4 = top too-dry**, **B1 Bosberg Cabernet = too-wet** (seeded ~28 mm over-irrigation per R6, the "stop watering your Cabernet" climax), enforced identically in the live seed and the frontend mocks. The JSON below is the engine's actual output on the deterministic demo seed (`as_of=2026-01-20`), not a hand-worked illustration.

```json
{
  "block_id": "B4", "as_of": "2026-01-20",
  "stage": "veraison", "gdd": 1582.8,
  "depletion_mm": 85.6, "depletion_fraction": 0.713,
  "target_band": [0.35, 0.55],
  "status": "too_dry", "deviation": 0.163, "score": 55, "traffic": "high",
  "mswp_estimate_mpa": -1.34, "mswp_band_mpa": [-1.2, -1.0],
  "drivers": [
    { "key": "et0_7d", "label": "7-day ET0", "value": 6.3, "unit": "mm/day", "pressure": "high" },
    { "key": "eta_7d", "label": "7-day ETa", "value": 3.6, "unit": "mm/day", "pressure": "high" },
    { "key": "ndvi", "label": "NDVI", "value": 0.71, "unit": "", "pressure": "medium" },
    { "key": "transpiration_deficit_pct", "label": "Transpiration deficit", "value": 17.8, "unit": "%", "pressure": "high" }
  ],
  "recommendation": "Apply 29 mm (14.5 h drip) split over the next two nights to return to the veraison glide path.",
  "pour_slip": {
    "type": "pour", "needed_mm": 28.9, "runtime_hours": 14.5,
    "window": "next two nights", "next_check": "2026-01-23", "hold_days": null
  }
}
```
For a too-wet block (**B1 Bosberg Cabernet**) on the same demo seed: `"status": "too_wet"`, `"depletion_fraction": 0.108`, `"deviation": -0.242`, `"score": 48`, `"mswp_estimate_mpa": -0.65`, `pour_slip.type = "hold"`, `needed_mm = 0`, `hold_days = 7`, recommendation explains that watering now risks dilution and excess vigor.

### `GET /api/blocks/{id}/timeseries?days=45`
```json
{
  "block_id": "B4",
  "history": [
    { "date": "2026-01-01", "et0": 5.8, "etc": 4.1, "rain": 0.0, "irrigation_mm": 0,
      "depletion_fraction": 0.51, "band_lo": 0.35, "band_hi": 0.55, "stage": "veraison" }
  ],
  "forecast": [
    { "date": "2026-01-21", "et0": 6.2, "etc": 4.3, "rain": 0.0,
      "depletion_fraction_projected": 0.73, "band_lo": 0.35, "band_hi": 0.55 }
  ]
}
```

### `POST /api/battle-plan`
Request:
```json
{ "available_hours_per_day": 6, "horizon_days": 3 }
```
Response (the engine's actual output on the deterministic demo seed, `as_of=2026-01-20`):
```json
{
  "as_of": "2026-01-20",
  "plan": [
    { "day": "2026-01-20", "entries": [
      { "block_id": "B4", "hours": 6.0, "mm_applied": 12.0,
        "reason": "Highest glide-path deviation (too dry) in veraison; no rain forecast 11 days." }
    ]},
    { "day": "2026-01-21", "entries": [
      { "block_id": "B4", "hours": 6.0, "mm_applied": 12.0,
        "reason": "Highest glide-path deviation (too dry) in veraison; no rain forecast 11 days." }
    ]},
    { "day": "2026-01-22", "entries": [
      { "block_id": "B2", "hours": 6.0, "mm_applied": 10.8,
        "reason": "Highest glide-path deviation (too dry) in veraison; no rain forecast 14 days." }
    ]}
  ],
  "skipped": [
    { "block_id": "B1", "reason": "Currently too wet: irrigation would push it further off path." },
    { "block_id": "B7", "reason": "12 mm rain forecast within 48 h closes the deficit without irrigation." }
  ],
  "summary": "18 available hours allocated to 2 of 7 blocks; 2 blocks skipped on forecast; est. 243 m³ water saved."
}
```
Greedy scheduler: per day, rank blocks by projected too-dry deviation × stage sensitivity (fruit_set/veraison weigh double) × wine-style weight (premium_red 1.3, red 1.15, white 1.0, fresh_white 1.0); skip blocks with ≥8 mm rain forecast within 48 h; allocate hours until block reaches band midpoint or day budget exhausts.

### `GET /api/season-bank?remaining_m3=12000`
`verdict` is `"sufficient" | "shortfall"`. On the deterministic demo seed 12 000 m³ is sufficient:
```json
{
  "as_of": "2026-01-20", "season_end": "2026-03-09", "remaining_m3": 12000,
  "projected_demand_m3": 3900,
  "verdict": "sufficient", "run_dry_date": null,
  "days_short": 0,
  "burn_down": [ { "date": "2026-01-21", "bank_m3": 11416, "demand_to_date_m3": 584 } ],
  "advice": "Bank on track: projected demand 3,900 m³ vs 12,000 m³ available."
}
```
When the bank cannot cover the projected demand, `verdict` flips to `"shortfall"` with a `run_dry_date`, a positive `days_short`, and advice quantifying the gap. Demand model: Σ over future days & blocks of `max(0, ETc − expected_rain) × area_m2 / 1000` restricted to keeping each block at band midpoint; forecast used for the first 14 days, stage-mean climatology after.

### `POST /api/scenario`
Request: `{ "type": "heatwave" | "drought" | "rain_event" | "cool_spell", "days": 7 }`
Response: array of per-block `status` objects (same schema as `/status`) computed with the perturbed forward series, plus `"delta"` per block: score change vs baseline. Perturbations: heatwave +6 °C & +30 % ET0, drought rain=0, rain_event +25 mm over 2 days, cool_spell −5 °C & −20 % ET0.

### `GET /api/backtest?months=4`
Replays the engine day-by-day over the trailing window, **information-limited**: each day-D flag uses only data available through day D plus the forward projection the engine would have had. Example values are the engine's actual output on the deterministic demo seed:
```json
{
  "methodology": "information_limited",
  "window": ["2025-09-20", "2026-01-20"],
  "events": [
    { "date": "2025-12-04", "type": "heat_spike", "blocks_flagged": ["B5","B6","B7"],
      "lead_days": 8, "narrative": "On data available at the time, the engine projected B7 breaching its band 8 days before the 38°C spike." }
  ],
  "series": [ { "date": "2025-09-20", "farm_mean_score": 18, "blocks_out_of_band": 0 } ]
}
```

### `GET /api/briefing`
Farm-wide morning brief: array of per-block `{block_id, name, traffic, status, score, headline}` sorted by score desc, plus `farm_summary` string. On the deterministic demo seed the ranked order is **B4 too_dry 55 · B1 too_wet 48 · B2 too_dry 21 · B7 too_dry 12 · B3 on_track 11 · B6 on_track 11 · B5 on_track 8**, with `farm_summary` = "3 block(s) need water, 1 too wet, 3 on track. Peak pressure: B4 (55)." (B7's 12 reflects the seeded 12 mm rain cell two days out softening its 7-day projection, the same rain the Battle Plan skips it for.)

### `POST /api/irrigation`
Log an irrigation event so the balance reflects it: `{ "block_id": "B1", "date": "2026-01-20", "mm": 9.0 }` → `{ "ok": true }`. Persisted to `backend/app/data/irrigation_log.json`.

### `GET /api/explain/{id}` *(optional, stretch)*
Plain-English narrative for a block. If no `AI_KEY` set, return the deterministic template sentence and never fail.

---

## Provider interface (backend-internal, binding)

```python
class ClimateProvider(Protocol):
    name: str
    def get_daily(self, lat: float, lon: float, start: date, end: date) -> list[DailyWeather]: ...
    def get_forecast(self, lat: float, lon: float, days: int) -> list[DailyWeather]: ...

@dataclass
class DailyWeather:
    date: date
    et0: float          # mm
    rain: float         # mm
    tmax: float; tmin: float   # °C
    rh_mean: float | None      # %
    wind_max: float | None     # km/h
    solar: float | None        # MJ/m²
```

- `OpenMeteoProvider`: archive `https://archive-api.open-meteo.com/v1/archive`, forecast `https://api.open-meteo.com/v1/forecast`; daily vars `et0_fao_evapotranspiration, precipitation_sum, temperature_2m_max, temperature_2m_min, wind_speed_10m_max, shortwave_radiation_sum, relative_humidity_2m_mean`; `timezone=Africa/Johannesburg`. No key needed.
- `TerraClimProvider`: implements the same interface over `/api/point/`, `/api/polygon/`, `/api/nearest-station` with `Token:` header from `TERRACLIM_TOKEN`; selected automatically at startup when the env var is present. Until then it may raise `NotImplementedError` at call time but must exist with correct request shapes stubbed and documented.
- All provider calls flow through a disk cache (`backend/app/data/cache/`, key = provider+lat+lon+range+kind, TTL 6 h; archive data older than 7 days cached indefinitely).

## Demo farm (binding fixture)

`backend/app/data/blocks.geojson`: 7 polygon blocks around lon 18.855–18.885, lat −33.925 to −33.950 (Stellenbosch), each 1.5–4 ha, realistic rectangular-ish vineyard shapes, properties per the `/api/blocks` schema:

| id | name | variety | wine_style | area_ha | rate mm/h |
|---|---|---|---|---|---|
| B1 | Bosberg Cabernet | Cabernet Sauvignon | premium_red | 2.8 | 2.0 |
| B2 | Skaliekop Shiraz | Shiraz | premium_red | 3.2 | 1.8 |
| B3 | Rivierkant Merlot | Merlot | red | 2.1 | 2.2 |
| B4 | Windberg Pinotage | Pinotage | red | 1.8 | 2.0 |
| B5 | Kloofstroom Chenin | Chenin Blanc | white | 3.6 | 2.4 |
| B6 | Môrelig Sauvignon | Sauvignon Blanc | fresh_white | 2.4 | 2.4 |
| B7 | Leiwater Chardonnay | Chardonnay | white | 1.9 | 2.2 |

## Contract v2 addendum (wave 2, binding)

### A. ETa + NDVI channels (R12)

`DailyWeather` gains optional `eta: float | None` (measured actual ET, mm) and `ndvi: float | None`. When `eta` is present the balance consumes it directly; modelled `ETc×Ks` remains the forecast/gap-fill layer. `Ks` per FAO-56: `RAW = p × TAW`, `p = 0.45`; `Ks = (TAW − D)/(TAW − RAW)` when `D > RAW` else 1; `ETc_adj = ET0 × Kc × Ks`. Effective rainfall: days < 2 mm ignored; daily infiltration capped at 40 mm.
- `/api/blocks/{id}/status` gains `"eta_7d"` and `"ndvi"` drivers when data exists, plus `"transpiration_deficit_pct"` (ETa vs ETc divergence). Absent, never null-crash, when no ETa source.
- `/api/blocks/{id}/timeseries` rows gain optional `eta`, `ndvi`, and REQUIRED `kc` (the stage/NDVI-derived crop coefficient used that day, as Kc is a named checklist item in the brief and must be displayable per block per day).

### B. Stem water potential display (R3)

`/status` gains `"mswp_estimate_mpa": float` and `"mswp_band_mpa": [lo, hi]`: modelled midday stem water potential equivalent, mapped from depletion fraction per stage (mapping table in `backend/app/data/mswp_map.json`, marked modelled). UI shows MPa alongside depletion fraction.

### C. Pressure-bomb + photo validation (R13 + R17)

- `POST /api/validation/reading` `{block_id, date, mswp_mpa, note?}` → stored to `backend/app/data/validation_readings.json`; returns reading + model value that day + delta.
- `GET /api/validation/{block_id}` → `{model_series, readings[], reference_series[], agreement: {bias, rmse, n, within_band_pct}}`. `reference_series` comes from the data pack (WaPOR/FruitLook) when present, else `[]` with `"reference_source": "pending_datapack"`.
- **Photos (R17):** `POST /api/photos` multipart (`block_id`, `image`, optional `note`, `date`) → stores file under `backend/app/data/photos/` (gitignored), analyses it deterministically, returns `{photo_id, block_id, date, url, note, analysis}` where `analysis = {gli_mean, canopy_cover_pct, yellowing_pct, stress_hint: "none"|"mild"|"visible", agrees_with_model: bool}`. GLI = (2G−R−B)/(2G+R+B) over canopy pixels; canopy segmentation via HSV green threshold; yellowing via hue shift. Pillow + numpy, no ML dependency, documented as a screening heuristic (CropX/Tule-style capture, honest math).
- `GET /api/photos/{block_id}` → list, newest first. `GET /api/photos/file/{photo_id}` serves the image.
- Frontend: camera capture (`<input capture="environment">` + preview) from Field Mode and Block Detail; per-block photo gallery with analysis chips; photo GLI trend plotted on the Validation screen against model stress. Mock mode ships 2–3 bundled sample canopy photos so the flow demos offline.

### D. Settings / Data Source panel (R11)

- `GET /api/settings` → `{provider, terraclim_ready, token_status: "unset"|"set (••••1234)", cache: {entries, oldest_minutes}, as_of, datapack: {loaded: bool, path?, layers?}}`. Token value never returned.
- `POST /api/settings/provider` `{provider, token?}` → validates with one live test call before accepting; persists to gitignored `backend/app/data/settings.json`; applies without restart; on failure returns `{ok: false, error}`.
- `POST /api/settings/cache/refresh` → purge + re-warm all blocks; returns per-block ok/fail.
- `POST /api/settings/demo-date` `{as_of}` → runtime override.
- Frontend Settings screen per R11 (provider cards, write-only token, Test & Activate, cache refresh, as_of picker) + provider badge in the header.

### E. DataPackProvider (R14)

Third provider reading `backend/app/data/datapack/` (gitignored): GeoTIFF rasters (ETo/ETa/NDVI, rasterio zonal stats over block polygons) and/or CSV per-block series; manifest `datapack.json` describes layers. Missing pack → provider reports not-loaded; factory order: datapack (if loaded) → terraclim (if ready) → open-meteo → synthetic fallback. rasterio is an optional dependency (import lazily); CSV path must work without it.

### F. Traced block polygons (R10)

`blocks.geojson` polygons replaced with hand-traced, irregular, 8–20-vertex parcels following plausible terrain edges at the same Stellenbosch location (no rectangles); properties unchanged; areas recomputed from geometry. Frontend map gains satellite basemap (Esri World Imagery, OSM labels toggle) and a "Trace a block" mode (draw polygon by clicking vertices → `POST /api/blocks` `{name, variety, wine_style, application_rate_mm_h, geometry}` → persisted to blocks store, scored like any block; `DELETE /api/blocks/{id}` for user-created blocks only).

### G. Information-limited backtest (R2)

Backtest recomputed so day-D flags use only data ≤ D plus the forward projection the engine would have had; response gains `"methodology": "information_limited"` and the UI states it. Keep the event-detection narrative honest ("projected breach N days ahead").

### H. AI Insights: explain anything you click (R18)

- `POST /api/insight`: body `{ "subject_type": "...", "block_id": "B4" (when block-scoped), "subject_id": "..." (e.g. driver key, event date, plan day), "context": {...} (optional client extras, e.g. scenario type) }`. `subject_type` ∈ `block_status · score · driver · mswp · glide_path · pour_slip · battle_plan_entry · battle_plan_skip · season_bank · backtest_event · scenario_delta · photo_analysis · term`.
- Response: `{ "headline": "...", "explanation": "2-4 plain-English sentences in grower language", "facts": [{"label": "7-day ET0", "value": "6.3 mm/day"}], "caveats": ["Modelled estimate: log a pressure-bomb reading to calibrate."], "source": "template" | "ai", "subject_type": "..." }`.
- **Deterministic-first, AI-optional (non-negotiable):** the backend assembles all facts from engine state and renders the explanation from templates: always available, no key, no network. If `AI_KEY` is set, the SAME facts may be rephrased by an LLM into more natural prose (`source: "ai"`); the AI receives only the assembled facts and may not introduce numbers or claims. Any AI failure silently falls back to the template. AI never computes; it narrates.
- `GET /api/insight/glossary`: grower-language dictionary for terms (ET0, ETa, Kc, NDVI, GDD, MSWP/pressure bomb, RDI, TAW, depletion, glide path, Ks, zonal statistics…), also bundled in frontend mocks.
- Frontend: a global Insight panel (right slide-in on desktop, bottom sheet on mobile) opened by clicking any explainable element. Every subject type above gets an unobtrusive explain affordance; keyboard/scr-reader accessible; shows headline, body, facts, caveats, and a "source: engine template / AI-phrased" tag. Fully functional in mock mode.

## Conventions (all agents)

- No secrets in git; `.env.example` only. `DEMO_DATE=2026-01-20` is the default demo date.
- CORS: allow all origins in dev.
- Code style: professional, sparse comments (constraints only), no emoji, no boilerplate headers, no "AI-generated" tells. Match idiomatic FastAPI / idiomatic React-TS.
- Frontend design values (colors, spacing, radii, fonts) live in one tokens file; the team re-skins later.
- Tests must not hit the network: use a `FixtureProvider` with deterministic synthetic weather.
