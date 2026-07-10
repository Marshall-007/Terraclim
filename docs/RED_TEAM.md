# Vino — Red Team Review

**Role:** Hostile hackathon judge + viticulture skeptic. No praise. Every finding is a hole to close before the real judges find it.
**Reviewed:** `PLAN.md` (v2), `docs/API_CONTRACT.md` (v1). Concept + spec only; backend/frontend code not touched.
**Date:** 2026-07-10.

---

## VERDICT UP FRONT

**Single biggest existential risk: this is a TerraClim hackathon, and the app does not actually use anything TerraClim is good at.** TerraClim (the Stellenbosch University CGA / Winetech product — *not* the University of Idaho global grid) is a terrain-adjusted, high-resolution, bioclimatic-index and cultivar-suitability decision-support system built *in collaboration with the Stellenbosch Department of Viticulture & Oenology*. Vino treats it as a swappable row-of-numbers feed (ET0, rain, tmax) behind an interface whose *default* is Open-Meteo. If a CGA-affiliated judge is in the room — and at their own hackathon, one will be — "you rebuilt a worse Open-Meteo wrapper and bolted our name on via an env var" is a losing position. **Fix this first or nothing else matters.** (See Axis 2.)

Second-order existential risk: **the "proof" pillar (backtest / 14-day forecast lead time) is built on perfect hindsight** and will collapse under one pointed question. (See Axis 4, C1.)

Severity scale: **Critical** (can lose the hackathon) · **High** (a judge visibly dings you) · **Medium** (weakens the story) · **Low** (polish).

---

## AXIS 1 — SCIENTIFIC VALIDITY

### 1.1 The single most likely "well actually": you manage RDI with a pressure bomb, not a soil depletion fraction. — **Critical**
Commercial premium-wine RDI is scheduled by **midday stem water potential (MSWP)** measured with a Scholander pressure chamber — the direct, industry-standard measure of vine water status. UC guidance: hold reds at roughly **−8 to −10 bar fruit-set→veraison**, whites slightly wetter. A Stellenbosch viticulturist does not think in "soil root-zone depletion fraction 0.45–0.65"; that number is meaningless to the person you're pitching. Your entire glide path is expressed in a unit growers don't use, derived from a FAO-56 water balance that is a *proxy* for the thing they actually measure.
**Fix:** Translate the glide path into **MSWP-equivalent bars** as the primary display unit (keep depletion fraction as the engine internal). Map your bands to published bar ranges per stage/style and cite the source. Add one sentence to the pitch: "The soil balance is our proxy for stem water potential when no pressure-bomb reading exists; feed us one reading and we calibrate to it." This converts your biggest liability into a credibility signal — you *know* what the real instrument is.

### 1.2 The water balance has no stress coefficient (Ks) — it over-estimates depletion exactly when it matters. — **High**
FAO-56 actual crop ET under water stress is `ETc_adj = Ks · Kc · ET0`, where Ks<1 once depletion passes the readily-available-water threshold. Your balance uses full `ETc = Kc · ET0` regardless of how dry the soil is. Result: during a dry spell the model keeps draining the root zone at the full rate when a real vine has already down-regulated stomata, so **you overstate depletion precisely in the heat events your demo brags about catching.** A soil-physics-literate judge catches this in the equation on your slide.
**Fix:** Add the FAO-56 Ks reduction (`Ks = (TAW − D)/(TAW − RAW)` for D>RAW). Small code change, large defensibility gain. If cut for time, *say so on the slide* ("linear balance, no stomatal down-regulation — conservative in the wet direction") so it reads as a known simplification, not an error.

### 1.3 No effective-rainfall / runoff / deep-percolation partitioning. — **Medium**
`D_t = clamp(D + ETc − rain − irrigation, 0, TAW)` treats 40 mm of rain identically to 40 mm of drip. On sloped Stellenbosch decomposed-granite/shale soils a big storm largely runs off or drains below the root zone; you credit all of it. So after a storm you'll under-state depletion and tell someone to hold water when the vine is actually fine — or vice versa.
**Fix:** Cap effective rainfall (e.g. daily rain contribution capped, or an 80% effectiveness factor with an event cap). One line. Mention terrain/slope as a TerraClim-powered refinement on the roadmap (ties Axis 2).

### 1.4 GDD-only phenology with a single base temp and thresholds that don't match cultivar literature. — **High**
Two problems. (a) You use base 10 °C for every stage; published work shows the effective base temperature *rises* through the season (~6–8 °C budbreak → ~9–13 °C veraison), and cultivar base temps differ. (b) Your absolute thresholds look high: literature puts Cabernet ~87 GDD to budburst and ~375 to flowering, and total budburst→harvest around ~1,350 GDD; your Cabernet (×1.15) needs 115 → 460 → veraison 1,322 → **harvest 1,840**. That risks the engine placing a block a whole stage away from where a local viticulturist knows it is on 20 Jan. **If your demo says "Cabernet: fruit set" and the judge knows Stellenbosch Cabernet is at veraison by late January, the whole engine loses trust in one sentence.**
**Fix:** Before the demo, hard-validate the stage each of the 7 blocks lands on for `DEMO_DATE=2026-01-20` against a Stellenbosch phenology calendar (or a local extension source) and tune thresholds so the stages are *right for that date*. Base-10 uniform is a defensible standard simplification — keep it but call it out. The thresholds must not be wrong on the demo date.

### 1.5 Fixed Kc ignores canopy size, trellis, row spacing, vine age. — **Medium**
Wine-grape Kc is dominated by fractional canopy cover; FAO-56 mid-season ranges ~0.3–0.8 depending on canopy. One fixed veraison Kc=0.70 for a 3-year-old vs a mature sprawl is a big error in absolute mm. Defensible for an MVP, but a "well actually."
**Fix:** Expose Kc as a per-block property (already implied by "reads from json") and let one block carry a visibly different Kc so the story is "canopy-aware, not a global constant." Note canopy-from-NDVI as roadmap.

### 1.6 Seeded starting depletion `D = 0.3×TAW` and fixed `TAW=120 mm` are unjustified. — **Medium**
On 1 Sep you invent 0.3×TAW of depletion with no basis; TAW is a flat 120 mm regardless of soil type or rooting depth, which on real Stellenbosch soils varies 60–200+ mm. By January the seed partly washes out, but combined with no Ks (1.2) and no effective-rainfall cap (1.3), absolute depletion is essentially uncalibrated. Your "3.2 h tonight" number is precise-looking but rests on three guesses.
**Fix:** Seed from winter rainfall (Cape winter-wet: root zone is near field capacity at budbreak, so seed *low*, ~0.05–0.1×TAW, which is also more defensible). Make TAW per-block from soil/rooting assumptions. Add a visible "confidence: modeled, not sensor-calibrated" tag so precision is honest.

### 1.7 The score is auditable but not *justified* — magic constants everywhere. — **Medium**
`|dev|/0.35`, the `0.7/0.3` deviation-vs-forecast blend, stage sensitivity ×2, wine-style weight 1.3/1.15 — none are sourced. "Deterministic and auditable" ≠ "correct." A judge asking "why is B1 a 62 and not a 55?" gets arithmetic, not a reason. Also the contract states the score formula two inconsistent ways (a bare `|deviation|/0.35×100` and a `0.7·deviation_component + 0.3·forecast_component` where the components are never defined on a 0–100 scale).
**Fix:** Define each component precisely in the contract, and put one line of justification behind each constant (or cite it). Better: derive the "critical" threshold from an MSWP band crossing rather than an arbitrary 0.35.

---

## AXIS 2 — TERRACLIM FIT (existential)

### 2.1 TerraClim is reduced to an interchangeable data pipe; none of its actual strengths are used. — **Critical**
TerraClim's differentiators are exactly the things Vino ignores: **terrain-adjusted high-resolution climate surfaces** (it fuses >1,000 stations with a DEM to model *within-vineyard* climate), **bioclimatic indices** (Winkler/GDD, GST, cool-night index, etc. — pre-computed, wine-specific), **cultivar suitability**, and **polygon/vineyard-profile zonal queries**. Vino pulls three scalars (ET0, rain, tmax) from a *point* and computes its own GDD — reinventing, more crudely, what TerraClim already serves. The architecture literally makes Open-Meteo the DEFAULT and TerraClim a "drop-in when the token arrives." At *their* hackathon that framing says "we didn't need you."
**Fix (do all three):**
- **Make TerraClim the source of the phenology layer, not a fallback.** Consume TerraClim's terrain-adjusted temperature surface / bioclimatic index for GDD instead of computing it from a single Open-Meteo point. Then your pitch is: "Every block's phenology is driven by TerraClim's terrain-corrected climate — the cold-air-drainage block and the north-slope block get *different* stages, which flat gridded data can't see." That is a feature only TerraClim enables.
- **Use polygon zonal stats for real.** You have 7 polygons. Pull TerraClim polygon zonal statistics per block (mean/spread across the block) and show intra-block variability. Open-Meteo cannot do this. Make it a visible screen.
- **Use a terrain layer.** Slope/aspect from TerraClim's DEM feeds effective-rainfall (1.3) and a "this south-facing block runs cooler → later veraison" story. Terrain is TerraClim's home turf.

### 2.2 The "one env var flips the whole app to your data" line is likely false — TerraClim may not serve a 14-day forecast. — **Critical**
TerraClim is a near-real-time historical + long-term-climatology + terrain system (data "back eight years," 30-year surfaces). Evidence that it exposes a **14-day meteorological forecast** in the Open-Meteo shape is absent. Your headline features — 14-day forecast, Battle Plan "skips blocks with rain inbound," projected deviation — *require* forecast. So even with the token, the forecast half of the app still runs on Open-Meteo, and "one env var flips everything" is not true. A judge who knows TerraClim will call this.
**Fix:** Split the interface honestly: `HistoryProvider` (TerraClim — its strength: terrain-adjusted history + climatology + indices) and `ForecastProvider` (Open-Meteo or another NWP feed — forecast is not TerraClim's job). Pitch it as *complementary*, not swappable: "TerraClim tells us where each block *is* on its glide path with terrain precision; the forecast feed tells us where it's *heading*." This is more honest, more defensible, and still centers TerraClim.

### 2.3 Don't quote "1,400 stations / 44 variables" to the people who built it. — **Medium**
Public sources say **>1,000 stations** (iLeaf, SAEON, MetosSA) and don't confirm "44 variables." If you state a precise number a CGA judge knows is wrong, you lose credibility on a throwaway line.
**Fix:** Verify the exact figures against TerraClim's own materials, or use safe language: "over a thousand stations across iLeaf, SAEON and MetosSA, terrain-corrected against a DEM." Never assert a precise stat you can't source in front of its authors.

---

## AXIS 3 — DIFFERENTIATION

### 3.1 The engine's *method* is standard FAO-56 stress scoring; the novelty is framing, not math. — **High**
A soil-water-balance-vs-target-band deviation score is textbook. Semios, Vintel, Fruition and others already schedule vineyard irrigation off water status. Your genuinely novel bits are (a) **the "too wet is also a defect" direction** — the "stop watering, you're diluting your Cabernet" alert nobody else shows — and (b) **wine-style-specific bands**. But note your own bands only differentiate style *from fruit_set onward*; dormant/budbreak/flowering are identical across all four styles, so the "different styles → different glide paths → visible contrast on the map" claim is weaker than pitched if the demo date lands early.
**Fix:** Lead the entire narrative with the too-wet alert; make it the demo's money shot and make sure ≥1 block is genuinely too-wet on the demo date (verify, don't hope). Ensure the demo date is late enough that style bands have diverged, so the map contrast is real. Rename/relabel the metric around the wine outcome ("dilution risk," "concentration on-track") rather than "stress," since stress-scoring is the crowded framing.

### 3.2 A competitor who shows real MSWP data, real satellite NDVI, or real TerraClim indices out-credibilities you. — **High**
Your inputs are all modeled from gridded climate. One team wiring in Sentinel-2 NDVI (free) or a single real pressure-bomb reading, or actually rendering TerraClim's bioclimatic layers, will look more "real" than your synthesized numbers.
**Fix:** Pre-empt it: (a) execute Axis 2 so TerraClim layers *are* on screen; (b) put NDVI on the roadmap slide explicitly so "where's the ground truth?" is already answered; (c) the calibration hook from 1.1 ("give us one bar reading") shows you know the gap and have a plan.

### 3.3 "Battle Plan / Season Water Bank / Day Zero" is a strong, less-copyable angle — lean harder. — **Medium (opportunity)**
The constraint-solved multi-day schedule and the finite-dam burn-down verdict are more distinctive than the stress score and speak to a real Cape anxiety (water scarcity, Day Zero). Competitors are less likely to build these.
**Fix:** Give the Water Bank / Day Zero verdict equal billing with the glide path in the pitch. It's your defensible moat.

---

## AXIS 4 — DEMO RISK (ranked)

### C1 (Critical) — The backtest and forecast lead-time are perfect hindsight; one question collapses the "proof" pillar.
Running the app "as of 2026-01-20," there is no such thing as a real forecast for 21 Jan → 3 Feb — no forecast API predicts a date six months in the past. So your "14-day forecast" and the backtest's "engine flagged B1 six days before the 38 °C spike" are fed **archived actuals dressed as forecast** — the model already knows the answer. A skeptic asks "is that a forecast or are you reading what actually happened?" and the proof pillar dies.
**Fix:** Be explicitly honest in the UI and script: "Historical replay uses recorded weather as the stand-in forecast to demonstrate the decision logic; in live operation the forecast feed supplies this." If you want a *real* skill claim, backtest with genuine lead time: at each replay day, forecast using only data available up to that day (Open-Meteo archive supports pulling the actual historical *forecast* is hard — instead compute the balance with a climatology-only forward and show the engine still flags early). Never let "6 days lead" stand unqualified.

### C2 (High) — GPS "detects the block you're standing in" will not work at the venue.
You'll demo in a conference room in {venue}, not in the vineyard near −33.93 S. GPS will place you nowhere near any 1.5–4 ha polygon 200 m apart, so Field Mode's headline auto-detect shows nothing or the wrong block. Also consumer GPS (±5–10 m) can straddle adjacent small blocks even on-site.
**Fix:** Ship a **manual block picker** and a **"simulate location" toggle** (drop the pin in B4) as the demo path; treat live GPS as a bonus, never the critical path. Fall back to nearest-block if the fix is outside all polygons.

### C3 (High) — Map tiles load from an external CDN; venue wifi/CSP can leave a blank map.
Leaflet + OSM tiles need outbound tile requests. Flaky conference wifi or a locked-down network = grey rectangle behind your blocks, and the map *is* the first impression.
**Fix:** Pre-cache tiles for the demo bbox (or bundle a static basemap image / vector style) so the map renders offline. Test on a hotspot and on airplane mode before the demo.

### C4 (High) — Whole demo depends on live external APIs during the pitch.
Open-Meteo archive/forecast down, rate-limited, or slow mid-demo = dead app. The PLAN's own "mock fallback so it demos even without backend" is the right instinct — make sure it's real and *identical-looking*.
**Fix:** Freeze a **golden cached snapshot** for `DEMO_DATE` and demo from cache, not live network. The 6 h TTL + morning batch already enables this — pre-warm the cache before the pitch and pull the network cable to prove it still runs.

### C5 (Medium) — July dormant-season trap if `as_of` defaulting slips.
Handled in the plan (`DEMO_DATE=2026-01-20`), but if any endpoint or the frontend forgets to pass `as_of`, it evaluates "today" = July = every block dormant, flat, boring.
**Fix:** Make the backend default to `DEMO_DATE` env when `as_of` is absent (contract says it does — test it), and add a loud banner "Viewing: 20 Jan 2026 (peak season)" so a slip is obvious, not silent.

### C6 (Medium) — Archive data lag / gaps for the demo window.
Open-Meteo archive (ERA5) runs ~5 days behind real time; 20 Jan 2026 is 6 months old so it's fine — *for this date*. If anyone changes the demo date closer to "today," expect missing recent days and NaNs.
**Fix:** Lock the demo date; add gap-fill (forward-fill / climatology) so a missing day never crashes the balance.

---

## AXIS 5 — SCOPE REALISM

### 5.1 The feature list is roughly 2–3x a hackathon sprint if all done well. — **High**
Ten features (phenology, balance, glide path, forecast, Pour Slip, Battle Plan, Season Bank, Field Mode PWA, Backtest, Briefing) plus two providers, cache, tests, and a polished PWA. Built shallowly, several will feel like stubs; the demo dies from breadth, not depth.

**Minimum Lovable Core (build these solid first):**
1. Phenology + water balance + **glide path with the too-wet alert** (the whole thesis; must be correct).
2. **Block detail glide-path chart** + one **Pour Slip** with a real number.
3. **Map** with 7 blocks traffic-lit, ≥1 too-wet.
4. **Morning Briefing** (cheap, ties the farm together, shows the daily-use hook).

**Impressive-but-fragile (do only if core is solid):** Battle Plan (constraint solver — easy to get subtly wrong), Backtest (integrity trap C1), Scenario, Season Bank projection, live GPS.

**Solid-and-safe / high ROI:** Field Mode with *manual* block pick, the too-wet alert, the golden cached demo.

**Honest cut-line:** if time runs short, cut **Scenario, live GPS auto-detect, and the Battle Plan solver** before you cut correctness of the core balance/glide path. A rock-solid "stop watering your Cabernet" on a real number beats five half-working tabs.

### 5.2 Two providers + cache + tests + PWA is a lot of plumbing for the visible payoff. — **Medium**
The provider abstraction is good engineering but invisible to judges unless Axis 2 is executed. Don't spend the sprint polishing the TerraClim stub if it never runs on stage.
**Fix:** Budget provider work to whatever makes the Axis-2 TerraClim story demonstrable; otherwise it's hidden cost.

---

## AXIS 6 — BUSINESS / "SO WHAT"

### 6.1 Strongest reason a Stellenbosch estate won't use it daily: they already have better ground truth, and yours is uncalibrated. — **High**
A serious estate has (or has access to) TerraClim itself (Winetech-backed, effectively subsidized), a viticulturist/consultant, soil moisture probes, and a ~R-cheap pressure bomb giving *direct* vine water status. Vino offers a *modeled* soil balance with a seeded start, flat TAW, no Ks, no sensor calibration — an estimate that can be off by tens of mm on the exact "should I water tonight" call where being wrong costs fruit. Conservative growers won't trade a pressure-bomb reading for a gridded guess, and won't risk "stop watering" advice during a heat spike on faith.
**Fix:** Position as the **farm-wide triage / planning layer that sits above spot measurements, not a replacement for them** — "Vino tells you *which* 2 of 40 blocks to walk with the pressure bomb this morning, and how to ration the dam to harvest," not "trust this number blind." Add the calibration hook (1.1). Lead the ROI with **water rationing under scarcity** (Season Bank / Day Zero) — that's a real budget line in the Cape — rather than replacing the agronomist.

### 6.2 Liability / trust on the "hold water / stop watering" recommendation. — **Medium**
The most novel alert is also the riskiest to act on: telling a grower to withhold water in summer, from a model, could cook a crop if the model's absolute depletion is off. Growers know this and will discount confident withhold advice.
**Fix:** Frame too-wet output as a **flag to inspect** ("B3 tracking wet for veraison — verify before your next irrigation"), not an imperative. Show the drivers so it's a recommendation-with-reasons, not a black box.

### 6.3 Who pays, and is it daily? — **Medium**
Daily-use claim is strong for the pitch but weak in reality outside the ~Dec–Feb irrigation window; 6+ months a year it's dormant/quiet. "Daily use" is really "daily in-season."
**Fix:** Pitch seasonal-critical-window value + off-season planning (Water Bank, next-season suitability via TerraClim), not literal 365-day use. Be honest that the value concentrates in the deficit-irrigation window — that's still a compelling wedge.

---

## TOP 5 THINGS TO FIX TO NOT LOSE THIS HACKATHON

1. **Make TerraClim central, not a fallback (Axis 2.1 / 2.2).** Drive phenology from TerraClim's terrain-adjusted climate surface, put its polygon zonal stats and a terrain layer on screen, and re-pitch the architecture as *complementary* (TerraClim = terrain-precise "where each block is"; forecast feed = "where it's heading"). Kill the false "one env var flips everything" line. This is the difference between winning and looking like you ignored the host.

2. **Defuse the hindsight trap in the backtest / forecast (Axis 4 C1).** Never let "flagged it 6 days early" stand unqualified — it's fed the answers. State plainly that historical replay uses recorded weather as the stand-in forecast, or build a genuine information-limited backtest. This protects your entire "proof" pillar from one question.

3. **Speak the grower's language: express the glide path in stem-water-potential bars and add a calibration hook (Axis 1.1 / 6.1).** "Soil depletion fraction 0.45–0.65" is a unit no viticulturist uses. Show MSWP-equivalent bars, cite the source, and offer "feed us one pressure-bomb reading and we calibrate." Turns your #1 "well actually" into a credibility win and reframes the product as triage-above-sensors, not a replacement.

4. **Harden the demo path: golden cached snapshot, manual block picker, offline map tiles (Axis 4 C2/C3/C4).** Demo from a pre-warmed cache with the network cable pulled; make Field Mode work by manual/simulated location; pre-cache map tiles. Assume venue wifi, GPS, and live APIs all fail, and rehearse that way.

5. **Cut to the Minimum Lovable Core and make the too-wet alert unmistakably correct on the demo date (Axis 5.1 / 1.4 / 3.1).** Validate that all 7 blocks land on the *right phenological stage* for 20 Jan 2026 against a real Stellenbosch calendar, guarantee ≥1 genuinely too-wet block, and make "stop watering — you're diluting your Cabernet" the money shot. Depth on the thesis beats breadth of half-working tabs.

---

## Sources consulted
- TerraClim (Stellenbosch University CGA / Winetech SDSS): terraclim.com; www0.sun.ac.za/cga/terraclim/; infowine.com "Terraclim, an online spatial decision support system for the wine industry"; wineland.co.za.
- RDI / vine water status: AJEV "Physiological Thresholds for Efficient RDI"; UC Davis viticulture "Comparing the three most common methods of measuring vine water status"; UCCE deficit-irrigation scheduling; NCBI RDI Cabernet anthocyanin/tannin study.
- Grapevine phenology / GDD: Washington Wine "Predicting Key Phenological Stages"; eVineyard GDD; Frontiers Cabernet Sauvignon phenology; base-temperature-by-stage literature.
