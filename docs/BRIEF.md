# ET-GEO Hackathon 2026 — Official Brief (from terraclim.com)

Captured from the hackathon page, 10 July 2026. The detailed data-pack/starter-kit brief arrives at kick-off; this is the binding public brief.

## Logistics

| Item | Detail |
|---|---|
| Format | Online sprint, from anywhere |
| Dates | Thu 16 – Sun 19 July 2026 |
| Demo day | Sun 19 July — **5-minute live demo + 3-minute Q&A**, judging, winner announced |
| Submission | Mon 20 July, **09:00** — final prototype package for review and handover |
| Apply by | **10 July 2026** (entries confirmed 14 July) |
| Teams | Individuals or teams, max 4 |
| Prize | R30,000 pool + optional 3-month TerraClim internship for winners |

## The mission (verbatim essence)

> "The maps exist. The tool does not yet. In one weekend, turn TerraClim's ET-GEO science for daily, 10 m, vine-specific water use into a working prototype growers can open and act on."
> **Goal: Help growers see how much water each vineyard needs, today.**
> "Usable means one practical answer. For each vineyard block: how much water the vines are using, whether they are heading into stress and whether to irrigate or hold today."

## What must be built (the judged feature set)

1. **Field/day dashboard** — ETo, ETa, Kc, NDVI and daily vineyard water-use signals at block level, per day.
2. **Recommendation engine** — convert soil-water status into clear grower actions: **irrigate / hold / review**, including **how much**.
3. **Stress alerts** — rank blocks by **depletion**; surface vineyards moving toward stress.
4. **Validation view** — make WaPOR, FruitLook etc. and **stem water potential (pressure-bomb) checks** visible enough to build trust.

## What entrants receive (the data pack)

- Curated ET-GEO data pack + working starter context
- **10 m daily ETo surfaces** (rasters)
- **Sentinel-2 vigour indices** (NDVI etc.)
- **Kc and phenology records**
- **Random-forest ETa model** (actual ET outputs)
- WaPOR, FruitLook etc. and pressure-bomb validation checks; benchmark validation context
- Mentorship from TerraClim product/research/technical leads; AI-assisted development encouraged

## Judging

Judged on **practical usefulness and scientific credibility**: usefulness, validation, interface clarity, working prototype quality, and "a path toward a real TerraClim product" — a **handover-ready prototype TerraClim can carry forward**. Everyone builds from the same data baseline, so the tool layer is the differentiator.

Sprint leads / judges:
- **Dr Tara Southey** — Founder & CEO (industry challenge framing: decisions growers and viticulturists can trust)
- **Prof. Adriaan van Niekerk** — Co-founder & Research Lead (scientific rigour of ET-GEO models and validation)
- **Mbulelo Ntlangu** — Technical Lead (working interface, clear data flow, handover-ready prototype)

## Run of show

| Day | Focus |
|---|---|
| Thu 16 | Kick-off: brief, data pack, starter kit, team formation, first data load |
| Fri 17 | Build the core: render ETo and ETa, climate + vigour layers, first stress logic |
| Sat 18 | Decision support: recommendation engine, validation panel, alerts, UX polish |
| Sun 19 | Demo day: 5-min live demo, 3-min Q&A, judging, winner announcement |
| Mon 20 | Submit final prototype package by 09:00 |

## Data & IP notice (binding)

TerraClim reserves all rights in its data, research assets, challenge materials and submitted work. TerraClim may use, adapt and build on submitted concepts, code and prototypes. **TerraClim data, research assets, starter files and access credentials may not be copied, published, redistributed or shared with third parties without written permission.**

**Team rule derived from this:** the TerraClim data pack must NEVER be committed to this repository (gitignored path: `backend/app/data/datapack/`). Keep the repository private for the duration of the hackathon.
