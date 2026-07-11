# Vino — Judge Q&A

Anticipated hard questions and the answers we give. Rule: **confident, honest, specific.** Never bluff a number. Every claim ties to something we built or a source we can cite. If we don't know, we say what we'd measure and move on. Format: **3-minute Q&A** after the 5-minute demo.

---

## Read the room — the three judges' priorities

The named judges want different things. Steer each answer to the person asking.

- **Dr Tara Southey (Founder/CEO — grower trust & product):** decisions a grower and viticulturist can *trust and act on*. Lead with the practical answer per block, the grower's own units (MPa, drip hours), the too-wet insight, and honesty about the model's limits. Product, not equations.
- **Prof. Adriaan van Niekerk (Research Lead — scientific rigour & validation):** the science under the hood. Lead with FAO-56 + the Ks stress coefficient, the RDI literature, the Validation view (WaPOR/FruitLook + pressure-bomb + agreement stats), and the **information-limited** backtest. Show the method, own the assumptions.
- **Mbulelo Ntlangu (Technical Lead — working interface, data flow, handover):** it actually runs and it's handover-ready. Lead with the `DataPackProvider` doing real polygon zonal statistics, the provider seam (data pack → TerraClim API → forecast feed), the live Settings/data-source flip, clean docs, `.env.example`, one-command run, and the data pack never leaving the machine.

---

### 1. "How do you know the numbers are right?" *(→ Adriaan)*

Two independent legs: an established method, and an honest validation screen.

**The method is standard, not invented.** The water balance is **FAO-56** (Allen et al., 1998) — actual crop ET is `ETc_adj = ET0 × Kc × Ks`, root-zone depletion tracked against total available water. Critically we include the **FAO-56 stress coefficient `Ks`**, which down-regulates ET once depletion passes readily-available water (`Ks = (TAW − D)/(TAW − RAW)`); without it a linear balance over-states depletion exactly during a heat spell, so this is the correction that keeps us honest when it matters. The crop coefficients (grape Kc mid = 0.70, FAO-56 Table 12) and the deficit target bands (anchored on FAO-56 grape depletion fraction `p = 0.45`) come from the RDI literature: **Matthews & Anderson (1988, AJEV)** on timing of deficit, **Chapman et al. (2005, AJGWR)** on the sensory cost of over-watering, **Williams (UC ANR)** on deficit and canopy, and our SA anchor **Myburgh / Winetech's *Handbook for Irrigation of Wine Grapes in South Africa*** — same climate, same cultivars as our demo farm. We don't hardcode those numbers; the engine reads them from a data file, and the sources live in `docs/research/`.

**The validation is a screen, not a claim.** The Validate view overlays our model against **WaPOR and FruitLook** reference series from the data pack and against logged **pressure-bomb (stem water potential, MPa)** readings, with agreement stats (bias, RMSE, within-band %). And the backtest is **information-limited**: on each replay day the engine sees only data available up to that day, projects forward, and we record whether it breached the band *before* the actual event — no reading the answer off the archive. So the answer isn't "trust us": standard physics with the stress term included, region-specific viticulture, and validation you can inspect.

**What we're honest about:** the target *bands* are decision thresholds, not laws of nature — an estate calibrates them to its own vine-water-status measurements over a season, and the engine is built for exactly that. We don't claim millimetre precision; we claim the **right direction, early**, which is what changes a grower's decision.

---

### 2. "What about soil moisture sensors and the pressure bomb? You don't replace them." *(→ Tara)*

Correct — and we don't try to. **Vino sits *above* spot measurements, it doesn't replace them.**

A pressure bomb reads one vine, today. A probe is a single point in a heterogeneous block. A viticulturist can walk a few blocks a morning. **Vino ranks all forty by depletion and plans the whole season** — so the grower knows *which* two blocks to walk with the pressure bomb this morning, before anything goes wrong. That's farm-wide **triage** and seasonal **water rationing**, decisions no single reading can make.

And the two are complementary by design: **feed us one pressure-bomb reading and we anchor the model to that block** — the balance is our proxy for stem water potential when no reading exists, calibrated by the reading when there is one. A phone photo of the canopy adds a second, deterministic corroboration (GLI, canopy cover, yellowing — published RGB indices, no ML). We make the morning decision faster and consistent across the whole farm; the human, with the pressure chamber and forty years of instinct, still pours. Hardware-optional beats hardware-mandatory in a market where most blocks will never be instrumented.

---

### 3. "Does this really use TerraClim, or is their name bolted on?" *(→ Mbulelo / Adriaan)*

It uses TerraClim's ET-GEO science as the **foundation**, and it's the honest centre of the product.

- **TerraClim is where each block *is*; we add where it's *heading*.** TerraClim's terrain-adjusted 10 m ETo surfaces, Sentinel-2 vigour, Kc/phenology records and random-forest ETa are the ground truth of every block's climate, canopy and actual water use — terrain-precise in a way a global grid can't be. Vino adds the forward-looking decision layer on top. These are **complementary jobs**, not a swap: TerraClim is climatology, terrain and measured history; a forecast *feed* supplies the forward outlook, which is not something TerraClim serves.
- **The app runs natively on the data pack.** A `DataPackProvider` reads the 10 m ETo/ETa/NDVI rasters and performs **polygon zonal statistics over the real traced block outlines** (rasterio + shapely) — not a single lat/lon sample. That's exactly the geometry-aware query TerraClim's ET-GEO data is built for. Provider order is **data pack → TerraClim API → Open-Meteo → synthetic**, all behind one interface the engine never sees past.
- **You can watch us switch it, live.** There's no env-var magic and no rewrite. We open the in-app **Settings / data-source** screen, paste the token (or point at the data-pack folder), press Activate — the backend validates it with one live call, re-warms the cache, and the header badge flips to **"Data: TerraClim ET-GEO."** No redeploy.
- **We respect the constraints.** In API mode, one cached morning batch sync serves every screen all day — inside TerraClim's query quota by design. The data pack is gitignored and never leaves the machine, per the IP notice.

So we don't bolt the name on. TerraClim's science is the substrate; Vino is the decision layer that runs on it and hands back an architecture TerraClim can carry forward.

---

### 4. "What's the business model? Who pays?" *(→ Tara)*

The buyer is the person whose bonus depends on the wine score and the water bill: the **estate viticulturist / farm manager** at a premium or mid-premium winery.

- **SaaS per hectare under management** — the standard shape for precision-viticulture tooling, priced below a single sensor install because we have no hardware COGS. Software margins, hardware-free rollout.
- **The value is quantified and lopsided.** One prevented over-irrigation event protects wine *quality* (the whole margin of a premium bottle), and the Battle Plan's forecast-aware skipping saves *water and diesel* every week — ~243 m³ in a single 3-day plan on our demo farm. In a drought economy, "when to stop" is worth more than "when to start."
- **Expansion:** water-stewardship / ESG reporting export, co-op and estate-group tiers, a validation upsell for growers who add sensors.
- **Distribution:** wineries cluster in co-ops and regions — land one flagship estate and the neighbours follow; viticulture is a small, reference-driven world.

Honest version: at a hackathon we're not claiming signed contracts. We're claiming a clear buyer, a hardware-free cost structure, and a value proposition — protect quality, cut water — a viticulturist can act on this season.

---

### 5. "How is this different from just a weather app?" *(→ Tara)*

A weather app tells you it will rain. Vino tells you **not to water B7 tonight because it's going to rain, and to pour 14.5 hours of drip on B4 over the next two nights instead.** The distance between those two sentences is the entire product.

A weather app has none of this:
- **A per-block target** — the Stress Glide Path, moving with variety, stage and wine style. Weather is farm-wide; our decisions are block-specific and *contradict each other on the same day.*
- **Phenology** — GDD tells us this block is at véraison and *that's why* the deficit target is what it is.
- **A water balance with the stress term** — depletion against root-zone capacity, with FAO-56 Ks; weather is one input to it.
- **A constraint solver** — the Battle Plan allocates a fixed daily water budget across seven competing blocks. Weather apps don't do operations research.
- **A prescription in the grower's units** — millimetres to drip runtime in hours, and a stem-water-potential band in MPa. Weather gives a percentage; we give a runtime.

The forecast is an *ingredient*. The decision is the product.

---

### 6. "Isn't RDI risky to automate? Deficit irrigation done wrong ruins the crop." *(→ Tara / Adriaan)*

Yes — which is exactly why Vino is **decision-support, not autopilot.**

- **Vino recommends; the human pours.** Every output is a slip a viticulturist reads and approves — not a valve we open. There's a person, with a pressure chamber, between our number and the water.
- **The point of Vino is to make RDI *less* risky.** Un-automated RDI is a grower eyeballing seven blocks and guessing which is drifting off-path — that's where deficit irrigation goes wrong. Vino replaces the guess with a monitored, bounded, **auditable** trajectory: stage → balance (with Ks) → deviation → prescription, every step visible. Because the target is a *band*, not a knife-edge, the system is tolerant and flags drift long before it's damage. The forward layer warns days early, not on the day it's too late.
- **It fails safe.** Scoring is deterministic — the AI only writes English, never numbers. If a provider call fails, the app serves the last cached balance, not a wrong live one. If a value looks extreme, it shows the drivers so the grower can overrule it. And the too-wet output is framed as a **flag to inspect** ("tracking wet for véraison — verify before your next irrigation"), not a blind imperative.

Automating RDI badly is dangerous. Leaving RDI un-instrumented is the status quo, and it's *more* dangerous. Vino is the safety rail on a practice growers already do by feel.

---

## Rapid-fire backups

**"Why traced polygons instead of rectangles?"** Because a real block isn't a bounding box, and querying the true outline is the whole point of polygon zonal statistics — TerraClim's home ground. We hand-traced the parcels on the satellite basemap and added an in-app **"trace a block"** tool: click vertices over the imagery, the app computes area + centroid and pulls climate for that exact geometry. The map is a working tool, not a picture.

**"What is ETa doing in your engine that ETo isn't?"** ETo is the atmospheric demand; **ETa is the measured actual ET from the data pack's random-forest model.** When ETa runs below our modelled `ETc`, the vines are already throttling — we surface that divergence as a first-class stress driver. The dashboard shows ETo, ETa, Kc and NDVI per block per day, the brief's exact checklist.

**"Depletion fraction means nothing to a grower."** Agreed — so we display an **MSWP-equivalent band in MPa** alongside it, mapped from depletion by stage (labelled as modelled), because that's the unit RDI is actually scheduled in. Depletion fraction stays the engine internal.

**"Your backtest is just reading the archive."** No — it's **information-limited.** Each replay day the engine uses only data through that day, projects forward, and we log whether it breached the band before the event. If a true historical forecast series isn't available we say so plainly in the UI. We never claim foreknowledge.

**"The photo analysis — is that ML you can't explain?"** No ML at all. It's deterministic, published RGB/HSV indices — Green Leaf Index, canopy cover %, yellowing % (Pillow + numpy). Reproducible, auditable, and honestly marketed as a phone-camera screening check that corroborates the water balance.

**"Why Stellenbosch / South Africa?"** Water-stressed, premium-wine economy, and TerraClim's home ground — the sharpest fit of problem, data and buyer.

**"Seven blocks is small."** Deliberate — enough varieties to show four glide paths contradicting each other on one screen. The engine is per-block and stateless; seven or seven hundred is the same code path and the same zonal-statistics call.

**"What if the weather forecast is wrong?"** We re-run the balance every morning on the latest data and re-issue slips — the plan self-corrects daily. A wrong forecast costs one day of drift inside a tolerant band, which the next sync catches. We never bet the season on one forecast.

**"You demo one date."** `as_of` is a runtime parameter (Settings screen, or `DEMO_DATE`), evaluated on real data — we picked 2026-01-20 because it's peak véraison deficit-irrigation season. Not hardcoded.

**"Is it handover-ready?"** Yes, and we treat that as a judged feature: clean docs, `.env.example`, one-command run, an architecture doc, and the provider seam so TerraClim can extend it without a rewrite. What we submit Monday is a working app and a path toward a real TerraClim product.

**"Is the AI making the numbers up?"** No. Every number is deterministic engine output. The AI layer only translates a computed result into plain English, and it's optional — with no key set, the app returns the deterministic template and never fails.
