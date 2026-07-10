# Vino — Live Demo Runbook (5-minute demo + 3-minute Q&A)

**Know when to pour.**
Official format (brief): **5-minute live demo, then 3-minute Q&A.** Two presenters recommended: **Driver** (clicks, stays silent) and **Voice** (talks, never touches the laptop). If solo, slow down and narrate every click. Q&A answers live in `JUDGE_QA.md` — rehearse them; the three named judges' priorities are mapped there.

**Order the demo BRIEF-CORE FIRST.** The judged feature set is the foundation and must be flawless before we show any over-delivery:
1. Field/day dashboard — ETo / ETa / Kc / NDVI at block level.
2. Recommendation — irrigate / hold / **how much**.
3. Stress alerts — blocks ranked by depletion.
4. Validation view — pressure-bomb (MPa) + WaPOR/FruitLook reference + photo corroboration + information-limited backtest.

**Then** the over-delivery, which carries the two scripted climaxes:
- **Climax 1 — "Too wet: stop watering your Cabernet"** (Hold Slip). The moment nobody else in the room can produce.
- **Climax 2 — The Battle Plan skips a block because rain is coming.** The moment that proves the engine reasons about the future.
- Then Season Water Bank, Field Mode GPS, and field photo capture.

Protect the two climaxes. Everything else is runway to them, but the brief-core four earn the right to show them.

---

## 0. Cold open — the 30-second elevator (say this before you touch anything)

> "Every irrigation app ever built says the same thing: *this block is dry, go water it.* That's row-crop logic. Premium wine is grown the opposite way — you stress the vine **on purpose** to concentrate the fruit, and **over-watering is a defect.** So we built Vino on top of TerraClim's ET-GEO science. TerraClim tells us where every block *sits* — 10-metre ETo, ETa, Kc, NDVI, at the vine. Vino tells the grower where it's *heading*, and what to do tonight. Let me show you."

Point at the header badge — **"Data: TerraClim ET-GEO"** — then go straight to the dashboard. Show the product, not the architecture.

---

## Pre-flight checklist (do this before you walk up)

- [ ] Backend up on the **ET-GEO data pack** (`DataPackProvider`), header badge reads **"Data: TerraClim ET-GEO"** — **or** frontend in **mock mode** (demos identically). `GET /api/health` returns `200`.
- [ ] `DEMO_DATE=2026-01-20` (peak véraison / deficit-irrigation window — real mid-season action). Loud banner "Viewing: 20 Jan 2026 (peak season)" visible.
- [ ] Satellite basemap tiles **pre-cached** for the farm extent (no blank grey map on venue wifi). Traced block polygons rendering over the imagery.
- [ ] **Guarantee the too-wet moment.** Confirm which premium-red block reads `too_wet` today. If none does on live data, seed it honestly: log a heavy irrigation event through the real engine —
      `POST /api/irrigation { "block_id": "B1", "date": "2026-01-18", "mm": 28 }`.
      A real over-irrigation event flowing through the real water balance — a grower who watered too hard two days ago, precisely the mistake Vino exists to catch. Not a mock.
- [ ] Validation view: at least one **pressure-bomb reading** and one **field photo** pre-logged on a block, plus the WaPOR/FruitLook reference series loaded from the data pack.
- [ ] Battle Plan input pre-set to **6 hours/day, 3-day horizon** (the config that skips B5 on rain).
- [ ] Field Mode: **manual / "simulate location" pin** set to a block as the primary path (GPS won't place you in a Stellenbosch vineyard from the venue). Phone or second tab warmed up. A canopy photo ready to capture.
- [ ] Settings screen reachable; a spare/dummy token ready to demonstrate the live provider flip if you choose to show it.
- [ ] Laptop volume off. `/api/health` tab open so you can prove "we're live."

---

## Beat 1 — Field/day dashboard (0:30–1:15) · *"This is a real farm, and here are the numbers."*

**Click:** Dashboard. Satellite basemap; seven **hand-traced** real block outlines (not rectangles) over the actual vine rows, coloured by status.

**Say:**
> "This is a real seven-block estate outside Stellenbosch — Cabernet, Shiraz, Chenin, Sauvignon Blanc. These aren't squares on a street map. We **traced the real parcels** on the satellite image, and we pull climate for that exact geometry — polygon **zonal statistics**, which is exactly what TerraClim's ET-GEO data is built for. Same rain, same heat, same day — but the blocks are **not the same colour**, because each is scored against its own target."

**Click:** Open one block. Show the per-day panel: **ETo, ETa, Kc, NDVI.**

**Say:**
> "For every block, every day, the brief's exact checklist: reference ET, **actual** ET from the data pack, the crop coefficient, and NDVI vigour. And notice — this block's measured ETa is running **below** our modelled crop ET. That's the vines already throttling back. That divergence is a stress signal, straight from the data."

**Judge should feel:** *This is the brief, built on their data, at the block. And it's real geometry, not a toy.*

---

## Beat 2 — Recommendation: irrigate / hold / how much (1:15–1:50) · *"One practical answer."*

**Click:** The block's recommendation → the **Pour Slip**.

**Say:**
> "The brief asks for one practical answer per block: irrigate, hold, or how much. Here it is — not a score, a prescription: **'B4: apply 14 mm, 3.2 hours of drip, tonight.'** Printable, WhatsApp-shareable. And we speak the grower's language — alongside soil depletion we show the **stem water potential band in MPa**, the unit a viticulturist actually manages RDI in. Too-dry blocks get a runtime; on-track blocks get left alone; too-wet blocks — you'll see in a moment — get told to stop."

**Judge should feel:** *That's an actionable number a grower can act on this morning, in their units.*

---

## Beat 3 — Stress alerts, ranked by depletion (1:50–2:15) · *"Which blocks, in what order."*

**Click:** Stress alerts / triage list — the farm ranked by depletion.

**Say:**
> "You don't manage forty blocks by staring at a map. Vino ranks the whole farm by depletion and surfaces the ones **moving toward stress** — the triage list. This is the layer that sits *above* a pressure bomb: it tells the grower *which* two blocks to walk and measure this morning, before anything goes wrong."

**Judge should feel:** *This is farm-wide prioritisation, not a single reading — that's genuinely useful at scale.*

---

## Beat 4 — Validation view (2:15–3:05) · *"How do you know it's right?"*

**Click:** Validate screen for a block. Model depletion/ETa overlaid with **WaPOR / FruitLook** reference series and logged **pressure-bomb (MPa)** readings; agreement stats (bias, RMSE, within-band %).

**Say:**
> "This is the trust screen. Our modelled water status, overlaid with the **WaPOR and FruitLook** reference series from the data pack, and a **pressure-bomb reading** a grower logged — plotted against the model, with agreement stats. Feed us one reading and we **anchor the model to that block.** We're a proxy for the pressure bomb, calibrated by it — not a replacement for it."

**Click:** The field-photo panel — a canopy photo with its GLI / canopy-cover / yellowing read and an "agrees with model" flag.

**Say:**
> "And a phone photo of the canopy, analysed with published RGB indices — Green Leaf Index, canopy cover, yellowing — **no machine learning, fully deterministic.** It corroborates the model in the field."

**Click:** The **backtest** tab.

**Say (be precise — this is where a skeptic pounces):**
> "And the replay. This is **information-limited**: on each day, the engine sees **only** the data available up to that day, projects forward, and we record whether it breached the band **before** the event actually arrived. No foreknowledge, no reading the answer off the archive. On this December heat build-up, the projection crossed the line **days ahead of the actual spike** — using only what a grower would have had at the time."

**Judge should feel:** *They validated against real references and they're honest about the backtest. This is scientifically credible.*

---

## Beat 5 — CLIMAX ONE: "Stop watering your Cabernet" (3:05–3:50)

**Click:** Open **B1 Bosberg Cabernet** — the too-wet block. Status reads **too wet**. The Pour Slip flips to a **Hold Slip**.

**Say (slow down — this is the moment):**
> "Here's B1, the Cabernet. Every other tool on earth looks at this soil moisture and says *'plenty of water, you're fine.'* Vino says the opposite. It's drifted **below** its target band — it is **too wet.** For a premium Cabernet at this stage that means dilution, excess canopy, disease pressure — a weaker wine. So Vino doesn't print a watering prescription. It prints a **Hold Slip**:"

**Click:** The Hold Slip. *"Do not irrigate. ~4 days for the vine to work back into its band."*

**Say:**
> "*Stop watering. You're diluting your Cabernet.* No other product in this competition will say that sentence — because no other product knows that over-watering is the mistake."

**Judge should feel:** *That's the insight. I've never seen an irrigation tool tell someone to stop.*

> **Fallback if the too-wet block didn't materialise:** the seeded 28 mm event (pre-flight) makes it deterministic. If it still isn't there, open the block whose depletion sits nearest the wet edge and walk the same "below-band = too wet" logic; the Hold Slip renders from the live balance either way.

---

## Beat 6 — CLIMAX TWO: The Battle Plan skips a block on rain (3:50–4:30)

**Click:** Battle Plan. Input already set: **6 hours/day, 3 days.** Run it.

**Say:**
> "Real constraint: six hours of water a day, not enough for everyone. Vino solves the schedule — ranks blocks by how far off-path they are, weighted by stage sensitivity and wine value, premium reds at véraison first. Then look at the **skipped** list."

**Click:** Highlight the skipped block — **B5 Kloofstroom Chenin.**

**Say (second climax — let it breathe):**
> "It's **skipping B5.** Not because B5 is fine — because there's **12 mm of rain forecast Thursday** that closes the deficit for free. Vino refuses to burn water and diesel on a block the sky is about to irrigate. *Don't water, it's going to rain* — that's the difference between a weather app and an intelligence app. Bottom line at the top of the plan: three blocks watered, two skipped on forecast, roughly 41 cubic metres saved. One screen."

**Judge should feel:** *It reasons about the future and the constraints together — genuinely intelligent, not a lookup table.*

---

## Beat 7 — Season Water Bank (4:30–4:45) · *"It thinks in seasons."*

**Click:** Season Water Bank — the burn-down and the *"run dry on 24 February"* verdict.

**Say:**
> "And it plans the whole season. At this burn rate, this dam runs dry **21 days before harvest.** Vino says so today, while there's still time to ration. Day-Zero resilience, built in."

**Judge should feel:** *They plan the season, not just tonight.*

---

## Beat 8 — Closer + the live data-source control (4:45–5:00)

**Say (look up from the laptop, point at the badge):**
> "Everything you've seen runs on TerraClim's ET-GEO data pack — that badge is live, and it's controlled from one screen, not a code deploy."

**Click (optional, if rehearsed and fast):** Open **Settings / Data source**. Show the provider cards (data pack active; TerraClim API / Open-Meteo selectable), paste a token, press **Activate** — the backend validates it live, re-warms the cache, and the header badge holds on **"Data: TerraClim ET-GEO."**

**Say:**
> "No redeploy, no env-file edit — a Settings screen. Hand us a live TerraClim API token and it drops in here the same way. TerraClim's terrain-precise science is the foundation; we add the forward-looking decision on top."

**Final line — say it slowly, then stop:**
> "Everyone else built a tool that says *water it.* Vino is the one that knows when to say *stop.* **Know when to pour.**"

Do not add anything after this. Let the room sit with it.

---

## The Field Mode + photo kicker (Q&A material, or if you have >20 seconds spare)

**Click:** Second device / Field Mode tab, location **simulated** to a block.
> "This is what a grower uses at 6 a.m. — pick the block you're standing in (we simulate GPS here; at the venue it can't place you in a vineyard), and the screen says one thing: *'B4, pour 3.2 hours tonight.'* Snap a canopy photo and it uploads, gets the deterministic GLI read, and lands on that block's Validation screen. The whole product in their pocket."

Field Mode and the photo capture are the first things to defer into Q&A if the 5 minutes is tight.

---

## If Wi-Fi dies — the fallback (rehearse this; it must be invisible)

Vino's frontend ships with a **full mock-data fallback**. Every screen in this script renders identically with no backend and no network.

1. Don't announce a problem. Don't say "the Wi-Fi." Keep talking.
2. Flip the frontend to **mock mode** (pre-toggled env / offline build already loaded in a second tab).
3. Run the **exact same beats** — the mock fixtures reproduce the brief-core four and both climaxes: ETo/ETa/Kc/NDVI on the dashboard, the pressure-bomb + photo + backtest on Validation, B1 too-wet, B5 skipped on rain.
4. The satellite tiles are pre-cached, so the map still renders.
5. If a judge asks, be honest and turn it into a strength:
   > "That's our offline mock layer — the app is designed to keep working in a vineyard with no signal, which is most vineyards. The live engine on the data pack behaves identically; I can show `/api/health` responding the moment we're back on Wi-Fi."

The demo must never depend on the venue's network, GPS, or live APIs. Assume all three fail and rehearse as if they already have.

---

## Timing discipline (5:00 hard cap)

| Beat | Target | Hard cap |
|---|---|---|
| Cold open | 0:30 | 0:35 |
| 1 — Dashboard (ETo/ETa/Kc/NDVI, traced blocks) | 0:45 | 0:50 |
| 2 — Recommendation (Pour Slip, MPa) | 0:35 | 0:40 |
| 3 — Stress alerts (depletion ranking) | 0:25 | 0:30 |
| 4 — Validation (pressure-bomb, WaPOR/FruitLook, photo, backtest) | 0:50 | 0:55 |
| **5 — Climax 1: stop watering** | 0:45 | 0:50 |
| **6 — Climax 2: Battle Plan skip** | 0:40 | 0:50 |
| 7 — Season Water Bank | 0:15 | 0:20 |
| 8 — Closer + data-source flip | 0:15 | 0:20 |

If you're running long, defer **Field Mode + photo to Q&A** first, then trim the **Season Water Bank** and the **live Settings flip** (keep the badge and the spoken line). **Never cut a brief-core beat (1–4) and never cut a climax.** Never cut the closer.
