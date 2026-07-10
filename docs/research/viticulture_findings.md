# Viticulture & Irrigation-Science Validation — Vino Engine Constants

**Purpose.** Validate (keep / adjust / flag) every agronomic constant the Vino engine
uses, against peer-reviewed, extension-service, FAO and reputable-industry sources, so
the team can defend each number to judges.

**Scope.** Five topics: (1) GDD phenology thresholds, (2) variety factors, (3) Kc by
stage, (4) RDI / Stress Glide Path depletion bands, (5) TAW for Western Cape root zones.

**Context.** Southern-Hemisphere season, start 1 September (Cape). Demo farm: 7 blocks,
Stellenbosch (~18.86 E, −33.93 S), Winkler Region IV (warm). GDD base 10 °C from 1 Sep.

**A note on confidence (read this).** Direct fetching of full-text PDFs/journal pages was
blocked by the session's egress policy, so quantitative claims below are attributed to the
source surfaced by web search (abstracts, extension summaries, encyclopaedic entries). The
*values and ranges* are consistent across multiple independent sources and are safe to cite;
where a single number rests on one secondary source, it is marked **[secondary]**. Every
constant carries an explicit **VERDICT** and a confidence label:
**Established** (textbook/standard), **Supported** (multiple credible sources agree),
**Defensible assumption** (principle is sound; exact figure is our calibration, not a
published value).

---

## 1. Growing Degree Day model & phenological thresholds

### 1.1 The model is standard and correct
- **Base 10 °C (50 °F)** is the universal grapevine heat-summation base, established by
  Amerine & Winkler (1944) and used worldwide including South Africa. Vines are taken not
  to grow below 10 °C. *(Winkler index; Wikipedia; encyclopedia.pub 27652.)* **Established.**
- **Winkler Index** sums GDD (base 10 °C) over the 7-month growing season — 1 Apr–31 Oct
  (N. Hemisphere) ≡ **1 Sep–31 Mar (S. Hemisphere)**. Regions I–V, in °C·day: Region I
  ≤ ~1389, II ~1389–1667, III ~1667–1944, **IV ~1944–2222**, V > ~2222. **Stellenbosch is
  classified Region IV (warm)** — later varieties (Cabernet, Syrah) ripen well.
  *(Wikipedia/Grokipedia Winkler; winewithseth Stellenbosch; SA-wine Wikipedia.)* **Established.**
- Our formula `GDD = Σ max(0, (Tmax+Tmin)/2 − 10)` from 1 Sep is the textbook single-triangle
  / averaging method. **KEEP.** *(Note: many programs cap the daily mean at 30 °C ("horizontal
  cut-off") to avoid over-counting heat spikes; see §1.4.)*

### 1.2 Stage thresholds vs literature
Literature stage GDD (base 10 °C, cumulative from season start), triangulated across
sources for warm-region reference cultivars (Cabernet in Napa; general Vitis vinifera):

| Stage | Literature GDD (base 10, cumulative) | Source signal |
|---|---|---|
| budbreak | ~50–100 (Cab, Napa); Chardonnay ~75 | winewithseth; eVineyard |
| flowering/bloom | ~345–450 (Chardonnay ~345; Cab ~350–400) | eVineyard; winewithseth |
| fruit set | shortly after bloom (fruit set ≈ end of flowering) | Williams; general |
| veraison | ~1100–1300 (Cab, Napa) | winewithseth; oregonviticulture |
| harvest / maturity | ~1400–1700 (mid-season, moderate climate) up to 2000–2500 (late cv., warm) | winewithseth; WSU |

Independent cross-check — AJEV 68(1):60 (Parker-type multi-cultivar study, 17 cultivars)
reports, with *cultivar-specific* base temperatures: budbreak 78–180 DD, budbreak→bloom
240–372 DD, **bloom→veraison 556–800 DD**. Our flowering(400)→veraison(1150) span = 750 DD
sits inside that window. **Supported.**

### 1.3 Verdict on each threshold (base values, before variety scaling)

| Stage | Our value | Literature | VERDICT |
|---|---|---|---|
| budbreak | **100** | 50–100 | **KEEP** — Established/Supported. Top of the cited range; fine. |
| flowering | **400** | 345–450 | **KEEP** — Supported. Squarely in range. |
| fruit_set | **500** | ~bloom + 1–2 wk (~+100 DD) | **KEEP** — Defensible. Set follows bloom closely; +100 DD ≈ 1 wk is physically right. |
| veraison | **1150** | 1100–1300 | **KEEP** — Supported. Mid of range. |
| harvest | **1600** | 1400–1700 (mod.) / higher (warm, late cv.) | **KEEP, with a flag** — Defensible. On the low-moderate side of a *base* threshold, but variety scaling lifts Cabernet to 1600×1.15 = **1840** and Sauvignon Blanc to 1600×0.90 = **1440**, spanning the realistic Stellenbosch season-total window (~1900–2100 GDD, Region IV). If judges probe, offer 1500–1700 as the honest base range. |
| post_harvest | **harvest + 30 d** | operational convention | **KEEP** — Defensible assumption (no GDD literature; sensible senescence window). |

**Net:** budbreak, flowering, veraison are well-aligned with the literature; fruit_set and
post_harvest are sound operational spacings; harvest=1600 is defensible once variety-scaled,
though it is a *moderate-climate* base and the single softest number in the set.

### 1.4 One optional refinement (engine, not a constant)
Consider capping the daily mean at 30 °C before subtracting the base (standard "upper
threshold" in WSU/UC GDD practice). In a Stellenbosch heatwave (Tmax 38 °C+) the uncapped
mean over-accumulates GDD and would push blocks into later stages too early. **Flag to
backend as a modelling choice, not a constant change.** *(WSU Growing Degree Days; UC IPM.)*

---

## 2. Variety factors (ripening-order multipliers)

Our factors multiply the GDD thresholds: a higher factor = needs more heat = later ripening.
The literature does **not** publish a single "variety factor" table, so we validate the
**ordinal ranking and rough magnitude** against established ripening order and Cape harvest timing.

**Established ripening order (early → late):**
- **Early:** Sauvignon Blanc, Chardonnay, Pinot noir (whites/early reds picked first; SA whites
  from late Jan). *(Lanzerac SA harvest; wein.plus; MDPI Chardonnay Cape South Coast 2025.)*
- **Mid:** Chenin Blanc, Merlot, Pinotage (Cape harvest ~Feb). Pinotage (Pinot noir × Cinsaut)
  is an early-to-mid ripener.
- **Late:** Shiraz (mid-late), **Cabernet Sauvignon (latest of this set; Cape harvest Mar–Apr).**
  *(Lanzerac: "later-ripening varieties like Syrah and Cabernet Sauvignon … March or even April".)*

| Variety | Our factor | Ripening class | VERDICT |
|---|---|---|---|
| Sauvignon Blanc | **0.90** | earliest (fresh-white style, picked early for acid/thiols) | **KEEP** — Supported. Earliest is correct; style reinforces early pick. |
| Chardonnay | **0.95** | early | **KEEP** — Supported. Early, just behind SB. |
| Chenin Blanc | **1.00** | mid (reference) | **KEEP** — sensible datum. |
| Merlot | **1.00** | mid | **KEEP** — Supported. |
| Pinotage | **1.00** | early-to-mid | **KEEP (optional 0.97)** — Defensible. Ranks correctly as mid; a slight early nudge to 0.97 is arguable but not required. |
| Shiraz | **1.05** | mid-late | **KEEP** — Supported. |
| Cabernet Sauvignon | **1.15** | latest | **KEEP** — Supported. Correctly the highest; ~25 % spread over SB matches the ~6–8 week Cape harvest gap. |

**Net:** the variety factors are a **valid, defensible ordinal model** — every variety is in
the right ripening class and the magnitudes are reasonable. Be honest with judges: the *exact
multipliers* are our calibration (a "variety heat-demand index"), grounded in published
ripening order and Stellenbosch harvest dates, not lifted from one paper. The framework mirrors
Van Leeuwen et al.'s "heat requirements differ by variety" thesis (IVES 2022) and Parker et
al.'s cultivar-specific flowering/veraison heat sums.

---

## 3. Crop coefficient (Kc) by stage

### 3.1 Anchor values (Established)
- **FAO-56 (Allen, Pereira, Raes & Smith 1998), Table 12 — Grapes-Wine:** Kc ini **0.30**,
  Kc mid **0.70**, Kc end **0.45**; max root depth 1.0–2.0 m; depletion fraction **p = 0.45**.
  (Table grapes: mid 0.85, p 0.35.) These are the standard reference values worldwide.
  *(FAO-56 Ch.6 Table 12; FAO Land&Water grape page.)* **Established.**
- **WSU (Moyer/Keller, 2017):** a fully-irrigated Cabernet in eastern Washington runs a
  seasonal Kc **0.3 (budbreak) → 0.8 (full canopy mid-season), then constant, then declining**
  — Kc is driven by GDD/canopy development. *(WSU "Grapevine Crop Coefficient (Kc)".)* **Established.**
- **Williams & Ayars (2005), Agric. For. Meteorol.:** grapevine water use and Kc are **linear
  functions of the canopy shaded area** beneath the vine at solar noon — i.e. Kc *should* be a
  rising-then-falling curve tracking canopy, exactly as we model it, not a flat block. Peak Kc
  ~0.7–0.8 for typical VSP wine canopies; lower for the ~30–50 % ground cover of clean-cultivated,
  drip/deficit vineyards. **Established.**

### 3.2 Verdict on each Kc

| Stage | Our Kc | Reference | VERDICT |
|---|---|---|---|
| dormant | **0.15** | FAO Kc ini floor ~0.15; bare/senescent soil | **KEEP** — Defensible. Represents minimal soil-evap / cover crop. |
| budbreak | **0.30** | FAO Kc ini 0.30; WSU start 0.3 | **KEEP** — Established. Exact match. |
| flowering | **0.45** | rising limb toward mid | **KEEP** — Defensible/Supported. Canopy still developing; physically correct to be below peak. |
| fruit_set | **0.60** | rising limb | **KEEP** — Defensible. On the way to peak. |
| veraison | **0.70** | FAO Kc mid **0.70** | **KEEP** — Established. Peak = FAO-56 wine-grape Kc mid exactly. Strong number to cite. |
| harvest | **0.55** | between mid 0.70 and end 0.45 | **KEEP** — Supported. Declining limb; sits above FAO end (0.45), fine for a still-green ripening canopy. |
| post_harvest | **0.40** | ~FAO Kc end | **KEEP** — Defensible. Senescing canopy. |

**Net:** the Kc curve is **validated**. Its shape (rise to a veraison peak, then decline) is
exactly what Williams & Ayars and WSU describe, and the peak (0.70) is the FAO-56 wine-grape
Kc-mid *verbatim*. Two honest caveats to have ready:
1. **Peak choice 0.70 vs 0.80.** WSU shows fully-irrigated full canopy reaching ~0.8. We
   deliberately use **0.70** — the FAO wine-grape (not table-grape) mid, appropriate for a
   *clean-cultivated, drip-irrigated, deficit-managed* vineyard at ~40–50 % cover. This is a
   feature (it matches our RDI thesis), not an error. If a block is high-vigour full-canopy,
   0.75–0.80 would be more accurate — a candidate per-block override later.
2. **Timing of the plateau.** FAO applies a flat 0.70 across all of mid-season (bloom→early
   ripening); we ramp 0.45→0.60→0.70. Our ramp is *more* physically faithful to canopy
   development, but slightly under-estimates ETc during flowering/fruit-set vs a flat FAO curve.
   Optional tightening: flowering 0.50, fruit_set 0.65 to reach plateau a touch sooner. **Not
   required** — current values are internally consistent and defensible.

---

## 4. RDI science & the Stress Glide Path depletion bands (core differentiator)

### 4.1 The science that makes our concept correct
- **Berry size is set before veraison.** ~65–75 % of final berry size is determined between
  fruit set and veraison, via cell division then expansion; water deficit in this window
  reduces cell division → **permanently smaller berries** → higher skin:pulp ratio →
  concentration of anthocyanins, tannins and flavour. Vines stressed set→veraison have smaller
  berries at harvest than vines stressed only post-veraison. *(Williams, "Deficit irrigation of
  wine grape vineyards", UC ANR; Vineyard Team RDI Management.)* **Established.**
- **Pre-veraison deficit is the highest-value window.** **Matthews & Anderson (1988), AJEV
  39(4):313–320** — "Fruit ripening in *Vitis vinifera* L.: responses to seasonal water
  deficits" — the foundational result: **pre-veraison water deficit increased berry/wine
  anthocyanins more than post-veraison deficit**, and defined the timing-of-deficit paradigm
  our engine is built on. **Established.** Corroborated by AJEV 76(2) 2025 (Pinot noir: severe
  pre-veraison + moderate post-veraison deficit *improves* berry phenolics) and Sangiovese VOC
  work (PMC9986437: "water deficit before veraison is crucial in regulating berry VOCs").
- **Over-irrigation is a defect — direct evidence:**
  - **Excess vigour.** "Full irrigation prior to veraison resulted in excessive shoot growth."
    Withholding water while the canopy elongates and sets fruit reduces vegetative growth and
    yields lighter, looser clusters — improving quality. *(Vineyard Team RDI; Williams.)*
  - **Sensory dilution/greenness — Chapman et al. (2005), AJGWR 11:339–347.** Cabernet Sauvignon
    from **lower (deficit) vine water status → more fruity, less vegetal**; well-/over-watered
    vines → **more vegetal, dilute** character. Direct sensory proof that over-watering degrades
    red-wine quality. **Established.**
  - **Disease.** Over-watering → dense, shaded, poorly ventilated canopies, which "favour
    powdery mildew and **Botrytis bunch rot**"; early vigorous vegetative growth is "a major
    factor" in Botrytis spread. Deficit → looser clusters → less rot. *(OSU Extension EM 9071 &
    Botrytis guide; OENO One "Vigor-thresholded NDVI … early risk indicator of Botrytis".)* **Supported.**
  - **Concentration vs dilution nuance (be precise for judges).** Drip/deficit irrigation during
    ripening does **not** dilute must the way *rain* or *overhead sprinklers* do (berries can
    absorb surface water and swell); the dominant over-irrigation harm is via **larger berries +
    excess vigour + disease + delayed/muted ripening**, not water physically entering the berry
    through drip. State it this way — it is the technically defensible framing. *(Williams, UC ANR.)*

### 4.2 Quantitative RDI targets in the literature (stem water potential)
RDI is normally scheduled by **midday stem water potential (Ψstem)**, not depletion fraction.
The consensus thresholds (semi-arid winegrapes):

| Water status | Midday Ψstem (MPa) | Use |
|---|---|---|
| No stress / well-watered | > −0.6 | pre-flowering, whites, sensitive stages |
| Mild deficit | −0.6 to −0.9 | **RDI target, set→veraison (whites, gentle)** |
| Moderate deficit | −0.9 to −1.2 | **RDI target, set→veraison / post-veraison reds** |
| Strong deficit | −1.2 to −1.4 | post-veraison reds (concentration) |
| Severe (risk) | < −1.4 | avoid — shutdown, sunburn |

*Sources:* AJEV 61(3):300 (2010) "Physiological Thresholds for Efficient RDI in Winegrapes
under Semiarid Conditions" — treatments targeting **−0.8 to −0.95, −1.0 to −1.2, −1.25 to
−1.4 MPa** from set to harvest; Williams (UC ANR) irrigation triggered at midday leaf Ψ ≈
−1.0 MPa; IntechOpen ch. 67833 "Effects of Vine Water Status …". **Established/Supported.**

### 4.3 Translating MPa targets → our depletion-fraction bands
Our engine works in **depletion fraction `f = D/TAW`**, not MPa. There is **no universal
MPa↔f conversion** (it is soil- and variety-specific), so this mapping is an **engineering
translation** anchored on one hard number:

> **FAO-56 depletion fraction for grapes-wine: p = 0.45** — the fraction of TAW that can be
> depleted **before the vine begins to experience water stress** (ETc reduction). *(FAO-56
> Ch.6 Table 22 / Ch.8.)* **Established.**

So on our scale: **f < 0.45 = comfortable; f ≈ 0.45 = onset of mild stress; f > 0.45 =
deliberate deficit.** RDI is, by design, the practice of pushing *past* p at the right stage.
This gives every band a physical meaning.

### 4.4 Verdict on the Stress Glide Path bands `[lo, hi]`

| Stage | Band pattern (our values) | Interpretation vs p=0.45 & RDI | VERDICT |
|---|---|---|---|
| dormant | all 0.00–0.60 | irrelevant (winter rain refills; no active uptake) | **KEEP** — Defensible. Wide/permissive is correct. |
| budbreak | all 0.15–0.35 | keep comfortably wet (< p) during shoot establishment | **KEEP** — Supported. No stress when shoots are fragile. |
| flowering | all 0.20–0.40 | mild dry-down, still < p | **KEEP** — Supported. Avoid *severe* stress at bloom (poor set/shatter risk) while starting the glide. |
| **fruit_set** | premium_red 0.45–0.65 · red 0.40–0.60 · white 0.30–0.50 · fresh_white 0.25–0.45 | **the RDI money window** — reds pushed *past* p into mild-moderate deficit to limit berry size & vigour; whites kept gentler to protect aromatics/acidity | **KEEP** — Supported/Defensible. This graduation is exactly the published prescription. Strongest, most defensible part of the model. |
| veraison | red 0.35–0.55 · white 0.30–0.50 · fresh_white 0.25–0.40 | ease slightly from the fruit-set peak → let sugars load without vine shutdown | **KEEP** — Defensible. Aligns with "pre-veraison deficit matters most" (Matthews & Anderson). *(Note: some red RDI programs hold or deepen deficit through veraison; our slight easing is a valid, conservative choice.)* |
| harvest | = veraison bands | maintain moderate deficit through ripening; no late flood-irrigation | **KEEP** — Supported. |
| post_harvest | all 0.20–0.40 | rehydrate to restore reserves; mild | **KEEP** — Defensible. Post-harvest replenishment is standard. |

**Two honest points for judges:**
1. The **style graduation** (premium_red > red > white > fresh_white in deficit intensity) is
   **strongly supported**: reds benefit from more deficit (colour/tannin), aromatic whites are
   *harmed* by over-stress (loss of thiols/acid) — so keeping Sauvignon Blanc gentlest (0.25–0.45
   at set) is correct.
2. The **exact band edges are our calibration**, translated from MPa-based RDI literature via
   FAO-56 p=0.45. They are **defensible assumptions**, not values copied from a paper — say so.
   The *direction, ordering and stage-timing* are what the science backs, and they are right.

---

## 5. Total Available Water (TAW) for Western Cape root zones

**Our value:** `taw_mm = 120` default, per-block override allowed; balance seeded at
`D = 0.3 × TAW` on 1 Sep.

**Literature:**
- Effective grape root zone ~**1.0 m** (FAO-56 max 1.0–2.0 m; most extraction in top ~1 m).
  *(FAO-56; NC State Winegrape Guide Ch.10.)*
- Plant-available water capacity (AWC) by texture: sandy ~60–100 mm/m, sandy-loam/loam
  ~120–160 mm/m, clay/clay-loam ~150–200 mm/m. Western Cape decomposed-granite and sandy-loam
  soils typical of Stellenbosch → **~100–140 mm over a 1 m root zone.** *(NC State Ch.10; Yara;
  Handbook for Irrigation of Wine Grapes in SA / Myburgh.)*
- **Readily available water (RAW)** ≈ p × TAW; ~2/3 of AW is "readily" available; a **~70 mm
  RAW benchmark** is used in production-oriented grape scheduling. *(Irrigation Europe "Irrigation
  of the grape vine"; FAO-56.)* With TAW 120 and p 0.45, RAW ≈ 54 mm — same order of magnitude.

**VERDICT:**
- **`taw_mm = 120` → KEEP.** Supported. A sound default for a ~1 m effective root zone on
  typical Stellenbosch sandy-loam. The **per-block override is essential and correctly designed**:
  shallow sandy blocks → 60–90 mm; deep clay/clay-loam → 150–200 mm. Recommend documenting that
  range so judges see it is soil-aware, not a fixed guess.
- **Seed `D = 0.3 × TAW` (36 mm) on 1 Sep → KEEP, minor flag.** Defensible assumption. Because
  the Cape is a **winter-rainfall** region, soils are usually near field capacity on 1 Sep, so a
  slightly *wetter* seed (`0.1–0.2 × TAW`) would be marginally more realistic; 0.3 is a safe,
  neutral start and self-corrects within weeks as the balance runs. Not worth changing for the demo.

---

## Summary verdict table

| Constant group | Overall verdict | Confidence |
|---|---|---|
| GDD model (base 10, 1 Sep, averaging) | KEEP | Established |
| GDD thresholds: budbreak/flowering/veraison | KEEP | Supported |
| GDD thresholds: fruit_set / post_harvest spacing | KEEP | Defensible |
| GDD threshold: harvest = 1600 | KEEP (flag: base is moderate-climate; 1500–1700) | Defensible |
| Variety factors (all 7) | KEEP | Supported (order) / Defensible (exact multipliers) |
| Kc by stage (whole curve) | KEEP | Established (endpoints & peak) / Defensible (shape) |
| Stress bands — style graduation & timing | KEEP | Supported |
| Stress bands — exact edges | KEEP | Defensible assumption (MPa→f translation via FAO p=0.45) |
| TAW = 120 mm + override | KEEP | Supported |
| Seed D = 0.3·TAW | KEEP (flag: Cape winter-wet → 0.1–0.2 arguable) | Defensible |

**Bottom line:** nothing in the current constant set is *wrong*. The phenology and Kc anchors
are textbook-solid; the variety factors and stress bands are well-reasoned calibrations whose
*direction and ordering* the literature strongly supports. The one number to be transparent
about is harvest GDD (1600, a moderate-climate base lifted into range by variety scaling), and
the honest framing of the stress bands as an FAO-anchored engineering translation rather than a
copied table. See `calibrated_constants.md` for drop-in JSON and `sources.md` for the bibliography.
