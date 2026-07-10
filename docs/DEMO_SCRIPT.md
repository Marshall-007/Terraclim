# Vino — Live Demo Runbook (~4 minutes)

**Know when to pour.**
Two presenters recommended: **Driver** (clicks, stays silent) and **Voice** (talks, never touches the laptop). If solo, slow down and narrate every click.

**The demo is built to land two climaxes:**
1. **"Too wet — stop watering your Cabernet."** The moment nobody else in the room can produce.
2. **The Battle Plan skips a block because rain is coming.** The moment that proves the engine reasons about the future, not the past.

Everything else is runway to those two beats. Protect them.

---

## 0. Cold open — the 30-second elevator (say this before you touch anything)

> "Every irrigation app ever built says the same thing: *this block is dry, go water it.* That's row-crop logic. Premium wine is grown the opposite way — you stress the vine **on purpose** to concentrate the fruit, and **over-watering is a defect.** So we built Vino. It scores every block against a moving target band we call the Stress Glide Path, and it's the only tool in this room that will tell a grower *'stop watering — you're diluting your Cabernet.'* Let me show you."

Then go straight to the dashboard. Don't explain the architecture. Show the product.

---

## Pre-flight checklist (do this before you walk up)

- [ ] Backend up (Open-Meteo provider) **or** frontend in **mock mode** — either demos identically. `GET /api/health` returns `200`.
- [ ] `DEMO_DATE=2026-01-20` (peak véraison / deficit-irrigation window — real archive data, mid-season action).
- [ ] **Guarantee the too-wet moment.** Confirm which premium-red block reads `too_wet` today. If none does on live data, seed it honestly: log a heavy irrigation event through the real engine —
      `POST /api/irrigation { "block_id": "B1", "date": "2026-01-18", "mm": 28 }`.
      This is a real over-irrigation event flowing through the real water balance. It is not a mock. It represents a grower who watered too hard two days ago — which is precisely the mistake Vino exists to catch.
- [ ] Field Mode: browser location permission pre-granted, or a screenshot/second device ready.
- [ ] Battle Plan input pre-set to **6 hours/day, 3-day horizon** (the config that skips B5 on rain).
- [ ] Phone or second tab open on Field Mode, warmed up.
- [ ] Laptop volume off. Wi-Fi tab open on `/api/health` so you can prove "we're live."

---

## Beat 1 — The map (0:30–1:00) · *"This is a real farm."*

**Click:** Dashboard. Seven blocks on real Stellenbosch coordinates, coloured by status.

**Say:**
> "This is a real seven-block farm outside Stellenbosch — Cabernet, Shiraz, Chenin, Sauvignon Blanc. Same rain, same heat, same day. But look — they're **not the same colour.** Because a premium Cabernet and a fresh Sauvignon Blanc want completely different amounts of stress right now. Every block is being scored against its **own** target band."

**Judge should feel:** *This isn't a toy. It knows the difference between grapes.*

---

## Beat 2 — The glide path (1:00–1:40) · *"Here's the idea that changes everything."*

**Click:** Open a healthy premium-red block (e.g. **B2 Skaliekop Shiraz**). Show the glide-path chart — the depletion line riding inside the shaded target band.

**Say:**
> "This shaded band is the Stress Glide Path — the *right* amount of deficit for a premium red at véraison. Not zero stress. The **correct** stress. This block is riding right inside its band — that's a winemaker's dream, and Vino leaves it alone. Now watch what happens when a block leaves the band the *wrong* way."

**Judge should feel:** *Okay — 'on track' means in a deficit, not comfortable. This is a different mental model.*

---

## Beat 3 — CLIMAX ONE: "Stop watering your Cabernet" (1:40–2:30)

**Click:** Open **B1 Bosberg Cabernet** — the too-wet block. The status reads **too wet**. Show the Pour Slip flip to a **Hold Slip**.

**Say (slow down — this is the moment):**
> "Here's B1, the Cabernet. Every other tool on earth is looking at this block's soil moisture and saying *'plenty of water, you're fine.'* Vino says the opposite. It's **below** its target band. It is **too wet.** And for a premium Cabernet at this stage, that means dilution, excess canopy, disease pressure — a weaker wine. So Vino does not print a watering prescription. It prints a **Hold Slip**:"

**Click:** The Hold Slip. *"Do not irrigate. ~4 days for the vine to work back into its band."*

**Say:**
> "*Stop watering. You're diluting your Cabernet.* No other product in this competition will ever say that sentence — because no other product knows that over-watering is the mistake."

**Judge should feel:** *That's the insight. I've never seen an irrigation tool tell someone to stop. That's the wine one.*

> **Fallback if the too-wet block didn't materialise:** switch to the **Scenario** tool, run `rain_event`, and show a premium red flipping into `too_wet` with a Hold Slip live. Same line, same climax, driven by the engine.

---

## Beat 4 — The forecast kills ET's weakness (2:30–2:55) · *"We're not looking backward."*

**Click:** Back on a too-dry block, scroll the glide-path chart into the **forecast** region — the projected depletion line crossing the band edge on a future date.

**Say:**
> "Here's why this isn't just another ET dashboard. ET data is a rear-view mirror — it tells you what water already left the vine. Vino projects the balance **14 days forward.** It's telling this grower the block breaches its band **next Tuesday** — while there's still time to do something about it."

**Judge should feel:** *They solved the retrospective-data problem the whole industry complains about.*

---

## Beat 5 — CLIMAX TWO: The Battle Plan skips a block on rain (2:55–3:35)

**Click:** Battle Plan. Input already set: **6 hours/day, 3 days.** Run it.

**Say:**
> "Real constraint: this grower has six hours of water a day, not enough for everyone. So Vino solves the schedule. It ranks blocks by how far off-path they are, weighted by stage sensitivity and wine value — the premium reds at véraison come first. Then look at the **skipped** list."

**Click:** Highlight the skipped block — **B5 Kloofstroom Chenin.**

**Say (this is the second climax — let it breathe):**
> "It's **skipping B5.** Not because B5 is fine — because there's **12 mm of rain forecast Thursday** that will close the deficit for free. Vino refuses to burn water and diesel on a block the sky is about to irrigate. That one decision — *don't water, it's going to rain* — is the difference between a weather app and an **intelligence** app."

**Say (land the summary):**
> "Bottom line at the top of the plan: three blocks watered, two skipped on forecast, roughly 41 cubic metres of water saved. In one screen."

**Judge should feel:** *It's reasoning about the future and the constraints together. This is genuinely intelligent, not a lookup table.*

---

## Beat 6 — The proof + the season verdict (3:35–3:55) · *"And we can prove it works."*

**Click:** Backtest. Show the flagged historical heat event with its lead time.

**Say:**
> "'How do you know the numbers are right?' We replayed the real past season through the same engine. It flagged this December heat spike **six days early.** That's not a promise — that's a receipt."

**Click (quick):** Season Water Bank — the burn-down and the *"run dry on 24 February"* verdict.

**Say:**
> "And it plans the whole season: at this burn rate, this farm runs dry 21 days before harvest. Vino says so today, while there's still time to ration."

**Judge should feel:** *They didn't just assert accuracy — they demonstrated it and they think in seasons.*

---

## Beat 7 — The closer + the TerraClim flip (3:55–4:00)

**Say (look up from the laptop):**
> "Everything you just saw is running on **free, open climate data** — no hardware, no sensors, live right now. And it's built provider-agnostic. The moment you hand us a TerraClim token, we set **one environment variable** and this entire app runs on your 1,400-station South African network. No rewrite. **Built provider-agnostic — ready to run on your network.**"

**Final line — say it slowly, then stop:**
> "Everyone else built a tool that says *water it.* Vino is the one that knows when to say *stop.* **Know when to pour.**"

Do not add anything after this. Let the room sit with it.

---

## The Field Mode kicker (use only if you have >15 seconds spare)

**Click:** Second device / Field Mode tab.
> "And this is what a grower actually uses at 6 a.m. — GPS knows which block they're standing in, and the screen says one thing: *'B4, pour 3.2 hours tonight.'* That's the whole product in their pocket."

---

## If Wi-Fi dies — the fallback (rehearse this; it must be invisible)

Vino's frontend ships with a **full mock-data fallback**. Every screen in this script renders identically with no backend.

1. Don't announce a problem. Don't say "the Wi-Fi." Keep talking.
2. Flip the frontend to **mock mode** (pre-toggled env / offline build already loaded in a second tab).
3. Run the **exact same beats** — the mock fixtures are tuned to reproduce both climaxes: B1 too-wet, B5 skipped on rain.
4. If a judge asks, be honest and turn it into a strength:
   > "That's our offline mock layer — the app is designed to keep working in a vineyard with no signal, which is most vineyards. The live engine behaves identically; I can show you `/api/health` responding the moment we're back on Wi-Fi."

The demo must never depend on the venue's network. Assume it will fail and rehearse as if it already has.

---

## Timing discipline

| Beat | Target | Hard cap |
|---|---|---|
| Cold open | 0:30 | 0:35 |
| Map + glide path | 1:10 | 1:20 |
| **Climax 1 — stop watering** | 0:50 | 1:00 |
| Forecast | 0:25 | 0:30 |
| **Climax 2 — Battle Plan skip** | 0:40 | 0:50 |
| Proof + Water Bank | 0:20 | 0:30 |
| Closer + TerraClim flip | 0:05 | 0:10 |

If you're running long, cut the forecast beat (4) and the Field Mode kicker first. **Never cut a climax.** Never cut the closer.
