# Vino — Specification Consistency Audit

**Scope:** `docs/API_CONTRACT.md` (v1 + v2 addendum), `docs/BRIEF.md`, `docs/REVISIONS.md` (R1–R17),
`PLAN.md`, `docs/RED_TEAM.md`, `backend/app/data/*.json`, `backend/app/schemas.py`,
`frontend/src/types/api.ts`, plus `docs/DEMO_SCRIPT.md`, `docs/PITCH.md`, `docs/JUDGE_QA.md` where they
assert contract-level facts. Audited against working-tree contents on 2026-07-10 (after the
docs-reconciliation pass on PLAN/DEMO_SCRIPT/PITCH/JUDGE_QA). Backend/frontend code is being actively
upgraded by other agents; only **structural** spec-vs-declared-type mismatches are flagged, not
transient build states.

**Severity scale:** Critical (can lose the demo / binding spec self-contradiction) · High (judge-visible
error or two implementers will diverge) · Medium (weakens correctness or requires a guess) · Low (polish).

Line numbers refer to current file contents.

---

## A. The score formula and the contract's own worked example

### F1 — The Water Stress Score is defined two incompatible ways; the worked example matches neither as written — **Critical**

**Location:** `docs/API_CONTRACT.md` §"Deviation & status" (line 54) vs the `/api/blocks/{id}/status`
worked example (lines 84–88). Confirms `docs/RED_TEAM.md` §1.7 / `docs/REVISIONS.md` R7.

**Statement 1** (line 54, first clause):

> `score` (0–100) = `min(100, round(|deviation| / 0.35 × 100))`

**Statement 2** (line 54, second clause, same sentence):

> blended with forecast pressure: `score = min(100, round(0.7×deviation_component + 0.3×forecast_component))` where forecast_component = projected |deviation| in 7 days scaled the same way.

**Worked example** (lines 84–88): B1, `depletion_fraction: 0.68`, `target_band: [0.35, 0.55]`,
`deviation: 0.13`, `score: 62`.

Arithmetic:
- Statement 1 gives `round(0.13 / 0.35 × 100) = round(37.14) = 37`, not 62. The example is **not**
  consistent with Statement 1.
- Statement 2 reproduces 62 **exactly** and **only** if the components are *not* individually capped at
  100: `deviation_component = 37.14`; then `forecast_component` must be `(62 − 0.7×37.14) / 0.3 = 120`,
  i.e. projected |deviation| in 7 days = `0.42` (projected `f ≈ 0.97`, the clamp ceiling), giving
  `0.7×37.14 + 0.3×120 = 26.0 + 36.0 = 62.0`. With per-component caps at 100 the maximum reachable score
  from `deviation = 0.13` is `0.7×37.14 + 0.3×100 = 56`, so 62 would be unreachable.
- The traffic light depends on this choice: 37 → `watch`, 56 → `high`, 62 → `high`. The example says
  `"traffic": "high"`, again consistent only with the blended, uncapped-component reading.

**Consequence:** the frontend mock (`frontend/src/services/mocks.ts` line 610, `scoreSimple`) implements
Statement 1 verbatim (`Math.min(100, Math.round((Math.abs(deviation) / 0.35) * 100))`, no blend) for the
Scenario screen, while the hand-authored dashboard scores (B1=64 for f=0.66) imply the blend. Live
backend vs mock vs Scenario-within-mock can all disagree on the same block, on stage, in front of judges.

**Proposed canonical formulation** (single statement; replaces both clauses of line 54):

```
deviation_component = |deviation_today| / 0.35 × 100                     # uncapped
forecast_component  = |projected deviation at as_of + 7 d| / 0.35 × 100  # uncapped; deviation measured
                                                                          # against the band of the stage
                                                                          # projected for that day
score = min(100, round_half_up(0.7 × deviation_component + 0.3 × forecast_component))
```

with an explicit note per R7: *0.35 (full-scale deviation), 0.7/0.3 (now-vs-forecast blend) are tunable
heuristics, not sourced constants.* State that only the final blend is capped. Update `scoreSimple` in
mocks (or restrict it to computing deltas where the blend cancels). Specify `round_half_up` explicitly —
see F19.

### F2 — The worked example's stage contradicts the contract's own phenology table — **High**

**Location:** `docs/API_CONTRACT.md` phenology table (lines 16–28) vs `/status` example (line 85).

The table: veraison enters at GDD 1150, thresholds "scaled by variety factor", Cabernet Sauvignon
factor **1.15** → B1 (Cabernet) enters veraison at `1150 × 1.15 = 1322.5` and leaves fruit_set there.
The example says:

> `"stage": "veraison", "gdd": 1231.5`

1231.5 < 1322.5, so by the contract's own rules B1 is in **fruit_set**, whose premium_red band is
`[0.45, 0.65]` — making `f = 0.68` a deviation of **0.03**, not 0.13, and collapsing the example's score,
traffic, and pour slip. (The frontend mock avoids this: B1 carries `gdd: 1455.2`, which is validly
veraison.)

**Resolution:** raise the example's `gdd` to a value ≥ 1322.5 (e.g. 1455, matching the mock), or state
explicitly that examples are pre-variety-scaling. Prefer fixing the number — an implementer will use this
example as a regression fixture.

### F3 — The worked pour slip contradicts the pour-slip formula by ~2× — **High**

**Location:** `docs/API_CONTRACT.md` §"Pour Slip math" (line 58) vs `/status` example (lines 95–99).

Formula:

> `needed_mm = max(0, D − mid×TAW)` where `mid = (lo+hi)/2` — bring depletion back to band midpoint.

Example inputs: `D = 82.1 mm`, band `[0.35, 0.55]` → `mid = 0.45`, `TAW = 120`. The formula yields
`82.1 − 54 = 28.1 mm` → `28.1 / 2.0 = 14.1 h`. The example instead says:

> `"needed_mm": 14.1, "runtime_hours": 7.0` … `"recommendation": "Apply 14 mm (7.0 h drip) tonight …"`

14.1/7.0 is exactly **half** the formula's output (28.1/14.05) — it looks like a "split over two nights"
halving that the spec never mentions. Two implementers will ship prescriptions differing by 2×, on the
number the whole product exists to produce.

**Resolution:** correct the example to `needed_mm: 28.1, runtime_hours: 14.1` (and the recommendation
string), **or** if split application is intended, specify the split rule in §"Pour Slip math"
(e.g. "cap a single night at X mm / Y h; emit the remainder as a follow-up"). Do not leave both.

### F4 — The water balance is specified twice: v1 without Ks/effective rainfall, addendum §A with them — **High**

**Location:** `docs/API_CONTRACT.md` §"Water balance" (line 35) vs v2 addendum §A (line 226); also
`PLAN.md` §2 item 2.

v1 (line 35):

> Depletion: `D_t = clamp(D_{t-1} + ETc_t − rain_t − irrigation_t, 0, TAW)`

v2 §A (line 226):

> `Ks = (TAW − D)/(TAW − RAW)` when `D > RAW` else 1; `ETc_adj = ET0 × Kc × Ks`. Effective rainfall:
> days < 2 mm ignored; daily infiltration capped at 40 mm.

PLAN.md §2 states only the Ks form. The addendum never says it supersedes the v1 equation, and the v1
"Deviation & status" and "Pour Slip math" sections still read as if `ETc` (unadjusted, full rain) drives
`D`. An implementer working from the v1 domain-model section reproduces exactly the error RED_TEAM 1.2/1.3
flagged.

**Resolution:** edit the v1 §"Water balance" to the §A form (or add "superseded by v2 §A — the balance
always uses `ETc_adj` and effective rainfall"). One equation, stated once.

### F5 — Ks is circular as written: which D feeds Ks on day t? — **Medium**

**Location:** `docs/API_CONTRACT.md` §A (line 226).

`Ks` depends on `D`, but `D_t` depends on `ETc_adj,t` which depends on `Ks_t`. Whether implementers use
`D_{t-1}` (explicit forward Euler) or iterate to convergence changes every depletion trace slightly and
compounds over a season.

**Resolution:** specify `Ks_t = f(D_{t-1})` (start-of-day depletion). Also state whether the 40 mm
infiltration cap applies to rain only or to rain + irrigation combined (recommend: rain only; drip is
below runoff rates).

### F6 — The 7-day forecast component doesn't say which band applies if the stage changes — **Medium**

**Location:** `docs/API_CONTRACT.md` line 54 ("projected |deviation| in 7 days").

A block near a stage threshold (see F2 — B1 sits near one) can enter a new stage within the 7-day
projection window; fruit_set→veraison shifts the premium_red band from [0.45,0.65] to [0.35,0.55], which
alone can flip the sign of the projected deviation.

**Resolution:** state: *projected deviation is measured against the band of the stage projected for
`as_of + 7 d`* (consistent with how the timeseries forecast rows carry per-day `band_lo/band_hi`).

---

## B. The demo's money shot: which block is too wet?

### F7 — Five artifacts disagree on the identity of the too-wet block — **Critical**

**Locations & quotes:**

1. `docs/REVISIONS.md` R6: "Seed the irrigation log with a realistic over-irrigation event on one
   **premium-red** block (e.g. **B1** Bosberg Cabernet: **28 mm** applied recently) so it
   deterministically reads `too_wet` on the demo date."
2. `docs/DEMO_SCRIPT.md` Beat 5 (line 106): "Open **B1 Bosberg Cabernet** — the too-wet block." and
   pre-flight (line 35): `POST /api/irrigation { "block_id": "B1", "date": "2026-01-18", "mm": 28 }`.
   Fallback section (line 181): "the mock fixtures reproduce … **B1 too-wet**, B5 skipped on rain."
3. `PLAN.md` §8: "A 'too wet' Hold Slip on at least one **premium-red** block."
4. `backend/app/data/irrigation_log.json` (line 462–466): the seeded over-irrigation event is
   `{"block_id": "B3", "date": "2026-01-19", "mm": 53.1}` — on **B3 Rivierkant Merlot**
   (`wine_style: "red"`, *not* premium_red). **No 28 mm B1 event exists in the log**; B1's most recent
   entries are 5.2 mm (01-14) and 11.5 mm (01-11).
5. `frontend/src/services/mocks.ts` (lines 164–196): **B1 is `too_dry`** (f 0.66, score 64), B2 `too_dry`
   critical; the too-wet blocks are **B3** (f 0.24) and **B5** (f 0.18).
6. `docs/API_CONTRACT.md`'s own examples agree with the mocks, not the script: `/status` example shows
   **B1 too_dry** (line 88), and the battle-plan example (line 137) skips **B3**: "Currently too wet —
   irrigation would push it further off path."

**Consequence:** on the live engine the too-wet block will be **B3 (Merlot, plain red)** — Beat 5's
"Stop watering. You're diluting your **Cabernet**" line and PLAN's premium-red success criterion are both
unsatisfiable as seeded; in mock fallback mode B1 renders **too_dry** while the Voice says it's too wet.
The single most rehearsed moment of the demo points at the wrong block in both data paths.

**Resolution (pick one canonical state and propagate):** either (a) move the seeded event to B1 per
R6/DEMO_SCRIPT (e.g. B1 2026-01-18, ~28–35 mm; verify it actually crosses `lo` given B1's balance), flip
mocks so B1 is too_wet, and keep B3 merely wet-leaning; or (b) rewrite Beat 5/PLAN/JUDGE_QA around B3 and
drop the "your Cabernet" line (weaker — the premium-red framing is the thesis). Either way, fix
DEMO_SCRIPT line 181's claim about what the mocks reproduce, and decide whether the contract's B1-too-dry
examples should stay (they can, if labelled as illustrative rather than demo-date truth).

### F8 — "B4: apply 14 mm, 3.2 hours of drip" is arithmetically impossible and B4 is on_track in the mocks — **High**

**Locations & quotes:**

- `docs/DEMO_SCRIPT.md` Beat 2 (line 66): "**'B4: apply 14 mm, 3.2 hours of drip, tonight.'**"
- `PLAN.md` §2 item 8: "one number on screen: '**B4 · Pour 3.2 h tonight**.'" (repeated in DEMO_SCRIPT
  line 169 and `docs/JUDGE_QA.md` line 67: "pour **3.2 hours on B4** instead").
- `docs/API_CONTRACT.md` fixture table (line 217): B4 `application_rate_mm_h = 2.0`.

At 2.0 mm/h, 14 mm ⇒ **7.0 h** and 3.2 h ⇒ **6.4 mm**; "14 mm, 3.2 h" implies a 4.4 mm/h rate no block
has. Worse, `frontend/src/services/mocks.ts` (line 187) has **B4 on_track** ("No irrigation needed;
recheck 2026-01-24"), so in mock fallback Beat 2 opens a block with *no* pour prescription at all.

**Resolution:** make the spoken pair self-consistent (e.g. "6.4 mm, 3.2 hours" or "14 mm, 7 hours") and
point Beat 2 at a block that is actually too_dry in both data paths (B1 or B2 in the current mocks —
noting F7's outcome decides which). Update PLAN §2 item 8 and JUDGE_QA line 67 to match.

### F9 — Climax 2's skip reason and savings figure don't survive the mock fallback — **Medium**

**Locations & quotes:**

- `docs/DEMO_SCRIPT.md` Beat 6 (line 132): "It's **skipping B5** … because there's **12 mm of rain
  forecast Thursday** … roughly **41 cubic metres** saved." — matching the contract's battle-plan example
  (`docs/API_CONTRACT.md` lines 136, 139: B5 "12 mm rain forecast Thursday closes the deficit", "est.
  41 m³ water saved").
- `frontend/src/services/mocks.ts` (lines 192–196, 502–510, 520–526): B5 is skipped because it is
  **`too_wet`** ("Currently too wet — irrigation would push it further off path"), not because of rain,
  and the computed summary savings are **585 m³** (savedMm × area: 168+288+72+57), not 41.

Note also the contract's own "41 m³" is implausible under its own demand model (1 mm over 1 ha = 10 m³;
skipping 12 mm on 3.6 ha B5 alone is ~432 m³) — the example number appears invented at a different scale.

**Resolution:** decide B5's canonical demo-date state (rain-skip requires B5 to be deficit-but-rain-coming,
which contradicts mocks' too_wet B5 — see F7 resolution), align the mock skip reason, and recompute one
canonical savings number (define the baseline: "what a deficit-replacement scheduler would have poured on
skipped blocks over the horizon"). Update contract example, mocks, and Beat 6 to the same figure.

### F10 — The Season Bank verdict spoken on stage cannot be produced by the mock model — **Medium**

**Locations & quotes:**

- `docs/DEMO_SCRIPT.md` Beat 7 (line 140/143): "the *'run dry on **24 February**'* verdict … runs dry
  **21 days before harvest**" — matching `docs/API_CONTRACT.md` (line 149): `"run_dry_date": "2026-02-24",
  "days_short": 21`.
- `frontend/src/services/mocks.ts` (lines 52, 537–553): `SEASON_END = '2026-04-15'`; with
  remaining 12 000 m³ and demand 15 400 m³ over 85 days, run-dry lands ≈ **2026-03-27**, days_short ≈ 19.

The spoken date and the mock screen differ by a month. Root cause: the **season end / harvest date is not
defined anywhere in the contract** (see F16) — 24 Feb + 21 days implies harvest ≈ 17 Mar; the mock invents
15 Apr.

**Resolution:** define the season end in the contract (see F16), regenerate the contract example and mock
from it, and re-quote Beat 7 from the regenerated number.

---

## C. Algorithm determinism: battle plan, season bank, backtest, scenario

### F11 — The battle-plan spec is not deterministic: two implementers will produce different plans — **High**

**Location:** `docs/API_CONTRACT.md` line 142:

> Greedy scheduler: per day, rank blocks by projected too-dry deviation × stage sensitivity
> (fruit_set/veraison weigh double) × wine-style weight (premium_red 1.3, red 1.15, white 1.0,
> fresh_white 1.0); skip blocks with ≥8 mm rain forecast within 48 h; allocate hours until block reaches
> band midpoint or day budget exhausts.

Underspecified parameters (each answered differently by a reasonable implementer):

1. **"projected" deviation at what horizon** — deviation today, at the plan day, or at end of horizon?
2. **Feedback:** do day-1 allocations update the balance used to rank day 2 (the mock does not re-rank;
   it decrements a per-block `remainingHours` — `mocks.ts` lines 477–498)?
3. **"within 48 h" anchored where** — from `as_of` or from each plan day?
4. **Stage weights for the other five stages** — 1.0 implied but unstated; are dormant/post_harvest blocks
   eligible at all?
5. **Eligibility** — only blocks too_dry *now*, or blocks projected too_dry within the horizon?
6. **Tie-breaking** on equal priority (block id order? area?).
7. **Rounding** of allocated hours (mock: 0.1 h) and the minimum allocatable slice.
8. **Can a block receive water on multiple days**, and does it stop at midpoint per-day or cumulatively?
9. **`skipped` membership:** the contract example lists only 2 actively-skipped blocks of 4 non-watered;
   the mock puts **all** non-watered blocks in `skipped` (lines 502–510). Same request, different list.
10. **"est. N m³ water saved"** in `summary` — the counterfactual baseline is undefined (see F9).

**Resolution:** pin each of the ten in §"POST /api/battle-plan": rank by deviation projected at each plan
day with post-irrigation feedback; 48 h from the plan day; weights: named stages ×2, all others ×1,
dormant/post_harvest ineligible; eligible = projected `f > hi` on the plan day; ties by block id; hours
rounded to 0.1 h, minimum 0.5 h; blocks may span days until cumulative midpoint; `skipped` = blocks that
were candidates but excluded, with reason; savings baseline defined as in F9. (These are proposals — any
fixed choice is fine; the point is to choose.)

### F12 — The season-bank demand model is underspecified on five axes — **High**

**Location:** `docs/API_CONTRACT.md` line 155:

> Demand model: Σ over future days & blocks of `max(0, ETc − expected_rain) × area_m2 / 1000` restricted
> to keeping each block at band midpoint; forecast used for the first 14 days, stage-mean climatology after.

Missing:

1. **The end date of the sum** — per-block harvest date (variety-scaled GDD 1600 crossing, projected with
   climatology)? A farm-wide fixed date? The mock hardcodes `2026-04-15`; the contract example implies
   ≈ 17 Mar (F10). This alone swings `projected_demand_m3` by ~30%.
2. **"restricted to keeping each block at band midpoint"** — does that mean irrigation only when projected
   `D > mid×TAW` (deficit-maintenance), or daily replacement of `max(0, ETc − rain)` (the formula as
   literally written, which ignores the band entirely)? The two differ materially for RDI blocks.
3. **Climatology source** — stage-mean of *which* data (this season's history? multi-year archive? which
   provider)? Undefined ⇒ non-reproducible demand.
4. **Verdict thresholds** — `ok`/`tight`/`shortfall` boundaries are never given; the mock invents
   `tight = remaining ≥ 85% of demand` (`mocks.ts` line 545). `days_short` ("days short" of what) and
   `run_dry_date` computation are likewise undefined; is `run_dry_date` null when verdict is ok
   (contract example shows a date only in shortfall; TS type allows `string | null`)?
5. **Whether future ETc uses Ks** and effective-rainfall rules (§A) — under deficit the two models diverge
   exactly when the bank matters.

**Resolution:** add to the endpoint spec: season end = per-block projected harvest-entry date via
climatology GDD (cap at a fixed fallback date, e.g. 15 Apr); demand = irrigation needed to keep projected
`D ≤ mid×TAW` under the §A balance (with Ks, effective rainfall); climatology = per-stage mean of the
current provider's archive for the same location, trailing N seasons (N=1 acceptable if stated); verdict:
`ok` if remaining ≥ demand, `tight` if ≥ 0.85×demand, else `shortfall` (adopting the mock's constant —
document it as heuristic); `days_short = season_end − run_dry_date` in days, 0 when ok;
`run_dry_date = null` when ok.

### F13 — Backtest event detection is entirely unspecified — **Medium**

**Location:** `docs/API_CONTRACT.md` lines 161–171 and v2 §G.

The response contains `events` with `"type": "heat_spike"`, `lead_days`, `blocks_flagged` — but nothing
defines what constitutes an event (Tmax threshold? band-breach count? consecutive days?), how `lead_days`
is measured (first projection-crossing to event start?), or what `farm_mean_score` uses for its forecast
component on historical days under the information-limited rule (§G says "the forward projection the
engine would have had" — from what forecast source, since archived forecasts don't exist? RED_TEAM C1
suggests climatology-forward; the contract never says). The mock invents a second event type
(`wet_swing`, `mocks.ts` line 668) that appears nowhere in the contract.

**Resolution:** define in §G: event = day with Tmax ≥ 36 °C (heat_spike) or ≥ 10 mm rain (wet_swing) —
or whatever thresholds the team picks; `lead_days` = event date minus the first day the information-limited
projection breached the band; the day-D forward series = stage-mean climatology (per F12.3). Enumerate the
allowed `type` values.

### F14 — Scenario semantics: the contract's forward-only perturbation cannot change today's depletion, but the mock changes it — **Medium**

**Location:** `docs/API_CONTRACT.md` line 159 vs `frontend/src/services/mocks.ts` lines 587–641.

Contract:

> array of per-block `status` objects (same schema as `/status`) computed with the **perturbed forward
> series**, plus `"delta"` per block: score change vs baseline.

If only the *forward* series is perturbed, `depletion_mm`/`depletion_fraction`/`deviation` at `as_of` are
unchanged by construction — only the forecast component of the score (and the pour slip's forward
elements) can move. The mock instead shifts **today's** `depletion_fraction` by a per-scenario delta
(`f2 = clamp(def.f + df …)`, line 626) and rescores with the unblended formula (F1), i.e. it simulates
"the scenario already happened". These are different products: one answers "what will this do to us",
the other "what if it had already happened". Also unspecified: whether `days` scales the perturbation
(mock: linearly, `df × days/7`) and what `rain_event +25 mm over 2 days` means when `days = 30`
(`backend/app/schemas.py` allows `days ≤ 30`).

**Resolution:** state in the contract: perturbation applies to the forecast series for the next `days`
days; the response's balance fields are projected to `as_of + days` under the perturbation (this matches
the mock's observable behaviour and is the more demo-legible choice), and `delta` = score(perturbed
projection) − score(unperturbed projection at the same future date). Or keep as_of fixed and say only the
forecast component moves — but then fix the mock. Define `days` semantics for `rain_event`.

---

## D. Brief coverage: gaps and contradictions

### F15 — Kc — a named, judged checklist item — is not exposed by any endpoint — **High**

**Location:** `docs/BRIEF.md` line 25 vs `docs/API_CONTRACT.md` (all payloads) and `PLAN.md` §3.

Brief (judged feature 1): "**Field/day dashboard** — ETo, ETa, **Kc**, NDVI and daily vineyard water-use
signals at block level, per day." `docs/DEMO_SCRIPT.md` Beat 1 (line 52): "Show the per-day panel:
**ETo, ETa, Kc, NDVI**." PLAN's provider sketch (line 61) even lists `kc` in the `get_daily` return.

But: `DailyWeather` (contract lines 193–202, v2 §A) has `et0/rain/tmax/tmin/rh/wind/solar/eta/ndvi` —
**no `kc`**. Timeseries rows carry `et0, etc, eta, ndvi` — no `kc`. `/status` has `stage` but no `kc`.
Kc is derivable as `etc/et0` (until Ks ≠ 1 makes `etc/et0 = Kc×Ks`, at which point the derived value is
wrong exactly when the vines are stressed). R12's "Kc from NDVI when vigour data exists" is also promised
in REVISIONS but absent from the contract addendum.

**Resolution:** add `kc` (the stage/NDVI-derived coefficient, pre-Ks) to timeseries history/forecast rows
and to `/status` (e.g. `"kc": 0.70`), and to §E's datapack layer list ("Kc and phenology records" are in
the brief's data-pack contents but §E only mentions ETo/ETa/NDVI). Add one line for the Kc–NDVI relation
or explicitly defer it.

### F16 — Brief says "rank blocks by depletion"; the briefing endpoint ranks by score — **Medium**

**Location:** `docs/BRIEF.md` line 27 vs `docs/API_CONTRACT.md` line 175.

Brief (judged feature 3): "**Stress alerts** — rank blocks by **depletion**; surface vineyards moving
toward stress." Contract: "`GET /api/briefing` … sorted by **score desc**". These orderings differ
materially in this product: a too-wet block has *low* depletion and a *high* score, so it tops a
score-ranked list while a depletion-ranked list puts it last. `docs/DEMO_SCRIPT.md` Beat 3 (line 74) says
on stage: "the farm **ranked by depletion**" — describing a screen the contract sorts differently.

Also ambiguous: line 175 describes the response as an "array of per-block `{…}` … **plus** `farm_summary`
string" — a bare JSON array cannot carry an extra property. `frontend/src/types/api.ts` (lines 242–245)
resolves it as `{blocks: […], farm_summary: string}`; the contract text should say so.

**Resolution:** keep score-desc as the triage order (it *is* "moving toward stress", bidirectionally) but
add `depletion_fraction` to each briefing row and a documented secondary "sort by depletion" toggle so the
brief's literal wording is demonstrable; change Beat 3's line to "ranked by stress score — depletion and
trajectory" or add the depletion sort on screen. Fix the response-shape sentence to the object form.

### F17 — The brief's "irrigate / hold / review" action triad has no "review" in the contract — **Low**

**Location:** `docs/BRIEF.md` line 26 vs `docs/API_CONTRACT.md` §Pour Slip / `/status`.

Brief: "convert soil-water status into clear grower actions: **irrigate / hold / review**, including how
much." The contract's action vocabulary is pour-slip `type: "pour" | "hold"` plus status
`on_track/too_dry/too_wet` — nothing is ever labelled "review". The judged wording is easy to satisfy
(on_track ⇒ review/recheck with `next_check`), but no field carries it.

**Resolution:** add a derived `"action": "irrigate" | "hold" | "review"` to `/status` (too_dry→irrigate,
too_wet→hold, on_track→review) so the UI can echo the brief's exact verbs.

---

## E. Field/name/type mismatches (contract vs types vs data files)

### F18 — `frontend/src/types/api.ts` declares a `terrain` block property the contract never defines — **Medium**

**Location:** `frontend/src/types/api.ts` lines 37–43, 56 vs `docs/API_CONTRACT.md` `/api/blocks`
(lines 71–79) and the v2 addendum.

The TS types add:

> `terrain?: BlockTerrain` — `{elevation_m, slope_deg, aspect, jan_et0_normal_mm_day, annual_rain_normal_mm}`
> "TerraClim terrain + long-term normals — present once the data pack loads."

This implements REVISIONS R1's "terrain/normals panel per block", but the contract — which declares itself
binding and says "Any change must be reflected here first" (line 3) — has no such property in `/api/blocks`
nor an addendum section for it. A backend implementer building strictly from the contract will never emit
it; the panel renders empty forever.

**Resolution:** add an addendum §H (Terrain & normals, R1): `/api/blocks` feature properties gain optional
`terrain` with exactly these five fields and units; absent until a terrain source (TerraClim/datapack)
loads; placeholder values must be labelled modelled per R1.

### F19 — Rounding is unspecified and the two reference implementations round differently — **Medium**

**Location:** `docs/API_CONTRACT.md` line 54 (`round(...)`) et al.; Python backend vs TS mocks.

Python's built-in `round()` is banker's rounding (round-half-even: `round(37.5) = 38`, `round(36.5) = 36`);
JS `Math.round()` is round-half-up. The contract uses bare `round(…)` for the score and "rounded to 0.1 h"
for runtime without naming a rule, so backend and mock can legitimately differ by 1 on scores that sit on
a .5 — enough to flip a traffic band at the 25/26, 50/51, 75/76 boundaries. Display rounding is also mixed:
the example emits `needed_mm: 14.1` but the recommendation says "14 mm".

**Resolution:** one line in Conventions: *all `round(x)` in this contract means round-half-up
(`floor(x + 0.5)`); mm values to 0.1; hours to 0.1; recommendation strings render mm as integers.*

### F20 — `eta` vs `eta_measured`; `token_status` vs `token` — REVISIONS and contract use different names — **Low**

**Locations:**

- `docs/REVISIONS.md` R12: "Extend `DailyWeather`/engine with optional **`eta_measured`** and `ndvi`" vs
  `docs/API_CONTRACT.md` §A: "`DailyWeather` gains optional **`eta`**: float | None". TS follows the
  contract (`HistoryPoint.eta`).
- `docs/REVISIONS.md` R11: `"token": "set (••••1234)"` vs contract §D: `token_status: "unset"|"set (••••1234)"`.
  TS follows the contract (`Settings.token_status`).

**Resolution:** the contract wins by its own rule; add "(named `eta`/`token_status` in the contract)"
notes to R12/R11 or simply treat REVISIONS as historical. No code change needed — flagged so nobody
"fixes" the contract toward REVISIONS.

### F21 — v2 §F omits schemas the TS types had to invent: `user_created`, DELETE response, `taw_mm` on create — **Medium**

**Location:** `docs/API_CONTRACT.md` §F (line 256) vs `frontend/src/types/api.ts` lines 53–54, 263–277.

§F specifies `POST /api/blocks {name, variety, wine_style, application_rate_mm_h, geometry}` and
"`DELETE /api/blocks/{id}` for user-created blocks only", but: (a) nothing marks which blocks are
user-created — TS invented `user_created?: boolean` on `BlockProperties`; (b) the DELETE response shape is
unspecified — TS invented `DeleteBlockResponse {ok, error?}`; (c) the create request has no `taw_mm`, so a
traced block's TAW is undefined (default 120? — unstated), and no bounds exist on
`application_rate_mm_h` (0 ⇒ division by zero in `runtime_hours = needed_mm / rate`, line 59).

**Resolution:** amend §F: response of POST = the created Feature; properties gain `user_created: true`;
optional `taw_mm` (default 120) on create; `application_rate_mm_h` must be > 0 (validate 0.2–10);
DELETE → `{ok: bool, error?: string}`, 403-style `ok:false` for fixture blocks.

### F22 — `transpiration_deficit_pct`: top-level status field or driver? — **Low**

**Location:** `docs/API_CONTRACT.md` §A (line 227): "`/api/blocks/{id}/status` gains `"eta_7d"` and
`"ndvi"` **drivers** when data exists, **plus `"transpiration_deficit_pct"`** (ETa vs ETc divergence) —
absent, never null-crash". Grammatically it reads as a third top-level key; the mocks implement it as a
third *driver* (`mocks.ts` lines 138–160); `BlockStatus` in TS has no such field, implying driver.

**Resolution:** one word in §A: "…plus a `"transpiration_deficit_pct"` **driver**…".

### F23 — Request-model bounds disagree: contract silent, pydantic ≤ 14, mock clamps to 7 — **Medium**

**Location:** `backend/app/schemas.py` lines 9–16 vs `frontend/src/services/mocks.ts` line 466 vs contract.

`BattlePlanRequest.horizon_days`: contract gives no bounds; pydantic allows 1–14; the mock silently clamps
to `min(7, horizon_days)`. A 10-day request produces a 10-day plan live and a 7-day plan in fallback —
visibly different screens on the same input. `ScenarioRequest.days`: pydantic 1–30 with default 7; contract
shows only `"days": 7`; TS makes `days` required (no default).

**Resolution:** contract states: `horizon_days` 1–7 (the demo never needs more; then pydantic's `le=14`
tightens to 7), `days` 1–14 default 7. Align pydantic and mock to whatever is chosen.

### F24 — Mock fixtures flatten per-block TAW that the binding geojson varies — **Low**

**Location:** `backend/app/data/blocks.geojson` (B4 `taw_mm: 110`, B5 `taw_mm: 130`) vs
`frontend/src/services/mocks.ts` line 53 (`const TAW = 120` used for every block, including the
`taw_mm` property it emits and every mm↔fraction conversion).

Contract line 34 allows per-block overrides, so the geojson is right; the mock silently disagrees with the
fixture it mirrors (B4/B5 depletion_mm and pour-slip mm shift by ±8%).

**Resolution:** carry `taw_mm` per block in `BLOCKS` in mocks.ts. (Also satisfies RED_TEAM 1.6's
"TAW per-block" point visibly.)

### F25 — `blocks.geojson` still contains 5-vertex axis-aligned rectangles; v2 §F forbids them — **Medium (in-flight — verify before demo)**

**Location:** `backend/app/data/blocks.geojson` (all 7 features are 5-point rectangles) vs
`docs/API_CONTRACT.md` §F: "polygons replaced with hand-traced, irregular, **8–20-vertex** parcels …
(**no rectangles**); … areas recomputed from geometry", and `docs/DEMO_SCRIPT.md` Beat 1: "seven
**hand-traced** real block outlines (not rectangles)".

Known to be actively worked (R10); flagged because the demo script *asserts* the traced state and the
stored `area_ha` values will need recomputation when geometry changes (the contract requires it) — the
Pour-Slip m³ and Season-Bank numbers inherit any area drift.

**Resolution:** when the traced polygons land, recompute `area_ha` from geometry (contract already
mandates), and re-verify the battle-plan/season-bank example numbers that depend on area.

### F26 — Cache-age naming drift: `cache_age_minutes` vs `cache.oldest_minutes` — **Low**

**Location:** `docs/API_CONTRACT.md` `/api/health` (line 68) vs §D `GET /api/settings` (line 244).

The same quantity (staleness of the cache) is `cache_age_minutes` in health and `cache: {entries,
oldest_minutes}` in settings. Harmless but invites a third name in code.

**Resolution:** pick `oldest_minutes` semantics for both and note in health: "`cache_age_minutes` = age of
the oldest cache entry" (or rename in v2; health is v1-frozen, so a doc note suffices).

---

## F. Ambiguities an implementer must currently guess

### F27 — "1 September of the current season" is undefined for as_of before 1 September — **Medium**

**Location:** `docs/API_CONTRACT.md` lines 6, 16, 36.

The balance runs "from 1 September of the current season to `as_of`" and GDD accumulates "from 1 Sep". For
`as_of = 2026-07-10` (today's actual date — the contract's ultimate default when `DEMO_DATE` is unset) or
any date in Jul–Aug, is the season start 1 Sep **2025** (10 months of history, block in post_harvest/
dormant) or the *upcoming* 1 Sep (negative-length season, crash)? Similarly `as_of = 2025-09-01` exactly:
does the seeded `D = 0.3×TAW` apply on day 0? Also unspecified: precedence among the `as_of` query param,
`POST /api/settings/demo-date`, `DEMO_DATE` env, and "today" — v1 line 6 predates the settings override.

**Resolution:** define: *season start = the most recent 1 September ≤ as_of; on `as_of` = season start the
balance is exactly the seed. Precedence: query param > settings demo-date > `DEMO_DATE` env > today
(Africa/Johannesburg).* The timezone matters: "today" on the server (UTC) vs SAST differs around midnight.

### F28 — Agreement stats divide by zero with no readings; "within_band_pct" has no defined band — **Medium**

**Location:** `docs/API_CONTRACT.md` §C (line 237): `agreement: {bias, rmse, n, within_band_pct}`.

With `n = 0` readings (every block's initial state), `bias`/`rmse` are 0/0. JSON has no NaN — the endpoint
crashes or emits nulls the TS type (`ValidationAgreement`, all `number`) forbids. `within_band_pct` never
says which band (the MSWP band `mswp_band_mpa`? within ±what tolerance of the model line?), nor whether it
is computed over readings, reference series, or both.

**Resolution:** spec: when `n = 0`, `agreement = {bias: null, rmse: null, n: 0, within_band_pct: null}`
(and loosen the TS type to `number | null`), or omit `agreement`; define `within_band_pct` = % of readings
whose MPa falls inside the block's stage `mswp_band_mpa` on the reading date. State that `bias` =
mean(reading − model) in MPa.

### F29 — hold_days when the forecast never recovers the band — **Low**

**Location:** `docs/API_CONTRACT.md` line 60: "`hold_days` estimate (days for ETc to bring `f` back above
`lo`, using forecast)". The forecast horizon is 14 (or 16 — see F32) days; if projected `f` stays below
`lo` beyond it, `hold_days` is uncomputable. Null? Capped at horizon? "14+"?

**Resolution:** "capped at the forecast horizon; emit the horizon value and let the recommendation say
'at least N days'."

### F30 — The pour-slip formula prescribes water for on_track blocks — **Medium**

**Location:** `docs/API_CONTRACT.md` lines 58–60.

`needed_mm = max(0, D − mid×TAW)` is positive for any block in the upper half of its band — including
on_track blocks (`lo ≤ f ≤ hi`, `f > mid`). The contract defines slip behaviour for too_dry and too_wet
but never says whether an on_track block gets a pour slip with nonzero mm (the mock gives B7 an "optional
2 mm top-up" with `window: "optional"`). The `window` field's vocabulary ("tonight", "optional", "hold",
…?) is an undeclared open string set.

**Resolution:** spec: on_track ⇒ `type: "pour"`, `needed_mm` per formula, `window: "optional"`; too_dry ⇒
`window: "tonight"`; too_wet ⇒ `type: "hold"`, `window: "hold"`. Enumerate `window` values (or add a
machine-readable `urgency` and keep `window` as display text).

### F31 — Minor unpinned defaults and edge cases — **Low**

**Locations:** `docs/API_CONTRACT.md` various.

- `GET /api/season-bank` — behaviour when `remaining_m3` is omitted (mock defaults 12 000; contract
  silent). Propose: 400, or a documented default.
- `GET /api/blocks/{id}/timeseries?days=45` — history length is parameterised but **forecast length is
  not** (example shows 1 row; mock emits 14). Pin: forecast = 14 days always.
- `POST /api/photos` — default for omitted `date` (upload day? active `as_of`? — they differ by 6 months
  in demo conditions). Propose: active `as_of`.
- Route shadowing: `GET /api/photos/file/{photo_id}` vs `GET /api/photos/{block_id}` — a block literally
  named "file" collides; declare route registration order or move to `/api/photo-files/{id}`.
- `POST /api/irrigation` for an unknown `block_id` or a date after `as_of` — accepted? Propose: 404 /
  accepted-but-inert respectively, documented.
- `GET /api/backtest?months=4` — bounds/default of `months` unstated (window before 1 Sep would predate
  the season seed).

### F32 — Forecast horizon: 14 days (contract math) vs "up to 16 days" (provider) — **Low**

**Location:** `docs/API_CONTRACT.md` line 155 ("forecast used for the first 14 days"), line 54 (7-day
projection), v1 provider `get_forecast(days: int)` unbounded; Open-Meteo serves 16; the mock timeseries
emits 14. Nothing states the app-wide forecast horizon.

**Resolution:** Conventions line: "the engine's forecast horizon is 14 days everywhere; providers may be
asked for at most 14."

---

## G. PLAN / REVISIONS residue (post-reconciliation)

The reconciliation pass fixed the big ones — PLAN no longer claims "one env var flips the whole app"
(now explicitly disclaimed, PLAN.md lines 74, 146), the backtest is described as information-limited,
scope order matches R16, and DEMO_SCRIPT is 5 + 3 min. Remaining residue:

### F33 — PLAN still leads Field Mode with GPS auto-detect; R8 demoted GPS to bonus — **Low**

**Location:** `PLAN.md` §2 item 8: "**Field Mode (PWA)** — GPS detects the block you're standing in" vs
`docs/REVISIONS.md` R8: "manual/simulated location picker as the **primary** demo path (GPS won't place
you in a Stellenbosch vineyard from the venue)". PLAN's own §4 and DEMO_SCRIPT already say
"manual/simulated picker". One sentence to soften: "pick (or GPS-detect on site) the block you're
standing in."

### F34 — PLAN asserts "TerraClim's ~50 queries/day API limit" — an unsourced stat of the RED_TEAM 2.3 class — **Low**

**Location:** `PLAN.md` §2 item 10 ("fits TerraClim's ~50 queries/day limit by design"). RED_TEAM 2.3's
rule: never assert a precise TerraClim figure you can't source in front of its authors. The tilde helps;
safer: "fits comfortably inside TerraClim's API rate limits by design (one cached batch per day)".

### F35 — PLAN's provider sketch returns `kc` that `DailyWeather` doesn't carry — **Low (symptom of F15)**

**Location:** `PLAN.md` §3 line 61: `get_daily(...) → eto, eta, ndvi, kc, rain, tmax, tmin, ...` vs
contract `DailyWeather` (no `kc`). Resolve via F15 (add `kc` to the contract) rather than editing PLAN.

---

## Summary of findings by severity

| Severity | Count | Findings |
|---|---|---|
| Critical | 2 | F1, F7 |
| High | 7 | F2, F3, F4, F8, F11, F12, F15 |
| Medium | 15 | F5, F6, F9, F10, F13, F14, F16, F18, F19, F21, F23, F25, F27, F28, F30 |
| Low | 11 | F17, F20, F22, F24, F26, F29, F31, F32, F33, F34, F35 |

**Total: 35 findings — Critical 2 · High 7 · Medium 15 · Low 11.**

---

## Top 5, prioritized

1. **F7 — Decide the too-wet block and make every artifact agree.** The demo's climax currently points at
   B1 while the seeded irrigation log makes B3 too wet, the mocks make B1 too *dry*, and the contract's
   examples agree with the mocks. Pick B1 (premium red, per R6/PLAN), re-seed the log, flip the mocks,
   fix DEMO_SCRIPT line 181's mock claim. Nothing else matters if the money shot opens on a dry block.
2. **F1 — State the score formula once, canonically.** Adopt the blended formula with uncapped components
   and a single final cap (the only reading that reproduces the contract's own `score: 62`), name the
   rounding rule, mark 0.35 / 0.7 / 0.3 as tunable heuristics, and align `scoreSimple` in the mocks.
   Every screen displays this number.
3. **F2 + F3 — Repair the `/status` worked example.** Its GDD contradicts the phenology table (B1 at
   1231.5 is fruit_set, not veraison) and its pour slip is half what the pour-slip formula yields
   (14.1 mm vs 28.1 mm). Implementers will use this example as a fixture; as written it validates two
   different bugs.
4. **F11 + F12 — Pin the battle-plan and season-bank algorithms.** Ten open parameters in the scheduler
   and five in the demand model (including the entirely undefined season end date that puts the spoken
   "run dry 24 Feb" a month away from the mock's answer) mean two implementers cannot produce the same
   plan, verdict, or savings figure today.
5. **F8 + F15 — Fix the judge-visible arithmetic and the missing Kc.** "B4: 14 mm, 3.2 hours" is
   impossible at 2.0 mm/h and B4 has no prescription in mock mode (it's on_track); and Kc — a named item
   of the brief's judged feature 1 that the demo script promises on screen — is not carried by any
   endpoint payload.
