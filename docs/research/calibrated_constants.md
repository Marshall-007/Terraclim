# Calibrated Constants — drop-in for the Vino backend

Proposed final values for `kc_curves`, `variety_factors`, `gdd_thresholds` and
`stress_targets`. **Outcome of the validation (`viticulture_findings.md`): every current
constant is retained.** The literature confirms the anchors and supports the calibrations, so
this file is a *validated* set, not a rewrite. Each block notes source and a
confidence tag: **[established]**, **[supported]**, **[assumption]** (defensible calibration).

The engine already reads `kc_curves.json` and `stress_targets.json`. GDD thresholds and
variety factors are **not yet externalised** — recommend adding `phenology.json` and
`variety_factors.json` so all four live in `backend/app/data/` and stay auditable (the engine
should read, never hardcode). JSON below is ready to paste.

---

## 1. `kc_curves.json` — Kc by stage  **(unchanged — validated)**

```json
{
  "dormant": 0.15,
  "budbreak": 0.30,
  "flowering": 0.45,
  "fruit_set": 0.60,
  "veraison": 0.70,
  "harvest": 0.55,
  "post_harvest": 0.40
}
```

- `budbreak 0.30` and `veraison 0.70` are FAO-56 (Allen et al. 1998) wine-grape **Kc ini** and
  **Kc mid** *verbatim*. **[established]**
- Rising-then-falling shape matches Williams & Ayars (2005) and WSU (Moyer/Keller 2017).
  **[supported]**
- Peak deliberately **0.70** (FAO wine-grape mid), not 0.80 (WSU fully-irrigated full canopy):
  correct for a clean-cultivated, drip/RDI vineyard at ~40–50 % cover. **[established choice]**
- *Optional, not required:* flowering→0.50, fruit_set→0.65 to reach the mid-season plateau
  slightly sooner (closer to FAO's flat Kc-mid). Current values are internally consistent —
  ship as-is.

---

## 2. `variety_factors.json` — GDD-threshold multipliers  **(unchanged — validated ordering)**

```json
{
  "Sauvignon Blanc": 0.90,
  "Chardonnay": 0.95,
  "Chenin Blanc": 1.00,
  "Merlot": 1.00,
  "Pinotage": 1.00,
  "Shiraz": 1.05,
  "Cabernet Sauvignon": 1.15
}
```

- Ranks every variety in its correct ripening class — early (SB, Chardonnay) < mid (Chenin,
  Merlot, Pinotage) < late (Shiraz, **Cabernet latest**) — consistent with Cape harvest timing
  (whites late-Jan/Feb; Cabernet Mar–Apr). **[supported]**
- Exact multipliers are a **variety heat-demand index** we calibrated; they are *defensible
  assumptions*, not a published table. Pitch them as such. **[assumption]**
- *Optional:* Pinotage → 0.97 (early-to-mid). Not required; 1.00 is defensible.
- **Engine note:** apply as `threshold × factor` per block, matching the API contract
  ("thresholds scaled by variety factor").

---

## 3. `phenology.json` — GDD stage thresholds  **(unchanged — validated)**

Base values (base 10 °C, cumulative from 1 Sep), before variety scaling:

```json
{
  "base_temp_c": 10,
  "season_start": "09-01",
  "gdd_thresholds": {
    "budbreak": 100,
    "flowering": 400,
    "fruit_set": 500,
    "veraison": 1150,
    "harvest": 1600
  },
  "post_harvest_days_after_harvest": 30,
  "notes": "budbreak/flowering/veraison align with published base-10 cumulative GDD; fruit_set spacing and post_harvest window are operational; harvest=1600 is a moderate-climate base lifted to 1440 (SB) - 1840 (Cab) by variety scaling."
}
```

- budbreak 100 / flowering 400 / veraison 1150 sit inside published base-10 cumulative-GDD
  ranges (50–100 / 345–450 / 1100–1300). **[supported]**
- fruit_set 500 = bloom + ~1 week; post_harvest = harvest + 30 d. **[assumption — sound spacing]**
- harvest 1600 (base) → after variety scaling spans ~1440–1840 GDD, the realistic Stellenbosch
  Region IV window. **[assumption — moderate-climate base; honest range 1500–1700]**
- *Optional engine refinement (not a constant):* cap daily mean at 30 °C before subtracting
  base, so Cape heatwaves don't over-accumulate GDD (standard WSU/UC practice).

---

## 4. `stress_targets.json` — Stress Glide Path depletion bands `[lo, hi]`  **(unchanged — validated)**

```json
{
  "dormant":      { "premium_red": [0.00, 0.60], "red": [0.00, 0.60], "white": [0.00, 0.60], "fresh_white": [0.00, 0.60] },
  "budbreak":     { "premium_red": [0.15, 0.35], "red": [0.15, 0.35], "white": [0.15, 0.35], "fresh_white": [0.15, 0.35] },
  "flowering":    { "premium_red": [0.20, 0.40], "red": [0.20, 0.40], "white": [0.20, 0.40], "fresh_white": [0.20, 0.40] },
  "fruit_set":    { "premium_red": [0.45, 0.65], "red": [0.40, 0.60], "white": [0.30, 0.50], "fresh_white": [0.25, 0.45] },
  "veraison":     { "premium_red": [0.35, 0.55], "red": [0.35, 0.55], "white": [0.30, 0.50], "fresh_white": [0.25, 0.40] },
  "harvest":      { "premium_red": [0.35, 0.55], "red": [0.35, 0.55], "white": [0.30, 0.50], "fresh_white": [0.25, 0.40] },
  "post_harvest": { "premium_red": [0.20, 0.40], "red": [0.20, 0.40], "white": [0.20, 0.40], "fresh_white": [0.20, 0.40] }
}
```

**Why these are defensible:**
- Anchored on **FAO-56 p = 0.45** (grapes-wine) = the depletion fraction at which stress onset
  begins. So `f < 0.45` = comfortable, `f ≥ 0.45` = deliberate RDI deficit. **[established anchor]**
- `fruit_set` pushes reds *past* p (premium_red 0.45–0.65) — the RDI "money window" that limits
  berry size and vigour and concentrates colour/tannin; whites kept gentler (0.25–0.50) to
  protect aromatics/acidity. This graduation is exactly the published prescription. **[supported]**
- Slight easing at veraison vs fruit_set encodes "pre-veraison deficit matters most"
  (Matthews & Anderson 1988). **[supported]**
- Exact band edges are our **MPa→depletion-fraction translation** (no universal conversion
  exists) — a defensible engineering calibration, not a copied table. **[assumption]**

**Do not change for the demo.** The style ordering and stage timing are the scientifically
load-bearing parts and they are correct.

---

## 5. TAW & seeding  **(unchanged — validated)**

- `taw_mm = 120` default per block — sound for a ~1 m effective root zone on Stellenbosch
  sandy-loam (AWC ~100–140 mm/m). **[supported]**
- **Per-block override is the right design.** Suggested documented ranges for `taw_mm`:
  shallow sandy 60–90 · sandy-loam/loam 110–150 · clay/clay-loam 150–200. **[supported]**
- Seed `D = 0.3 × TAW` on 1 Sep: defensible; because the Cape is winter-rainfall, `0.1–0.2 × TAW`
  is marginally more realistic (soils near field capacity post-winter), but 0.3 is a safe neutral
  start that self-corrects. **[assumption — keep for demo]**

---

## Change log vs current engine values

| File | Change | Reason |
|---|---|---|
| kc_curves.json | **none** | Values validated against FAO-56 / WSU / Williams. |
| variety_factors | **none** (externalise to JSON) | Ordering supported; magnitudes defensible. |
| phenology / gdd | **none** (externalise to JSON) | Thresholds validated; harvest flagged, not changed. |
| stress_targets.json | **none** | Bands validated; anchored on FAO-56 p=0.45. |
| taw_mm | **none** | 120 mm default supported; override documented. |

**Honest-precision statement for the pitch:** "Our phenology and Kc anchors are FAO-56 and
university-extension standard values; our variety factors and stress bands are transparent,
literature-grounded calibrations — we mark which numbers are established and which are defensible
assumptions rather than inventing false precision."
