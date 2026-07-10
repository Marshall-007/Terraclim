# Vino API Contract (v1)

This is the binding interface between backend and frontend. Both sides build against this document. Any change must be reflected here first.

Backend base URL: `http://localhost:8000` in dev; frontend reads `VITE_API_BASE`.
All responses are JSON. All dates are ISO `YYYY-MM-DD`. All endpoints accept an optional `as_of=YYYY-MM-DD` query param (defaults to env `DEMO_DATE`, then to today) — the engine evaluates the farm as of that date.

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

### Stress Glide Path — target depletion-fraction bands [lo, hi] per stage × style

| stage | premium_red | red | white | fresh_white |
|---|---|---|---|---|
| dormant | 0.00–0.60 | 0.00–0.60 | 0.00–0.60 | 0.00–0.60 |
| budbreak | 0.15–0.35 | 0.15–0.35 | 0.15–0.35 | 0.15–0.35 |
| flowering | 0.20–0.40 | 0.20–0.40 | 0.20–0.40 | 0.20–0.40 |
| fruit_set | 0.45–0.65 | 0.40–0.60 | 0.30–0.50 | 0.25–0.45 |
| veraison | 0.35–0.55 | 0.35–0.55 | 0.30–0.50 | 0.25–0.40 |
| harvest | 0.35–0.55 | 0.35–0.55 | 0.30–0.50 | 0.25–0.40 |
| post_harvest | 0.20–0.40 | 0.20–0.40 | 0.20–0.40 | 0.20–0.40 |

(Defaults from FAO-56 + RDI literature; `docs/research/` may refine values — engine reads them from `backend/app/data/stress_targets.json`, never hardcodes.)

### Deviation & status
- `deviation = f − hi` if `f > hi` (positive, **too_dry**); `deviation = f − lo` if `f < lo` (negative, **too_wet**); else `0` (**on_track**).
- `score` (0–100) = `min(100, round(|deviation| / 0.35 × 100))` blended with forecast pressure: `score = min(100, round(0.7×deviation_component + 0.3×forecast_component))` where forecast_component = projected |deviation| in 7 days scaled the same way.
- Traffic light: 0–25 `stable`, 26–50 `watch`, 51–75 `high`, 76–100 `critical`. Status string is independent: `on_track` / `too_dry` / `too_wet`.

### Pour Slip math
- `needed_mm = max(0, D − mid×TAW)` where `mid = (lo+hi)/2` — bring depletion back to band midpoint.
- `runtime_hours = needed_mm / application_rate_mm_h` (block property), rounded to 0.1 h.
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
```json
{
  "block_id": "B1", "as_of": "2026-01-20",
  "stage": "veraison", "gdd": 1231.5,
  "depletion_mm": 82.1, "depletion_fraction": 0.68,
  "target_band": [0.35, 0.55],
  "status": "too_dry", "deviation": 0.13, "score": 62, "traffic": "high",
  "drivers": [
    { "key": "et0_7d", "label": "7-day ET0", "value": 6.1, "unit": "mm/day", "pressure": "high" },
    { "key": "rain_7d", "label": "7-day rainfall", "value": 1.2, "unit": "mm", "pressure": "high" },
    { "key": "tmax_7d", "label": "7-day max temp", "value": 33.4, "unit": "°C", "pressure": "high" },
    { "key": "forecast_rain_3d", "label": "Rain next 3 days", "value": 0.0, "unit": "mm", "pressure": "high" }
  ],
  "recommendation": "Apply 14 mm (7.0 h drip) tonight to return to the veraison glide path.",
  "pour_slip": {
    "type": "pour", "needed_mm": 14.1, "runtime_hours": 7.0,
    "window": "tonight", "next_check": "2026-01-23", "hold_days": null
  }
}
```
For a too-wet block: `"status": "too_wet"`, `pour_slip.type = "hold"`, `needed_mm = 0`, `hold_days` set, recommendation explains dilution/vigor risk.

### `GET /api/blocks/{id}/timeseries?days=45`
```json
{
  "block_id": "B1",
  "history": [
    { "date": "2026-01-01", "et0": 5.8, "etc": 4.1, "rain": 0.0, "irrigation_mm": 0,
      "depletion_fraction": 0.51, "band_lo": 0.35, "band_hi": 0.55, "stage": "veraison" }
  ],
  "forecast": [
    { "date": "2026-01-21", "et0": 6.2, "etc": 4.3, "rain": 0.0,
      "depletion_fraction_projected": 0.71, "band_lo": 0.35, "band_hi": 0.55 }
  ]
}
```

### `POST /api/battle-plan`
Request:
```json
{ "available_hours_per_day": 6, "horizon_days": 3 }
```
Response:
```json
{
  "as_of": "2026-01-20",
  "plan": [
    { "day": "2026-01-20", "entries": [
      { "block_id": "B1", "hours": 4.5, "mm_applied": 9.0,
        "reason": "Highest glide-path deviation (too dry) in veraison; no rain forecast 5 days." }
    ]},
    { "day": "2026-01-21", "entries": [] }
  ],
  "skipped": [
    { "block_id": "B5", "reason": "12 mm rain forecast Thursday closes the deficit without irrigation." },
    { "block_id": "B3", "reason": "Currently too wet — irrigation would push it further off path." }
  ],
  "summary": "18 available hours allocated to 3 of 7 blocks; 2 blocks skipped on forecast; est. 41 m³ water saved."
}
```
Greedy scheduler: per day, rank blocks by projected too-dry deviation × stage sensitivity (fruit_set/veraison weigh double) × wine-style weight (premium_red 1.3, red 1.15, white 1.0, fresh_white 1.0); skip blocks with ≥8 mm rain forecast within 48 h; allocate hours until block reaches band midpoint or day budget exhausts.

### `GET /api/season-bank?remaining_m3=12000`
```json
{
  "as_of": "2026-01-20", "remaining_m3": 12000,
  "projected_demand_m3": 15400,
  "verdict": "shortfall", "run_dry_date": "2026-02-24",
  "days_short": 21,
  "burn_down": [ { "date": "2026-01-20", "bank_m3": 12000, "demand_to_date_m3": 0 } ],
  "advice": "Projected 3,400 m³ shortfall before harvest. Tighten white blocks to lower band edge to save ~2,100 m³."
}
```
Demand model: Σ over future days & blocks of `max(0, ETc − expected_rain) × area_m2 / 1000` restricted to keeping each block at band midpoint; forecast used for the first 14 days, stage-mean climatology after.

### `POST /api/scenario`
Request: `{ "type": "heatwave" | "drought" | "rain_event" | "cool_spell", "days": 7 }`
Response: array of per-block `status` objects (same schema as `/status`) computed with the perturbed forward series, plus `"delta"` per block: score change vs baseline. Perturbations: heatwave +6 °C & +30 % ET0, drought rain=0, rain_event +25 mm over 2 days, cool_spell −5 °C & −20 % ET0.

### `GET /api/backtest?months=4`
Replays the engine day-by-day over the trailing window (real archive data):
```json
{
  "window": ["2025-09-20", "2026-01-20"],
  "events": [
    { "date": "2025-12-04", "type": "heat_spike", "blocks_flagged": ["B1","B2","B4"],
      "lead_days": 6, "narrative": "Engine projected B1 breaching its band 6 days before the 38°C spike." }
  ],
  "series": [ { "date": "2025-09-20", "farm_mean_score": 18, "blocks_out_of_band": 0 } ]
}
```

### `GET /api/briefing`
Farm-wide morning brief: array of per-block `{block_id, name, traffic, status, score, headline}` sorted by score desc, plus `farm_summary` string.

### `POST /api/irrigation`
Log an irrigation event so the balance reflects it: `{ "block_id": "B1", "date": "2026-01-20", "mm": 9.0 }` → `{ "ok": true }`. Persisted to `backend/app/data/irrigation_log.json`.

### `GET /api/explain/{id}` *(optional, stretch)*
Plain-English narrative for a block. If no `AI_KEY` set, return the deterministic template sentence — never fail.

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

`backend/app/data/blocks.geojson` — 7 polygon blocks around lon 18.855–18.885, lat −33.925 to −33.950 (Stellenbosch), each 1.5–4 ha, realistic rectangular-ish vineyard shapes, properties per the `/api/blocks` schema:

| id | name | variety | wine_style | area_ha | rate mm/h |
|---|---|---|---|---|---|
| B1 | Bosberg Cabernet | Cabernet Sauvignon | premium_red | 2.8 | 2.0 |
| B2 | Skaliekop Shiraz | Shiraz | premium_red | 3.2 | 1.8 |
| B3 | Rivierkant Merlot | Merlot | red | 2.1 | 2.2 |
| B4 | Windberg Pinotage | Pinotage | red | 1.8 | 2.0 |
| B5 | Kloofstroom Chenin | Chenin Blanc | white | 3.6 | 2.4 |
| B6 | Môrelig Sauvignon | Sauvignon Blanc | fresh_white | 2.4 | 2.4 |
| B7 | Leiwater Chardonnay | Chardonnay | white | 1.9 | 2.2 |

## Conventions (all agents)

- No secrets in git; `.env.example` only. `DEMO_DATE=2026-01-20` is the default demo date.
- CORS: allow all origins in dev.
- Code style: professional, sparse comments (constraints only), no emoji, no boilerplate headers, no "AI-generated" tells. Match idiomatic FastAPI / idiomatic React-TS.
- Frontend design values (colors, spacing, radii, fonts) live in one tokens file — the team re-skins later.
- Tests must not hit the network: use a `FixtureProvider` with deterministic synthetic weather.
