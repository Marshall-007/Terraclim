# Vino: Brief Gap Matrix & Hackathon-Readiness Audit

**Auditor pass:** 2026-07-10 · read-only against working tree at commit `9d5d623` (WIP wave-2).
**Scope:** OFFICIAL BRIEF (`docs/BRIEF.md`) vs. what the repo actually contains today.
**Classification key:**
- **Done**: working code, exercised end to end (backend route + engine + a screen that renders it).
- **In-flight**: the v1/v2 contract fully specifies it and part of the plumbing exists, but it is not yet demoable end to end. Not "missing," but not shippable today.
- **Contracted-only**: the contract/types/mocks describe it; no working route or screen exists.
- **MISSING**: not built and not (or only loosely) specified; a real hole.

> **Moving target: read this.** Wave-2 agents are editing the tree live *during this audit*. Between the first and second pass, `providers/datapack.py`, `routes/photos.py`, `engine/photo_analysis.py`, a satellite basemap + trace tool in `BlockMap.tsx`, and `EtChart.tsx`/`NdviSparkline.tsx` all appeared. Classifications below are as of the second pass; several "Contracted-only" items are actively becoming "In-flight." Re-verify wiring before the demo: much of the new code is **present but not yet reachable** (unregistered routers, unimported components).

**Snapshot facts that anchor every judgement below:**
- Backend test suite: `20 passed` offline (`VINO_FORCE_FIXTURE=1 pytest`). Solid for what exists; nothing yet covers the wave-2 endpoints.
- Backend routes registered in `main.py`: `health, blocks, battle_plan, season_bank, scenario, backtest, briefing, irrigation, explain`. **`routes/photos.py` exists but is NOT registered in `main.py` → unreachable.** Still absent entirely: `validation`, `settings`, and `POST/DELETE /api/blocks`.
- Providers: `datapack.py` now exists **and is wired into `factory._select_primary`** with the full order datapack → terraclim → open-meteo → synthetic. Not yet exercised against a real pack (CSV/raster read path unverified).
- Frontend screens present: `Dashboard, FieldMode, BattlePlan, SeasonBank, PourSlips, Scenario, Backtest, BlockDetail`. **Absent:** `Validate`, `Settings`. New `EtChart.tsx`/`NdviSparkline.tsx` components exist but are **imported by no screen**.
- `BlockMap.tsx` now has an **Esri satellite basemap (default) + streets toggle** and a **working trace-a-block tool** (TraceClicks/TracePreview/TraceForm). But the seven fixture blocks in `blocks.geojson` are **still 5-vertex rectangles** (unchanged), so the "real parcels" claim isn't true for the demo farm yet.
- ETa/NDVI/Ks/MSWP are plumbed in the **engine** but ETa/NDVI still have **no verified live data source** (mock/fixture until the pack is read) and **MSWP + Kc render nowhere in the shipped UI**.
- **No root README, no one-command run**, yet `JUDGE_QA.md` and `PLAN.md` both assert "one-command run" as if it exists (doc over-claim).

---

## PART 1: THE MATRIX (judged requirements)

| Requirement (brief) | Status | Evidence | Risk to score | What makes it bulletproof |
|---|---|---|---|---|
| **1. Field/day dashboard: ETo, ETa, Kc, NDVI at block level, per day** | **In-flight (actively landing)** | Engine carries all four: `water_balance.py` (etc, eta, ndvi), `blocks.py` timeseries emits `eta`/`ndvi`; drivers in `scoring.build_measured_drivers`. New `EtChart.tsx` + `NdviSparkline.tsx` components just appeared **but are imported by no screen yet**. Shipped `BlockDetail.tsx` still shows ETa/NDVI only as *7-day driver bars*; **Kc is rendered nowhere**; ETa/NDVI values are mock/fixture until the pack is read. | **HIGH**: brief's literal checklist (line 25). Right now a judge opening a block sees depletion + driver bars, not the four named channels per day. | Wire `EtChart`/`NdviSparkline` into a per-day panel on Block Detail listing ETo, ETa, Kc, NDVI for the selected day; label ETa "measured (data pack)" vs Kc/ETc "modelled." |
| **2. Recommendation engine: irrigate / hold / review + how much** | **Done** | `scoring.build_pour_slip` + `scoring.recommendation`; `PourSlips.tsx` renders "POUR x.x h tonight (mm)" and "HOLD: soil is wet (n days)". Pour-slip math (needed_mm to band midpoint, runtime_hours) contracted & implemented. | **LOW**: strongest pillar. Only nit: "review" state from the brief is folded into too-wet/hold; no explicit third "review" verb. | Add an explicit "review" outcome for near-band/uncertain blocks so all three brief verbs (irrigate/hold/review) are literally on screen. |
| **3. Stress alerts: rank blocks by depletion; surface toward-stress** | **Done (with caveat)** | `/api/briefing` sorts blocks by `score` desc; `Dashboard.tsx` "Ranked by pressure" list + traffic lights + map. | **MED**: ranks by *blended score* (deviation + 7-day forecast pressure), not raw depletion fraction as the brief words it. Defensible but a literalist judge may ask. | Add a depletion-fraction column and let the user sort by it; state "ranked by projected stress (depletion + 7-day pressure)" so the ranking key is explicit. |
| **4. Validation view: WaPOR/FruitLook + stem-water-potential (pressure-bomb) visible** | **Contracted-only** | Contract v2 §C fully specifies `/api/validation/*`, `/api/photos/*`; frontend `types/api.ts` + `mocks.ts` have `BlockValidation`, `ValidationReading`, `BlockPhoto`. **No backend route, no `Validate` screen exists.** Backtest lives on its own screen, not as the "would it have caught it" tab of a validation view. | **CRITICAL**: brief-core feature #4 AND Prof. van Niekerk's centrepiece. Demo script Beat 4 is written against a screen that does not exist. If demoed cold today, Beat 4 breaks. | Build `GET/POST /api/validation`, a `Validate` screen (model vs WaPOR/FruitLook reference series + logged MPa readings + agreement stats), fold the backtest in as a tab. Reference series `[]` with `reference_source:"pending_datapack"` until pack lands, honest and non-crashing. |

## THE MATRIX (judging criteria)

| Criterion (judge) | Status | Evidence | Risk to score | What makes it bulletproof |
|---|---|---|---|---|
| **Usefulness** (Dr Southey) | **In-flight** | Recommendation + battle plan + season bank are genuinely grower-useful; but MSWP (MPa), the unit growers actually manage RDI in, is computed backend (`mswp.py`, `mswp_map.json`) and **shown nowhere** in the UI. Depletion-fraction 0.00–1.00 is data-science-speak. | **HIGH** | Render `mswp_estimate_mpa` + `mswp_band_mpa` on Block Detail and the glide-path chart next to depletion fraction. This is the single cheapest grower-trust win in the repo. |
| **Validation** (van Niekerk) | **Contracted-only** | See brief-core #4. Backtest exists but over-claims (below). No pressure-bomb entry, no WaPOR/FruitLook overlay in UI. | **CRITICAL** | Same as brief-core #4 fix + honest uncertainty labelling. |
| **Interface clarity** (Mbulelo) | **Done** | 8 screens, clean React-TS, tokens file, PWA, demo-data fallback badge, responsive map with too-wet hatch. Real polish. | **LOW** | Add the two missing nav items (Validate, Settings) so the IA matches the pitch. |
| **Working prototype quality** | **Done** | Deterministic engine, 20 passing tests, resilient provider with synthetic fallback (never error-screens), golden cache present. | **LOW–MED** | Add tests for the v2 endpoints once built; no frontend tests exist at all. |
| **Scientific credibility** (van Niekerk) | **In-flight** | FAO-56 Ks + effective-rain cap implemented (`water_balance.py`); constants sourced in `docs/research/` with citation tiers. BUT backtest is NOT information-limited (no `methodology` field; frontend subtitle over-claims, see below); MSWP mapping marked modelled but invisible. | **HIGH** | Emit `"methodology":"information_limited"`, fix the backtest copy, surface modelled-vs-measured labels in UI. |
| **Handover-readiness** (Mbulelo) | **In-flight** | `backend/README.md` is good; both `.env.example` files exist; layout documented. BUT **no root README**, **no one-command run** (no compose/Makefile), no architecture diagram, no deploy story beyond the Pages workflow. | **HIGH** | Root README + `make dev` (or docker-compose) that boots backend+frontend together; short architecture doc. |
| **"Path to a real TerraClim product"** | **In-flight** | Provider seam is clean; `TerraClimProvider` + `DataPackProvider` are the intended path but the former is a stub and the latter does not exist. | **MED** | Land `DataPackProvider` (even CSV-only) so the seam is demonstrably real, not just described. |

## THE MATRIX (contract v2 addenda: the "in-flight" surface)

| Contract item | Status | Evidence | Risk |
|---|---|---|---|
| §A ETa + NDVI channels (R12) | **In-flight** | Engine done; charts (`EtChart`/`NdviSparkline`) landed but unwired; no live source; Kc not rendered. | HIGH (feeds brief #1) |
| §B MSWP display (R3) | **In-flight** | Backend done (`mswp.py`); **frontend renders nothing**. | HIGH (feeds usefulness) |
| §C Validation + photos (R13/R17) | **Split: photos In-flight, Validation Contracted-only** | `routes/photos.py` + `engine/photo_analysis.py` + `data/photos/` landed **but photos router NOT in `main.py` → unreachable**. `/api/validation` route and the `Validate` screen still do not exist. | CRITICAL (brief #4 = the Validation screen, still vapor) |
| §D Settings / data-source panel (R11) | **Contracted-only** | Types only; no route, no screen; header provider badge absent. | HIGH (demo "flip to TerraClim" moment depends on it) |
| §E DataPackProvider (R14) | **In-flight** | `providers/datapack.py` now exists **and wired into `factory._select_primary`** (order datapack→terraclim→open-meteo→synthetic). Read path (CSV/GeoTIFF) unverified against a real pack; no `Load data pack` settings action. | HIGH (the 10 m pack's door: seam real, ingestion unproven) |
| §F Traced polygons + satellite + trace tool (R10) | **In-flight (satellite+trace done, polygons not)** | `BlockMap.tsx` now has Esri satellite basemap (default) + streets toggle + a working trace tool (TraceClicks/TraceForm). BUT `blocks.geojson` is **still 5-vertex rectangles**; `POST/DELETE /api/blocks` not in `main.py`-registered `blocks.py` (trace save target unverified). Test `test_blocks_returns_seven_real_polygons` is misleadingly named. | MED |
| §G Information-limited backtest (R2) | **Contracted-only** | Lead-day projection logic exists in `backtest.py`, but no `methodology` field and the UI subtitle asserts hindsight-flavoured certainty, while `JUDGE_QA`/`PLAN`/`PITCH` all now promise "information-limited." Doc-vs-code mismatch. | HIGH (one Q&A question collapses the proof pillar) |

---

## PART 2: ASSESSMENTS

### 2.1 The four brief-core features: demoable in 5 minutes from cold start?

1. **Field/day dashboard (ETo/ETa/Kc/NDVI).** *Partially.* The dashboard, map, ranked list and block panel render from a cold `uvicorn` + `vite dev`. But the **exact four-channel per-day view the brief names does not exist as such**. ETa/NDVI are 7-day driver bars, Kc is absent, and the ETa numbers are synthetic until the pack. **What breaks first:** a judge asks "show me ETa and Kc for this block today" and there is no single place that answers.
2. **Recommendation engine.** *Yes.* Cold-start clean. Pour/hold slips render with hours + mm. The seeded 28 mm over-irrigation on B1 makes the too-wet Hold Slip deterministic (R6). This is the demo's safest beat.
3. **Stress alerts.** *Yes.* Briefing ranks and colours blocks immediately. Minor wording risk on "depletion" vs "score."
4. **Validation view.** *No.* **This screen does not exist.** The demo script's Beat 4 (WaPOR/FruitLook overlay, pressure-bomb entry, photo GLI, agreement stats) has no UI or endpoint behind it. This is the biggest cold-start demo hole.

**Net:** two of four are demo-solid today; #1 is half-there; #4 is a scripted beat with nothing behind it.

### 2.2 ETa framing: defensible on Day 0 before the pack arrives?

Our engine models **ETc = ET0 × Kc × Ks** and *accepts* measured **ETa** via `DailyWeather.eta` (consumed directly in the balance when present; ETc×Ks is the forecast/gap-fill layer). The brief centres on TerraClim's **random-forest ETa**. This framing is **defensible** (it is exactly the right architecture: their measured ETa anchors history, our model projects forward) but only if the demo says so explicitly and honestly. **The demo MUST say:** "ETa is TerraClim's measured actual ET from the data pack; our ETc×Ks is the modelled/forecast layer that fills the gap ahead of the satellite. Where the two diverge (ETa below ETc), that's the vine already throttling, and we surface it as a stress driver (`transpiration_deficit_pct`)." **What is NOT ready:** before the pack, every ETa/NDVI number on screen is synthetic (mock/fixture). If the demo shows ETa without stating its source, a judge who knows the pack hasn't been ingested will catch it. The honest line is mandatory; the code supports it (`build_measured_drivers` omits ETa cleanly when no source exists).

### 2.3 Handover-readiness (Mbulelo): rated as a judge would

| Item | Rating | Note |
|---|---|---|
| README quality | **6/10** | `backend/README.md` is genuinely good (run, config table, providers, tests). **No root README** and no frontend README. A judge cloning the repo has no single "start here." |
| One-command run | **2/10** | Two manual sequences (venv+uvicorn, npm+vite). No `make dev`, no docker-compose. This is the weakest handover item. |
| `.env.example` | **8/10** | Present both sides, documented, no secrets. Good. |
| Architecture clarity | **5/10** | Provider seam + engine layout are clean and the README lists modules, but there's no diagram and the data-flow (provider → balance → status → slip) lives only in prose. |
| Test suite | **6/10** | 20 backend tests, deterministic, offline. But **zero frontend tests** and nothing covering the v2 endpoints (they don't exist yet). |
| Deploy story | **5/10** | GitHub Pages workflow for the frontend only; no backend deploy/hosting story; branch trigger references a feature branch. |

**Handover verdict: middling.** The bones are professional but the "clone and run in one command" experience (the thing Mbulelo will literally try) is not there.

### 2.4 Scientific credibility (Prof. van Niekerk): rated

- **Citations present:** *Yes, strong.* `docs/research/sources.md` + `calibrated_constants.md` cite FAO-56 (Allen 1998), Matthews & Anderson 1988, Chapman 2005, Williams (UC ANR), with peer-reviewed/extension tiers and star-ranked name-drops. Above hackathon norm.
- **Constants sourced:** *Yes.* Kc, variety factors, GDD thresholds, `p=0.45`, stress bands all documented with confidence tags; engine reads them from JSON, never hardcodes (verified `stress_targets.json`, `kc_curves.json`, `mswp_map.json`).
- **Honest uncertainty labelling (modelled vs measured):** *Weak in the UI.* The MSWP map is *marked* modelled in `mswp_map.json`, but MSWP renders nowhere; ETa "measured" vs ETc "modelled" is not visually distinguished on any screen. The data is honest; the interface doesn't yet carry the honesty.
- **Info-limited backtest:** **Not implemented as claimed.** `backtest.py` computes a forward-projection lead but emits no `"methodology":"information_limited"` and still replays archived actuals; the frontend subtitle reads *"Every heat spike was flagged before it hit: this is the proof, not a promise,"* which is exactly the hindsight over-claim R2 warned against. **This is the single most likely credibility question to land.**

**Credibility verdict: strong research foundation undercut by two UI-level honesty gaps** (invisible modelled/measured labels; over-claiming backtest copy).

### 2.5 Grower usefulness (Dr Southey): would a viticulturist trust each screen?

- **Dashboard / Block Detail:** Useful, but speaks **depletion fraction (0.00–1.00)**, a unit no grower uses. The MPa translation exists in the backend and is hidden. **Fix the language: lead with MPa, keep fraction secondary.**
- **Pour Slips:** Excellent grower-speak: "POUR 3.2 h tonight," "HOLD: soil is wet." This is how a grower thinks. Trustworthy.
- **Battle Plan / Water Bank:** Genuinely useful triage/rationing framing; "skips a block because rain is coming" is a strong trust moment. Grower-credible.
- **Backtest:** Framed as "proof" with over-confident copy. A viticulturist is exactly who'll say "you had the actuals already." Reframe as "replayed on archived weather; here's the lead our forecast layer would have given."
- **Data-science-speak to scrub:** "depletion fraction" (→ MPa + "soil water deficit"), "deviation/score" (→ "days off the glide path" / plain risk words), "transpiration deficit %" (→ "vines using X% less water than expected"). Driver keys like `et0_7d` are fine as labels but "ET0" should be glossed once as "reference ET."

**Usefulness verdict: the action screens (slips, plan, bank) are grower-ready; the science screens lean data-science and hide the one unit (MPa) that would earn a viticulturist's trust.**

### 2.6 The 10 m raster reality: what's NOT ready to consume the pack same-day

When the pack lands (10 m daily ETo surfaces + Sentinel-2 NDVI + Kc/phenology + RF ETa), here is what is **not** ready and the concrete Day-0 steps:

| Gap | Day-0 step | Est. |
|---|---|---|
| **`DataPackProvider` read path unverified** (§E now exists + wired) | Confirm `datapack.py` actually parses the pack's real CSV/GeoTIFF/manifest shape (decided on Day 0 when the pack is seen); add a fixture pack to test against. | 1–3 h |
| **No raster zonal stats verified** | Confirm rasterio+shapely zonal mean over block polygons for GeoTIFF ETo/ETa/NDVI; lazy import so CSV path works without rasterio. | 2–4 h |
| **Blocks are still rectangles** | Zonal stats over 5-vertex boxes average the wrong pixels; replace `blocks.geojson` fixtures with traced polygons (the trace tool + satellite already exist) or the 10 m precision is wasted. | 1–3 h |
| **No ETa/NDVI live wiring test** | The engine consumes `eta`/`ndvi` already, but nothing has fed it real values; integration check once the provider reads a real pack. | 1 h |
| **No settings "Load data pack"** (§D/§E) | `/api/settings` + a `Settings` screen don't exist; without them it's an env/restart, not the promised live switch/badge flip. | 2–3 h |
| **Per-day ETo/ETa/Kc/NDVI panel unwired** | `EtChart`/`NdviSparkline` exist; wire them into Block Detail so the pack's headline deliverable has a UI home. | 1–2 h |

**Reality check:** the *provider seam is now real* (`datapack.py` wired into the factory), a genuine improvement since the first pass. What remains for same-day ingestion: verifying the actual file-parse against the real pack shape, replacing the rectangle fixtures with real polygons, wiring the ETo/ETa/Kc/NDVI panel, and the Settings "load pack" control. Still roughly **most of a build day**, but the hardest architectural piece (the provider) has landed.

### 2.7 Top 5 point-losing gaps (ranked) with cheapest credible fix

1. **Validation view still does not exist (brief-core #4 + van Niekerk's centrepiece).** No `/api/validation` route, no `Validate` screen. The one wave-2 piece that landed here (photos) isn't even registered in `main.py`. *Cheapest fix:* stand up `GET/POST /api/validation` returning model series + `reference_source:"pending_datapack"` + a logged-readings list, and a single `Validate` screen overlaying model vs readings with bias/RMSE. Fold the existing backtest in as a tab. Register the photos router while you're there. Half a day; converts a scripted vapor-beat into a real one.
2. **MSWP (MPa) is computed but invisible + backtest over-claims (and docs now promise "information-limited").** *Cheapest fix:* render `mswp_estimate_mpa`/`mswp_band_mpa` on Block Detail (~1 h) and rewrite the backtest subtitle + add `"methodology":"information_limited"` to the response (~1 h). Two hours buys back both the usefulness (Southey) and credibility (van Niekerk) hits and closes the doc-vs-code gap.
3. **ETo/ETa/Kc/NDVI per-day panel unwired: the brief's literal checklist.** The chart components exist; nothing shows them. *Cheapest fix:* import `EtChart`/`NdviSparkline` into a per-day panel on Block Detail, labelled measured vs modelled. Reuse `ev.balance`. ~1–2 h.
4. **No one-command run / no root README, and `JUDGE_QA`/`PLAN` claim it exists (handover, Mbulelo).** *Cheapest fix:* root `README.md` + a `make dev` or `docker-compose.yml` that boots both services. ~2 h; directly targets the criterion Mbulelo will test by hand, and stops a doc over-claim from backfiring.
5. **Fixture blocks are still 5-vertex rectangles while the satellite basemap + trace tool now render around them.** The mismatch is now *visible* (real satellite imagery under toy rectangles) and rectangles also waste the 10 m pack's precision. *Cheapest fix:* retrace the seven blocks with the tool that already exists (or hand-edit `blocks.geojson` to 8–20 vertices) and verify `POST /api/blocks` is registered so saved traces persist. ~1–3 h.

*(Dropped from the top 5 since the first pass: `DataPackProvider`. It has now landed and is wired into the factory, so it's in-flight rather than a hole. Verify its real-pack read path on Day 0.)*

---

## OVERALL READINESS VERDICT

**A polished, scientifically-grounded engine with two of four brief-core features demo-solid and wave-2 visibly closing gaps by the hour (DataPackProvider wired, satellite + trace tool landed, ET/NDVI charts and the photo backend written), but the pieces that decide the score are still not reachable: the Validation view (brief-core #4, van Niekerk's centrepiece) has no screen, the grower's own unit (MPa) renders nowhere, the backtest over-claims while the rewritten docs now promise "information-limited," and there's no one-command run despite the docs asserting one. The docs are excellent and honest; the wired UI hasn't caught up. As of this pass it would demo strongly for ~3 minutes and lose points precisely where the brief and the three judges concentrate them. The fixes are mostly hours, not days, but they must be wired and rehearsed, not just committed.**
