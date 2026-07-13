# Vino: Revision Set (post red-team)

Accepted changes from the red-team review (`docs/RED_TEAM.md`), to be applied to the contract, engine, frontend, and pitch once the research and build agents land. Ordered by severity.

## R1: TerraClim central, not a fallback (CRITICAL)

**Problem:** App defaults to Open-Meteo with TerraClim "drop-in via env var." On TerraClim's own hackathon this reads as ignoring the host. Also, TerraClim is a terrain-adjusted climatology/history/terrain platform (Stellenbosch CGA / Winetech). It almost certainly does **not** serve a 14-day forecast, so "one env var flips the whole app" is false and a judge will catch it.

**Fix: reframe the architecture as complementary, not swappable:**
- **TerraClim = the foundation layer:** terrain-adjusted historical climate surface, long-term normals, bioclimatic indices, polygon zonal statistics, terrain (slope/aspect/elevation). This answers *where each block sits* in climate and terrain space, the ground truth Open-Meteo's coarse grid cannot give.
- **Forecast provider (Open-Meteo) = the forward layer:** the 14-day outlook TerraClim does not forecast. Explicitly a different job.
- New honest pitch line: *"TerraClim tells us the terrain-precise climate of every block and its historical normal. We add the forward-looking decision layer on top. TerraClim is where each block is; we are where it's heading."*
- **Kill** the "one env var flips the whole app to your data" claim everywhere (PITCH, DEMO_SCRIPT, PLAN). Replace with: TerraClim replaces the historical/climatology + terrain layers and adds zonal stats; the forecast layer stays a forecast feed by design.
- **UI:** put a TerraClim-shaped element on screen (a terrain/normals panel per block and polygon zonal-stats framing) so TerraClim is visibly central even while the token is pending (use realistic placeholder normals, labelled as such, until the token lands).

## R2: Information-limited backtest (HIGH)

**Problem:** Running "as of 20 Jan 2026," the backtest replays archived actuals as if they were foreknowledge. "Flagged the heat spike 6 days early" is hindsight; one question collapses the proof pillar.

**Fix:** Make the backtest information-limited. At each simulated decision-day D, feed the engine only data through D, project forward using the forecast-style model, and record whether the projection breached the band *before* the actual event occurred. If a true forecast series isn't available historically, disclose plainly in the UI ("replayed on archived weather; live forecast skill shown separately"). No silent hindsight.

## R3: Speak the grower's language: stem water potential (HIGH)

**Problem:** Viticulturists manage RDI by midday stem water potential (MSWP, pressure bomb in MPa), not "depletion fraction 0.45–0.65", a unit no grower uses.

**Fix:** Display an MSWP-equivalent band (MPa) alongside the depletion fraction on the block detail and glide-path chart. Provide a documented mapping from depletion fraction → approximate MSWP by stage (from literature; mark as modelled). Add a calibration hook: *"Give us one pressure-bomb reading and we anchor the model to your block."* Turns the #1 "well actually" into a credibility feature.

## R4: FAO-56 correctness: stress coefficient + effective rainfall (HIGH)

**Problem:** Water balance uses `ETc = ET0 × Kc` with no soil-water stress coefficient `Ks`, so actual ET (and depletion) is over-estimated exactly during the heat events the demo brags about catching. No effective-rainfall/runoff cap either.

**Fix:**
- Add FAO-56 `Ks`: when depletion `D` exceeds the readily-available water `RAW = p × TAW`, `Ks = (TAW − D) / (TAW − RAW)`, else `Ks = 1`. Use `ETc_adj = ET0 × Kc × Ks`. Depletion field factor `p ≈ 0.45` for grapes (from research agent).
- Cap effective rainfall: ignore <2 mm days (evaporates), and cap daily infiltration at a runoff threshold.
- Document `RAW`, `p`, `TAW` as calibratable, sourced values, not magic numbers.

## R5: Calibrate phenology to a real Stellenbosch season (HIGH)

**Problem:** GDD thresholds look ~35% high for Cabernet; blocks may land on the wrong stage for the demo date, undermining every downstream number.

**Fix:** Adopt the research agent's calibrated GDD thresholds and variety factors. Validate that on `DEMO_DATE=2026-01-20` each of the 7 blocks lands on a plausible stage against a real Cape phenology calendar (mid-late January ≈ veraison for most, approaching harvest for early varieties). Adjust `stress_targets.json` bands accordingly.

## R6: Guarantee the too-wet money shot (HIGH)

**Problem:** The whole differentiation rests on at least one block reading `too_wet`; if data doesn't produce it, the demo's climax is gone.

**Fix:** Seed the irrigation log with a realistic over-irrigation event on one premium-red block (e.g. B1 Bosberg Cabernet: 28 mm applied recently) so it deterministically reads `too_wet` on the demo date and produces a Hold Slip. This is a real event through the live engine, not a mock. Document it as a demo fixture.

## R7: Fix contract inconsistencies (MEDIUM)

**Problem:** The score formula is stated two inconsistent ways in the contract; several constants (0.35 divisor, 0.7/0.3 blend, ×2 stage weights) are unsourced.

**Fix:** State the score formula once, unambiguously. Document each constant with a rationale or mark it a tunable heuristic. Keep it deterministic and auditable.

## R8: Demo hardening (HIGH, ops)

**Fix:**
- Serve the demo from a pre-warmed "golden cache" so the network can be unplugged.
- Field Mode: manual/simulated location picker as the primary demo path (GPS won't place you in a Stellenbosch vineyard from the venue).
- Pre-cache OpenStreetMap tiles for the farm extent so a blank grey map is impossible.
- Keep the frontend mock fallback (already built) as the last line of defence.

## R9: Positioning of "so what" (MEDIUM)

**Fix:** Position Vino as farm-wide triage and seasonal water rationing that sits *above* spot measurements, not a replacement for a consultant or a pressure bomb. A pressure bomb reads one vine today; Vino ranks 40 blocks and plans the season. Fold into PITCH and JUDGE_QA.

## R10: Real traced block boundaries, not rectangles (HIGH, product)

**Requirement (from Marshall):** "Trace out the areas on the map, not just draw squares or shapes." Blocks must look and behave like real vineyard parcels, and this directly showcases TerraClim's polygon zonal-statistics capability (query a real field outline, not a bounding box).

**Fix: three parts:**
1. **Satellite/aerial basemap.** Replace plain OSM streets with satellite imagery (Esri World Imagery tiles, free, no key) so the actual vine rows and field edges are visible. Keep an OSM/label overlay toggle. Pre-cache the farm-extent tiles for offline demo (R8).
2. **Real irregular polygons.** Replace the axis-aligned rectangle fixtures with hand-traced, many-vertex polygons that follow plausible real boundaries (roads, contours, tree lines, dam edges) around a real Stellenbosch estate location. No 4-point rectangles. Each block a believable parcel shape. Recompute centroid/area from the true polygon.
3. **In-app tracing tool.** Add a "Trace a block" mode (Leaflet-Geoman or Leaflet.draw) so a grower clicks vertices over the satellite image to draw a real field outline; the app computes area + centroid and requests climate for that exact polygon, the same zonal-statistics flow TerraClim's `/api/polygon/` provides. Persist drawn blocks. This makes the map a working tool, not a static picture, and demonstrates the TerraClim polygon capability live.

**Pitch tie-in:** "We don't approximate a block with a rectangle. We trace the real parcel and pull climate for that exact geometry, which is exactly what TerraClim's polygon zonal statistics are built for."

## R11: In-app Data Source control panel (HIGH, product, from Marshall)

**Requirement:** Run on the free API now; on hackathon Day 0 switch to TerraClim from inside the app (no code changes, no redeploy). A settings dashboard controls the data layer.

**Fix: a Settings / Data Source screen + backend support:**
1. **Backend endpoints:**
   - `GET /api/settings` → current provider, TerraClim readiness, token status (**masked**, e.g. `"token": "set (••••1234)"`, never the value), cache stats (entries, age), active `as_of` date.
   - `POST /api/settings/provider` → `{ "provider": "terraclim" | "open-meteo", "token": "..." (optional) }`. Validates the token with one live test call before accepting; persists server-side to `backend/app/data/settings.json` (gitignored) and applies without restart. On failure returns the provider's error so we can debug live at the venue.
   - `POST /api/settings/cache/refresh` → purge + re-warm the golden cache for all blocks (the "Day 0 button": flip provider, press once, whole app now runs on TerraClim data).
   - `POST /api/settings/demo-date` → set `as_of` at runtime (demo control, no env edit).
2. **Frontend Settings screen:** provider cards (Open-Meteo "active" / TerraClim "ready, needs token"), masked token input, Test & Activate button with live status feedback, cache refresh button, as_of date picker, and a data-freshness readout. Small provider badge in the app header so judges can see "Data: TerraClim" during the demo.
3. **Security rules:** token is write-only from the UI; never echoed back, never stored in frontend state/localStorage, never in git (settings.json gitignored). All climate calls stay backend-side as before.

**Demo tie-in:** this replaces the killed "env var flip" line with something better and *live*: open Settings on stage, paste the token TerraClim hands out, press Activate. The header badge flips to "Data: TerraClim" in front of the judges.

## R12: ETa channel + NDVI: align the engine to the ET-GEO data pack (CRITICAL, from official brief)

**Problem:** The brief judges "ETo **and ETa** per block, per day" plus Kc and **NDVI** at block level. Our engine models ETc = ET0 × Kc but has no channel for *measured* actual ET (their random-forest ETa output) or Sentinel-2 vigour.

**Fix:**
- Extend `DailyWeather`/engine with optional `eta_measured` and `ndvi`. When the data pack provides ETa, the water balance consumes it directly; modelled ETc×Ks remains the forecast/gap-fill layer (satellite ETa is retrospective, so our forecast remains the differentiator, now anchored to their measured history).
- **ETa vs ETc divergence becomes a first-class stress signal**: ETa falling below modelled ETc means the vines are already throttling: surface it as a driver ("vines transpiring 18% below expectation").
- Kc from NDVI when vigour data exists (literature Kc–NDVI relation for vineyards), falling back to stage-based Kc.
- Dashboard block detail shows ETo, ETa, Kc, NDVI per day (the brief's exact checklist).

## R13: Validation view as a first-class screen (CRITICAL, from official brief)

**Problem:** The brief explicitly judges a "validation view: make WaPOR, FruitLook and stem water potential checks visible enough to build trust." We had validation scattered (backtest, MSWP language R3).

**Fix:** A dedicated **Validate** screen per block: model depletion/ETa series overlaid with WaPOR/FruitLook reference series (from the data pack) + entered pressure-bomb readings; agreement stats (bias, RMSE, within-band %); a "log a pressure-bomb reading" form that both plots the reading against the model and (R3) anchors calibration. The backtest (R2) lives here as the "would it have caught it" tab. This screen is the scientific-credibility centerpiece for Prof. van Niekerk.

## R14: DataPackProvider with raster zonal statistics (CRITICAL, from official brief)

**Problem:** We assumed a REST API. The brief says entrants get a **curated data pack** (10 m daily ETo raster surfaces, Sentinel-2 vigour, Kc/phenology records, RF ETa outputs): files, not endpoints.

**Fix:** Add `DataPackProvider` as a third provider: reads a local folder (`backend/app/data/datapack/`, gitignored), performs **zonal statistics over the real traced block polygons** (rasterio + shapely) for ETo/ETa/NDVI rasters, and serves the same `DailyWeather`+extras interface. Settings panel (R11) gains "Load data pack" (point at folder / upload) alongside the API option. Adapter shapes for CSV/GeoTIFF/NetCDF decided on Day 0 when we see the pack. The provider seam is ready either way.

## R15: IP compliance: data pack never leaves the machine (CRITICAL, legal)

Per the brief's data notice: TerraClim data, starter files and credentials may not be copied, published or redistributed. **Rules:** `backend/app/data/datapack/` is gitignored; no TerraClim rasters/CSVs/credentials ever committed; keep the GitHub repo private through the hackathon; demo screenshots of TerraClim-derived layers are fine (that's the judged product) but raw data files are not shared.

## R16: Align demo and scope priority to the official run of show (HIGH)

- Demo script: retime to **5 minutes + 3-minute Q&A** (was 4). Q&A prep already exists (JUDGE_QA.md).
- **Scope priority reordered: brief-core first, bulletproof:** (1) field/day dashboard with ETo/ETa/Kc/NDVI, (2) irrigate/hold/how-much recommendations, (3) depletion-ranked stress alerts, (4) validation view. Our over-delivery layer (Battle Plan, Season Bank, Field Mode, glide path/RDI framing) demos ONLY after the core four are flawless. They are the winning margin, not the foundation.
- Build days mapped to their run of show: Fri = render ETo/ETa + vigour + stress logic on the real data pack; Sat = recommendation engine + validation panel + alerts + polish; Sun = demo.
- "Handover-ready" is a judged criterion (Mbulelo): clean README, .env.example, architecture doc, one-command run. Treat repo quality as a feature.

## R17: Field photo capture with deterministic canopy analysis (HIGH, from Marshall)

**Requirement:** CropX-style photo capability, fully functional and linked to the app. Capture a canopy photo in the field, attach it to the block, get an honest visual-stress read.

**Fix:** Camera capture in Field Mode + Block Detail → upload to backend → per-block gallery. Analysis is deterministic and published-method (Green Leaf Index, canopy cover %, yellowing % via HSV segmentation, Pillow+numpy, no ML dependency), returns a stress hint and an "agrees with model" flag, and the photo GLI trend plots on the Validation screen next to the model. Marketed exactly as what it is: a phone-camera screening check that corroborates the water-balance model, the "prove it in the field" leg of the trust story. Photos stored server-side, gitignored. Full spec: API_CONTRACT.md addendum §C.

---

### Application order
1. Research agent lands → finalize constants (R5, R4 `p`, R3 MSWP mapping).
2. Backend + frontend agents land → apply R1–R8 as targeted follow-ups to those same agents (they retain build context).
3. Reconcile PITCH / DEMO_SCRIPT / JUDGE_QA / PLAN with R1, R2, R9 (kill false claims, add complementary framing).
4. End-to-end verify → commit → push.
