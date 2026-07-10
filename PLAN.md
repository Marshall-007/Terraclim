# Vino — Plan of Attack

**ET-GEO Hackathon 2026 · Team Marshall + Obey**
**Tagline:** *Know when to pour.*

This document is the merged plan derived from Marshall's VineWise AI README and Obey's Vino concept pitch. It supersedes both as the source of truth for build scope. Locked decisions live at the top; open questions live at the bottom.

---

## 1. One-sentence pitch

Vino turns TerraClim climate data into a **daily irrigation prescription** for South African vineyards — deficit-irrigation-aware, forecast-driven, and delivered on the grower's phone in the field.

## 2. Why we win

The room will be full of "coloured maps + AI explanation" demos. We beat that by shipping the three things nobody else will:

1. **The Pour Slip** — an actual printable/shareable irrigation prescription (hours of drip per block, tonight), not a dashboard. This is what a foreman carries into the field.
2. **Battle Plan × 14-day forecast** — a constraint-solved multi-day irrigation order. *"You have 6 hours today. Rain lands Thursday. Here is your 3-day plan: irrigate B4 tonight, skip A2, hold C1 for Saturday's heatwave."*
3. **PWA field mode with GPS** — the grower opens the app standing in the vineyard; GPS auto-detects the block; one number on screen: **"Water 3.2h tonight."** This is the daily-use hook. A demo dashboard nobody opens twice; a phone screen a foreman opens every morning.

Underpinned by scientific credibility from Vino: proper **ETc = ET0 × Kc**, RDI-aware Kc curves for wine grapes, deterministic scoring the judges can audit.

## 3. Locked decisions

| Decision | Choice | Why |
|---|---|---|
| Project name | **Vino** | Short, wine-native, matches "Know when to pour." |
| Frontend | **React + Vite + Tailwind + Leaflet** (PWA-enabled) | Fast to build, deploys free, mobile-first via PWA. |
| Backend | **Python + FastAPI** | Water balance, forecast math, and TerraClim geo queries want pandas/geopandas/scikit-learn. Judges see scientific depth. |
| Frontend deploy | **Vercel** (or GitHub Pages) | Free tier, one-command deploy. |
| Backend deploy | **Render free tier** | Free web service, env-var config for `TERRACLIM_TOKEN`. |
| Scoring | **Deterministic engine** (Python). AI only for language explanations. | Judges must be able to trace every recommendation to a number. |
| MVP demo features | Pour Slip · Battle Plan × Forecast · PWA field mode | Everything else is roadmap. |
| Cut for MVP | Photo canopy cross-check · Full Collaboration Hub · ESG PDF export · ML gap-fill for cloudy days | Mentioned in pitch as roadmap. |

## 4. Architecture

```
                    ┌──────────────────────────────────────────┐
                    │  React + Vite PWA (Vercel)               │
                    │  - Dashboard (map, ranked blocks)        │
                    │  - Battle Plan screen                    │
                    │  - Field Mode (GPS, one-number screen)   │
                    │  - Pour Slip (printable/WhatsApp share)  │
                    └────────────┬─────────────────────────────┘
                                 │ HTTPS JSON
                    ┌────────────▼─────────────────────────────┐
                    │  FastAPI backend (Render)                │
                    │  /blocks  /score  /forecast              │
                    │  /battle-plan  /pour-slip  /explain      │
                    ├──────────────────────────────────────────┤
                    │  services/                               │
                    │   ├ terraclim_client.py  (server-side)   │
                    │   ├ water_balance.py     (ETc = ET0×Kc)  │
                    │   ├ forecast.py          (14-day)        │
                    │   ├ battle_plan.py       (constraint)    │
                    │   └ ai_explainer.py      (optional)      │
                    ├──────────────────────────────────────────┤
                    │  cache/  JSON on disk, 6h TTL            │
                    └────────────┬─────────────────────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
       TerraClim API     Open-Meteo forecast    (Optional)
       (server-side      (free, forward ET      OpenAI /
        token in env)    proxy inputs)          local LLM
```

Key rule (from both source docs): **TerraClim token never touches the browser.** All API calls proxy through FastAPI.

## 5. The water balance (deterministic core)

Per block, per day:

```
ETc     = ET0 × Kc(phenology, RDI stage)
Deficit = ETc − (rainfall + irrigation_applied)
Balance = rolling 7-day cumulative deficit
```

Where `Kc` is a stage-aware crop coefficient for wine grapes under regulated deficit irrigation. We ship a table for MVP (budbreak / flowering / veraison / harvest) — literature values, credited in the pitch.

The **Water Stress Score (0–100)** is a normalised, weighted rollup of:
- 7-day cumulative deficit (weight 40)
- Forecast 7-day deficit (weight 25)
- Temperature max pressure (weight 15)
- Wind + humidity evaporation pressure (weight 10)
- Recent trend delta (weight 10)

Traffic light: 0–25 stable · 26–50 watch · 51–75 high · 76–100 critical.

The **Pour Slip** answers deficit in real units: `runtime_hours = deficit_mm × block_area_m2 / drip_flow_L_per_h`. Growers get *hours of drip*, not an abstract score.

## 6. Battle Plan algorithm (killer feature)

**Input:** available irrigation hours per day for next N days, forecast per block, current deficit per block.

**Output:** ordered list `[(day, block, hours)]` maximising `Σ(stress_reduction × block_priority_weight)` subject to daily hour cap.

**Method for MVP:** greedy scheduler. Each morning, sort blocks by projected stress at end of horizon; assign hours to the top block until either its deficit closes or forecast rain lands; move to next block. If rain forecast within 48h for a block, defer it. Fast, explainable, demo-friendly.

Post-MVP: swap greedy for a small MILP (PuLP) for provable optimality — mention in the pitch as roadmap.

## 7. Repo layout

```
Terraclim/
├── PLAN.md                  ← this file
├── README.md                ← public-facing, written last
├── frontend/                (React + Vite PWA)
│   ├── src/
│   │   ├── components/{Map,BlockList,BlockDetail,BattlePlan,FieldMode,PourSlip}
│   │   ├── pages/{Dashboard,Simulator,Field}
│   │   ├── services/api.ts
│   │   ├── utils/formatting.ts
│   │   └── pwa/manifest.json
│   └── vite.config.ts
├── backend/                 (FastAPI)
│   ├── app/
│   │   ├── main.py
│   │   ├── routes/{health,blocks,score,forecast,battle_plan,pour_slip,explain}.py
│   │   ├── services/{terraclim_client,water_balance,forecast,battle_plan,ai_explainer,cache}.py
│   │   └── models/{block,score,slip,plan}.py
│   ├── data/
│   │   ├── sample_blocks.geojson
│   │   ├── kc_curves.json
│   │   └── cache/
│   ├── requirements.txt
│   └── .env.example
└── docs/
    └── demo_script.md
```

## 8. Day-by-day build

### Day 1 — Foundations
- Scaffold `frontend/` (Vite React TS) and `backend/` (FastAPI + uv/poetry).
- Sample vineyard `sample_blocks.geojson` (5–8 blocks, real Western Cape coords).
- Leaflet map rendering blocks with placeholder colours.
- FastAPI `/health` and `/blocks` (returns sample GeoJSON).
- `terraclim_client.py` with disk cache; test one `/api/point/` call end-to-end.
- Deploy skeleton to Vercel + Render (fail fast on deploy issues).

### Day 2 — Water balance + scoring
- `water_balance.py` implementing ETc = ET0 × Kc with stage-aware Kc.
- `score.py` deterministic engine returning score 0–100 + driver breakdown.
- `/score/{block_id}` endpoint.
- Frontend: traffic-light block colouring, ranked block list, block detail panel with driver bars.
- Wire TerraClim polygon queries to real block polygons; caching verified.

### Day 3 — Forecast + Battle Plan + Pour Slip
- `forecast.py` pulling Open-Meteo 14-day for each block centroid; project ETc forward.
- `battle_plan.py` greedy scheduler; `/battle-plan` endpoint accepting `available_hours_per_day`.
- Battle Plan screen: user enters hours, sees prioritised multi-day plan with reasons.
- **Pour Slip** endpoint + printable component (`hours × deficit × drip rate`), WhatsApp share link.
- Optional AI explainer wired in for one plain-English sentence per block.

### Day 4 — Field mode PWA + polish + demo
- PWA manifest + service worker; installable to phone home screen.
- Field Mode page: `navigator.geolocation`, point-in-polygon match against blocks, one-number display.
- Offline fallback: cache last recommendation per block.
- Polish (Tailwind pass, empty states, error handling).
- Record demo screencast; write `docs/demo_script.md` (10 beats).
- Final deploy verify; README written.

## 9. Demo script (10 beats, ~4 min)

1. Open Vino on desktop → farm map, colour-coded blocks. Point out one **red critical** block.
2. Click Block B4 → Water Stress Score 82 · driver breakdown · plain-English reason.
3. "But growers aren't at desks." → Switch to phone view (Field Mode). Show one-number screen: **"B4 · Pour 3.2h tonight."**
4. Back to desktop → open **Battle Plan** → enter *"I only have 6 hours today."*
5. Show output: 3-day optimised plan, with each choice justified against the forecast.
6. Point out: rain forecast in 3 days meant we *skipped* A2 — saved water and time.
7. Click Pour Slip on B4 → printable prescription with drip runtime. Show WhatsApp share.
8. Open Scenario Simulator → apply heatwave → watch scores re-rank live.
9. Close on differentiation: "Others built a map viewer. We built a decision engine on TerraClim's own data — forecast, battle plan, and a phone-first prescription."
10. Value slide: what's missing today (retrospective ET · generic models · desk tools) vs what Vino ships (forward-looking · RDI-aware · in-field). Roadmap: photo cross-check · ESG report · ML gap-fill.

## 10. Open questions (Day 0 asks for TerraClim)

- **API access shape**: live REST vs static data dump for hackathon day?
- **Sample block polygons**: do they have canonical Western Cape vineyard boundaries we should use?
- **Kc / crop coefficient values**: is there a TerraClim-approved reference table for South African wine regions?
- **Rate limits during hackathon**: does the 50/day sustained limit apply per team? Can we get a raised quota for the demo day?
- **Forecast layer**: does TerraClim expose forward-looking ET0, or do we lean on Open-Meteo?

## 11. Roles (for team confirmation)

| Role | Owner | Scope |
|---|---|---|
| Backend + data + water balance | Obey | FastAPI, TerraClim client, water_balance.py, forecast.py, battle_plan.py |
| Frontend + PWA + UX | Marshall | React app, map, block panels, Battle Plan UI, Field Mode PWA, Pour Slip |
| AI explainer + demo polish | Shared | Optional AI layer, demo screencast, pitch deck |
| Viticulture liaison | TBD | Confirm Kc values and RDI phenology; validate scoring weights |

## 12. Non-negotiable rules (inherited)

- TerraClim token stays in backend env vars. Never in frontend, never in git.
- All TerraClim calls proxy through FastAPI. Cache everything (6h TTL default).
- Scoring is deterministic. AI writes English only, never numbers.
- No `.env` committed. `.env.example` only.
- Every recommendation is auditable: score → drivers → prescription.

## 13. Success criteria for the demo

- One phone screen showing a real, correct number for a real block.
- One desktop plan showing a multi-day, forecast-aware, constraint-solved schedule.
- One printable prescription that looks like something a foreman would carry.
- Zero exposed tokens. All data flowing through the backend. Cache working under repeat clicks.

---

*Ready to scaffold once roles and Day 0 questions confirmed.*
