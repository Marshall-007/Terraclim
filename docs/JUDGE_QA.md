# Vino — Judge Q&A

Anticipated hard questions and the answers we give. Rule: **confident, honest, specific.** Never bluff a number. Every claim ties to something we built or a source we can cite. If we don't know, we say what we'd measure and move on.

---

### 1. "How do you know the numbers are right?"

Two independent legs: an established method, and a live proof.

**The method is standard, not invented.** The water balance is **FAO-56** (Allen et al., 1998) — `ETc = ET0 × Kc`, root-zone depletion against total available water. That is the reference framework every irrigation scheduler on earth uses, including CropManage and the extension services. The crop coefficients and the deficit target bands come from **Regulated Deficit Irrigation literature** — Chaves et al. (2010) on grapevine under deficit, and critically for us, **Myburgh / Winetech's RDI trials on wine grapes in the Western Cape**, which is the same climate and the same cultivars as our demo farm. We don't hardcode those numbers; the engine reads them from a data file so they're auditable and tunable, and the sources live in `docs/research/`.

**The proof is the backtest.** We replay the real past season, day by day, through the exact engine that runs live, and show it flagging actual heat events **days before they hit** — six days early on the December spike in our demo. So the answer isn't "trust us." It's: standard physics, region-specific viticulture, and a receipt you can watch.

**What we're honest about:** the target *bands* are decision thresholds, not laws of nature — a given estate would calibrate them to its own vine-water-status measurements over a season. The engine is built for exactly that calibration. We're not claiming millimetre precision; we're claiming the **right direction, early**, which is what actually changes a grower's decision.

---

### 2. "What about soil moisture sensors? You have none."

Correct — and that's a feature, not a gap.

**Sensors tell you where the water is *now*. Vino tells you where it's *going*.** A probe is a single point in a heterogeneous block, it's a rear-view reading, and it's capital cost per field with coverage gaps — which is exactly why sensor coverage in SA wine country is thin. We forecast the balance 14 days forward from climate data that already exists, for **zero hardware**, across **every** block on day one.

**Sensors are on our roadmap as validation, not dependency.** The clean architecture is: the deterministic engine drives the decision; a probe, when present, becomes a **calibration input** that tightens each block's TAW and confirms the deficit band — the same way a winemaker uses a pressure chamber to check leaf water potential. We designed the engine so a sensor makes it sharper without any block ever *requiring* one. Hardware-optional beats hardware-mandatory in a market where most blocks will never be instrumented.

---

### 3. "Does this really need TerraClim? You're running on Open-Meteo."

It runs today on free data on purpose — to prove the engine, not to lean on anyone's dataset. But TerraClim is the **production data layer**, and the fit is deliberate.

- **Provider-agnostic by design.** The engine only ever sees a `ClimateProvider` interface. Open-Meteo is one implementation; **TerraClim is another, already stubbed to the real request shapes** (`/api/point/`, `/api/polygon/`, `/api/nearest-station`). The moment we get a token, we set **one environment variable** and the whole app runs on TerraClim. No rewrite, no re-architecture. That's not a promise — it's how the code is structured right now.
- **Why TerraClim specifically makes Vino better.** TerraClim's **1,400-station South African network** is denser and closer to real vineyards than any global reanalysis product — station data beats interpolated grid cells for a decision made at block scale. And TerraClim's **polygon zonal statistics** map directly onto our block geometry: instead of sampling one lat/lon per block, we get area-averaged climate over the actual vineyard polygon. That is a materially better input to the exact same engine.
- **We respect the constraints.** Vino runs **one cached morning batch sync** that serves every screen from cache all day — it fits TerraClim's 50-queries/day limit *by design*, not by accident.

So: we don't *need* TerraClim to work. We're *built* for TerraClim to make it production-grade — and to run inside your quota.

---

### 4. "What's the business model? Who pays?"

The buyer is the person whose bonus depends on the wine score and the water bill: the **estate viticulturist / farm manager** at a premium or mid-premium winery.

- **SaaS per hectare under management** — the standard shape for precision-viticulture tooling, priced well below a single sensor install because we have no hardware COGS. Software margins, hardware-free rollout.
- **The value is quantified and lopsided in our favour.** One saved over-irrigation event protects wine *quality* (the entire margin of a premium bottle), and the Battle Plan's forecast-aware skipping saves *water and diesel* every week — our demo farm shows ~41 m³ saved in a single 3-day plan. In a drought economy, "when to stop" is worth more than "when to start."
- **Expansion paths:** water-stewardship / ESG reporting export (regulators and export markets increasingly demand it), co-op and estate-group tiers, and a validation upsell for growers who *do* add sensors.
- **Distribution:** wineries cluster in co-ops and regions. Land one flagship estate, the neighbours follow — viticulture is a small, reference-driven world.

Honest version: at a hackathon we're not claiming signed contracts. We're claiming a clear buyer, a hardware-free cost structure, and a value proposition — protect quality, cut water — that a viticulturist can act on this season.

---

### 5. "How is this different from just a weather app?"

A weather app tells you it will rain. Vino tells you **not to water B5 tonight because it's going to rain, and to pour 3.2 hours on B4 instead.** The distance between those two sentences is the entire product.

Concretely, a weather app has none of this:
- **A per-block target** — the Stress Glide Path, moving with variety, stage, and wine style. Weather is farm-wide; our decisions are block-specific and *contradict each other on the same day*.
- **Phenology** — GDD tells us this block is at véraison and *that's why* the deficit target is what it is.
- **A water balance** — we track depletion against root-zone capacity; weather is just one input to it.
- **A constraint solver** — the Battle Plan allocates a fixed daily water budget across seven competing blocks. Weather apps don't do operations research.
- **A prescription** — millimetres converted to drip runtime in hours. Weather gives you a percentage; we give you a runtime.

The forecast is an *ingredient*. The decision is the product.

---

### 6. "Isn't RDI risky to automate? Deficit irrigation done wrong ruins the crop."

Yes — which is exactly why Vino is a **decision-support co-pilot, not an autopilot.** We are precise about this line.

- **Vino recommends; the human pours.** Every output is a slip a viticulturist reads and approves — not a valve we open. There is a person, with a pressure chamber and forty years of instinct, between our number and the water. We make their morning decision faster and more consistent; we don't take it away.
- **The whole point of Vino is to make RDI *less* risky.** Un-automated RDI is a grower eyeballing seven blocks and guessing which is drifting off-path. That's where deficit irrigation goes wrong. Vino replaces the guess with a monitored, bounded, **auditable** trajectory: stage → balance → deviation → prescription, every step visible. And because the target is a *band*, not a knife-edge, the system is tolerant — it flags drift long before it becomes damage. The forecast means it warns you **days early**, not on the day it's too late.
- **It fails safe.** Scoring is deterministic — the AI only ever writes English, never numbers. If a provider call fails, the app serves the last cached balance rather than a wrong live one. If a value looks extreme, it shows the drivers behind it so the grower can overrule it. Nothing is hidden.

Automating RDI badly is dangerous. **Leaving RDI un-instrumented is the status quo, and it's *more* dangerous.** Vino is the safety rail on a practice growers already do by feel.

---

## Rapid-fire backups

**"Why Stellenbosch / South Africa?"** Water-stressed, premium-wine economy, and TerraClim's home network — the sharpest possible fit of problem, data, and buyer.

**"Seven blocks is small."** Deliberate — enough varieties to show four different glide paths contradicting each other on one screen. The engine is per-block and stateless; seven or seven hundred is the same code path.

**"What if the weather forecast is wrong?"** We re-run the balance every morning on the latest data and re-issue slips — the plan self-corrects daily. A wrong forecast costs one day of drift inside a tolerant band, which the next sync catches. We never bet the season on one forecast.

**"You demo one date."** `as_of` is a parameter — the engine evaluates any date, on real archive data. We picked 2026-01-20 because it's peak véraison deficit-irrigation season. It's not hardcoded; it's a query param.

**"Could a big player copy this?"** The code, yes. The *inversion* — betting the product on "over-watering is a defect" instead of "water it" — is a positioning most ag-tech companies won't take because their entire install base is row crops. We're not defensible on features; we're defensible on **being the only ones pointed at the wine grower's actual objective function.**

**"Is the AI making the numbers up?"** No. Every number is deterministic engine output. The AI layer only translates a computed result into a plain-English sentence, and it's optional — with no key set, the app returns the deterministic template and never fails.
