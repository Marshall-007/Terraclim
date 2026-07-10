# Vino — The Pitch

**ET-GEO Hackathon 2026 · TerraClim · Team Marshall + Obey**
**Know when to pour.**

---

## The one-liner

> TerraClim's ET-GEO science tells a grower **where every block sits today** — 10 m ETo, ETa, Kc and NDVI, at the vine.
> Vino turns that into the one answer the brief asks for — **irrigate, hold, or how much** — and it's the only tool
> in the room that knows premium wine has a *too-wet* failure mode too. It scores each block against a moving
> **Stress Glide Path**, tells the grower when to pour and when to **stop**, and ranks the whole farm so you know
> which two blocks to walk with the pressure bomb this morning.

---

## The foundation: TerraClim is where each block *is*; we add where it's *heading*

This is TerraClim's hackathon, and Vino is built on TerraClim's home turf. TerraClim's ET-GEO science — terrain-adjusted 10 m ETo surfaces, Sentinel-2 vigour, Kc/phenology records, a random-forest ETa model — is the **foundation layer**: the terrain-precise ground truth of where each block sits in climate, canopy and water-use space. Coarse global grids cannot see the cold-air-drainage block and the north-slope block as different places. TerraClim can.

Vino adds the layer on top: **the forward-looking decision.** A forecast feed projects each block's balance ahead; the engine converts it into an action. So the framing is complementary, never swappable:

> **TerraClim tells us where each block is, with terrain precision. Vino tells the grower where it's heading, and what to do tonight.**

**How it runs on the data pack — live, not "someday."** The app is built to run natively on the ET-GEO data pack through a `DataPackProvider` that reads the 10 m ETo/ETa/NDVI rasters and does **polygon zonal statistics over the real traced block outlines** (not a bounding-box point sample). Provider order is **data pack → TerraClim API → Open-Meteo → synthetic**, so the moment we have the pack or a token, TerraClim's own data drives the numbers.

The switch is a **live mechanic on stage, not a promise about code.** We open the in-app **Settings / Data-source** screen, paste the token TerraClim hands out (or point at the data-pack folder), press Activate — the app validates it with one live call — and the header badge flips to **"Data: TerraClim ET-GEO"** in front of the judges. No redeploy, no env-file edit, no rewrite.

---

## The problem: data-rich, decision-poor

South African growers are drowning in climate data and starving for decisions.

- **ET is retrospective.** Evapotranspiration tells you what water *already left* the vine. By the time a stress index turns red, the damage to the berry is done. TerraClim's measured ETa is the truth of what happened; the grower still needs to know what to do next.
- **Generic tools misread vineyards.** Every irrigation product on the market inherits row-crop logic: measure the deficit, replace the deficit, keep the plant comfortable. That is exactly right for lettuce and exactly wrong for a Cabernet destined for a premium bottle.
- **The decision is the hard part.** A grower with a dense climate network still has to answer one question every single morning: *which blocks do I water tonight, for how long, and which do I leave alone?* No dashboard answers that. They answer it by feel.

The gap is not more data. It is the **decision layer** that turns data into tonight's runtime, in hours, per block.

---

## What the brief asks for — and we built all four, solid

The brief judges a specific feature set. Vino ships every piece as the bulletproof core, before any of our over-delivery:

1. **Field/day dashboard.** Per block, per day: **ETo, ETa, Kc and NDVI** — the brief's exact checklist. When the data pack supplies measured ETa, the balance consumes it directly; our modelled `ETc × Ks` is the forecast/gap-fill layer. **ETa falling below modelled ETc is a first-class stress signal** — "these vines are transpiring 18% below expectation, they're already throttling."
2. **Recommendation engine.** Soil-water status → a clear grower action: **irrigate / hold / review — and how much.** A **Pour Slip** turns millimetres into drip runtime in hours; too-wet blocks get a **Hold Slip**.
3. **Stress alerts.** The farm ranked by **depletion**, so the blocks moving toward stress surface to the top — the triage list.
4. **Validation view.** The trust screen: model depletion/ETa overlaid with **WaPOR / FruitLook reference series**, entered **stem water potential (pressure-bomb, MPa)** readings, **field-photo canopy corroboration**, and an **information-limited backtest**. Agreement stats (bias, RMSE, within-band %) sit next to it.

Every block speaks the grower's language: alongside depletion fraction, the block detail shows an **MSWP-equivalent band in MPa** — the unit a viticulturist actually manages RDI in — mapped from the depletion fraction by stage and labelled as modelled. And a calibration hook: *"Give us one pressure-bomb reading and we anchor the model to your block."*

---

## The inversion insight — the thing nobody else will say

Premium wine is not grown by keeping vines happy. It is grown by stressing them **on purpose, at the right moment**.

This is **Regulated Deficit Irrigation (RDI)**, orthodox viticulture, not a stunt. A moderate, controlled water deficit between fruit set and véraison shuts down shoot growth, shrinks the berry, and concentrates the skin-to-juice ratio — colour, tannin, aroma. The deficit *is* the quality. The science is settled:

- **Matthews & Anderson (1988), *AJEV* 39(4):313** — the foundational timing-of-deficit result: pre-véraison water deficit raised berry and wine anthocyanins more than post-véraison deficit. The window our engine is built around.
- **Chapman et al. (2005), *AJGWR* 11:339** — direct sensory proof: Cabernet from lower (deficit) vine water status is **more fruity, less vegetal**; over-watered vines turn **vegetal and dilute**.
- **Williams (UC ANR), *Deficit Irrigation of Wine Grape Vineyards*** — full irrigation before véraison drives excessive shoot growth; deficit yields looser, lighter clusters and better fruit.
- **SA anchor — Myburgh / Winetech, *Handbook for Irrigation of Wine Grapes in South Africa*** — the same practice, calibrated to the same Cape climate and cultivars as our demo farm.

Which means the opposite is a defect. **Over-watering premium wine grapes causes dilution, runaway canopy vigour, shading, botrytis pressure, delayed ripening, and herbaceous, thin wine.** A too-wet block is not a safe block. It is a spoiled one.

So Vino replaces the industry's single metric — "water stress" — with the one that matches how wine is actually made:

> **Deviation from the Stress Glide Path** — a target deficit band, per block, that moves with the season, the grape variety, and the wine style.

A block goes red when it drifts out of its band **in either direction**. Too dry *and* too wet are both failures. Vino is the only tool in the room that will say:

> *"Stop watering. You're diluting your Cabernet."*

Water stops being a resource to minimise. It becomes the winemaker's first instrument.

---

## The engine — deterministic and auditable. AI writes English; the maths writes the numbers.

1. **Phenology from climate.** Growing Degree Days (base 10 °C from 1 September, scaled per variety) infer each block's stage — budbreak → flowering → fruit set → véraison → harvest — with no sensors in the ground.
2. **FAO-56 water balance, with the stress coefficient.** Per block, actual crop ET is `ETc_adj = ET0 × Kc(stage) × Ks`, where the **FAO-56 stress coefficient `Ks`** down-regulates ET once depletion passes readily-available water (`Ks = (TAW − D)/(TAW − RAW)`). Without it a linear balance over-states depletion exactly during the heat events that matter — the correction a soil-physics judge looks for. Effective rainfall is capped; TAW is per-block, not a flat guess.
3. **The Stress Glide Path.** A target depletion band per stage × wine style, anchored on the FAO-56 grape depletion fraction `p = 0.45` and translated to an MSWP-equivalent band in MPa. Signed deviation drives one verdict: **on track / too dry / too wet.**
4. **A forward layer.** We project the balance ahead on a forecast feed — the answer to ET's retrospective flaw. This is a forecast *feed*, complementary to TerraClim's terrain history, not something TerraClim serves.

---

## The over-delivery — where we went beyond the brief

The brief-core four are the foundation. These are the winning margin:

| What a judge expects from a hackathon irrigation app | What Vino actually ships |
|---|---|
| A stress heat-map | A **bi-directional glide path** with genuine too-wet alerts and a **Hold Slip** |
| "This block is dry" | A **printable Pour Slip**: millimetres → drip runtime in hours |
| One block at a time | A **constraint-solved multi-day Battle Plan** that skips blocks on forecast rain |
| A number you have to trust | An **information-limited backtest**, WaPOR/FruitLook overlay, and a pressure-bomb calibration hook |
| "Trust the demo" | A **Season Water Bank** with a hard Day-Zero verdict |
| A dashboard on a laptop | **Field Mode** — one number in the row, plus **camera capture** for a field canopy check |
| A rectangle drawn on a street map | A **satellite basemap with hand-traced real block outlines** and an in-app **"trace a block"** tool feeding polygon zonal statistics |
| A demo hard-wired to one dataset | A **DataPackProvider + live Settings screen**: flip to TerraClim ET-GEO on stage, header badge changes |

**Field photos, corroborating the model.** Capture a canopy photo on the phone; the backend runs a **deterministic, published-method** analysis — Green Leaf Index, canopy cover %, yellowing % via RGB/HSV segmentation (Pillow + numpy, **no ML**) — and returns a stress hint with an "agrees with model" flag. The photo GLI trend plots on the Validation screen next to the model. Marketed as exactly what it is: a phone-camera screening check that corroborates the water balance — the "prove it in the field" leg of the trust story, not a magic ML claim.

---

## Positioning — triage above spot measurements, not a replacement

Vino does not replace the consultant or the pressure bomb. It sits **above** them.

A pressure bomb reads one vine, today. A viticulturist can walk a few blocks a morning. Vino ranks **all forty** by depletion and plans the whole season, so the grower knows *which* two blocks to walk with the pressure bomb this morning — and one reading calibrates the model for the rest. The value is farm-wide **triage** and seasonal **water rationing**, the decisions a single spot measurement can't make. We're honest about the boundary: the balance is a proxy for stem water potential when no reading exists; feed us one and we anchor to it.

---

## Why we win vs. the named field

| | What it is | Why Vino beats it |
|---|---|---|
| **OpenET** | Satellite actual-ET data, beautifully done | A rear-view data layer. No phenological target, no "too wet," no schedule. **We consume ET; we don't stop at it.** |
| **CropX / Tule** | Soil-moisture & ET hardware in the ground | Capital cost per field, coverage gaps, and *minimise-stress* framing. **We rank and plan across every block with zero hardware, and treat deficit as the goal.** |
| **Lumo** | Smart valves + remote control (wine country) | An actuator. It opens the water; it still assumes more is better. **We're the brain that decides valves like Lumo's should stay shut.** |
| **CropManage** | Free UC ET-based scheduler | Born in row crops. Replaces the full deficit to keep the plant comfortable — the exact instinct that ruins premium wine. **We deliberately hold the vine in a deficit band.** |
| **TerraClim** | Terrain-adjusted SA climatology, terrain & ET-GEO science | Not a competitor — our **foundation.** TerraClim is where each block *is*, with terrain precision. Vino is the decision layer that says what to do about it, running natively on the ET-GEO data pack. |

The pattern: everyone else built a better *map*, *sensor*, or *valve*. Nobody built the thing that inverts the objective function for wine, on top of the best terrain-precise data in the country. That is the whole game.

---

## Handover-ready — a path toward a real TerraClim product

The brief judges "a path toward a real TerraClim product" — a prototype TerraClim can carry forward. We treat repo quality as a feature: **clean docs, `.env.example`, a one-command run,** and a provider architecture (`DataPackProvider` / TerraClim API / forecast feed behind one interface) that TerraClim can extend without a rewrite. The data pack is gitignored and never leaves the machine, per the IP notice. What we hand over on Monday is a working app and an architecture that drops straight onto their data.

---

## The closer

> Everyone here built a tool that says *water it.*
> Vino stands on TerraClim's terrain-precise science and adds the one thing the maps don't: it knows when to say *stop* —
> and for premium wine, that word is the difference between a crop and a bottle.
>
> **Know when to pour.**
