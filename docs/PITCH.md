# Vino — The Pitch

**ET-GEO Hackathon 2026 · TerraClim · Team Marshall + Obey**
**Know when to pour.**

---

## The one-liner

> Every other tool in this room says *"this block is dry — water it."*
> Vino is the only one that knows, for premium wine, **over-watering is a defect** —
> so it scores each block against a moving **Stress Glide Path** and tells the grower
> exactly when to pour, and when to **stop**.

---

## The problem: data-rich, decision-poor

South African growers are drowning in climate data and starving for decisions.

- **ET is retrospective.** Evapotranspiration tells you what water *already left* the vine. It is a rear-view mirror. By the time a stress index turns red, the damage to the berry is done.
- **Generic tools misread vineyards.** Every irrigation product on the market inherits row-crop logic: measure the deficit, replace the deficit, keep the plant comfortable. That is exactly right for lettuce and exactly wrong for a Cabernet destined for a premium bottle.
- **The decision is the hard part.** A grower with a 1,400-station data network still has to answer one question every single morning: *which blocks do I water tonight, for how long, and which do I leave alone?* No dashboard answers that. They answer it by feel.

The gap in the market is not more data. It is the **decision layer** that turns data into tonight's runtime, in hours, per block.

---

## The inversion insight — the thing nobody else will say

Premium wine is not grown by keeping vines happy. It is grown by stressing them **on purpose, at the right moment**.

This is **Regulated Deficit Irrigation (RDI)**, and it is orthodox viticulture, not a stunt. A moderate, controlled water deficit between fruit set and véraison shuts down shoot growth, shrinks the berry, and concentrates skin-to-juice ratio — colour, tannin, aroma. The deficit *is* the quality.

Which means the opposite is a defect. **Over-watering premium wine grapes causes dilution, runaway canopy vigour, shading, botrytis pressure, delayed ripening, and herbaceous, thin wine.** A too-wet block is not a safe block. It is a spoiled one.

So Vino throws out the industry's single metric — "water stress" — and replaces it with the only metric that matches how wine is actually made:

> **Deviation from the Stress Glide Path** — a target deficit band, per block, that moves with the season, the grape variety, and the wine style.

A block goes red when it drifts out of its band **in either direction**. Too dry *and* too wet are both failures. Vino is the only tool in the room that will look a grower in the eye and say:

> *"Stop watering. You're diluting your Cabernet."*

Water stops being a resource to minimise. It becomes the winemaker's first instrument.

---

## The solution: the engine, the decisions, the proof

**The engine — deterministic and auditable. AI writes English; the maths writes the numbers.**

1. **Phenology from climate alone.** Growing Degree Days (base 10 °C from 1 September, scaled per variety) infer each block's stage — budbreak → flowering → fruit set → véraison → harvest — with no sensors in the ground.
2. **Daily water balance.** Per block: `ETc = ET0 × Kc(stage)`, root-zone depletion tracked against total available water.
3. **The Stress Glide Path.** A target depletion band per stage × wine style. Signed deviation drives one of three verdicts: **on track / too dry / too wet.**
4. **A 14-day forecast.** We project the deviation forward. This is the answer to ET's fatal flaw: Vino is not retrospective. It tells you the block will breach its band **next Tuesday**, while you can still act.

**The decisions — what the grower actually holds in their hand.**

5. **Pour Slip.** Not a score — a prescription. *"B1: apply 14 mm, 7.0 h drip, tonight."* Printable, WhatsApp-shareable. Too-wet blocks get a **Hold Slip**: *"Do not irrigate for 4 days."*
6. **Battle Plan.** *"I have 6 hours of water a day."* → a constraint-solved, multi-day schedule that ranks blocks by stage sensitivity × wine value, **skips blocks with rain inbound**, and reports the water it saved.
7. **Season Water Bank.** Your dam has a finite volume. Vino amortises it across the rest of the season by phenological priority and gives a verdict: *"You run dry on 24 February — 21 days short of harvest."* Day-Zero resilience, built in.
8. **Field Mode.** GPS detects the block you're standing in and shows **one number**: *"B4 · Pour 3.2 h tonight."* The daily-use hook that lives in a grower's pocket.

**The proof — what convinces a judge who has heard ten pitches.**

9. **Backtest.** We replay the real past season through the engine and show it flagging actual heat events **days before they hit**. This is not a claim. It is a receipt.

---

## Why we win vs. the named field

| | What it is | Why Vino beats it |
|---|---|---|
| **OpenET** | Satellite actual-ET data, beautifully done | A rear-view data layer. It measures what evaporated. It has no phenological target, no "too wet," no schedule. **We consume ET; we don't stop at it.** |
| **CropX / Tule** | Soil-moisture & ET hardware in the ground | Capital cost per field, coverage gaps, and *minimise-stress* framing. **We forecast with zero hardware and treat deficit as the goal, not the enemy.** |
| **Lumo** | Smart valves + remote control (wine country) | An actuator. It opens the water; it still assumes more water is better. **We're the brain that decides valves like Lumo's should stay shut.** |
| **CropManage** | Free UC ET-based scheduler | Born in row crops. Replaces the full deficit to keep the plant comfortable — the exact instinct that ruins premium wine. **We deliberately keep the vine in a deficit band.** |
| **TerraClim WebApp** | 1,400-station SA climate network + portal | Not a competitor — our **substrate**. TerraClim is the best production data layer in the country. Vino is the decision layer that makes it actionable. **One env var and Vino runs on your network.** |

The pattern: everyone else built a better *map* or a better *sensor* or a better *valve*. Nobody built the thing that inverts the objective function for wine. That is the whole game, and we're alone in it.

---

## The "wow" — where we over-delivered

| What a judge expects from a hackathon irrigation app | What Vino actually ships |
|---|---|
| A stress heat-map | A **bi-directional glide path** with genuine too-wet alerts |
| "This block is dry" | A **printable Pour Slip**: millimetres → drip runtime in hours |
| One block at a time | A **constraint-solved multi-day Battle Plan** that skips blocks on forecast rain |
| A number you have to trust | A **14-day forecast** and a **backtest** that catches real heat events early |
| "Trust the demo" | A **Season Water Bank** with a hard Day-Zero verdict |
| A dashboard on a laptop | **GPS Field Mode** — one number, in the row, on a phone |
| A demo hard-wired to one dataset | **Provider-agnostic**: free Open-Meteo today, **TerraClim on one env var** |

---

## The closer

> Everyone here built a tool that says *water it.*
> Vino is the one that knows when to say *stop* — and for premium wine, that word is the difference between a crop and a bottle.
>
> **Know when to pour.**
