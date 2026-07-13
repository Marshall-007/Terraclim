from __future__ import annotations

import json
import re

from ..services import (
    DATA_DIR,
    FORWARD_DAYS,
    Evaluation,
    evaluate_all,
    evaluate_block,
    forward_weather,
    irrigation_for_block,
    kc_curves,
    load_blocks,
    photo_record,
    photos_for_block,
    season_bank_inputs,
    stress_targets,
)
from .backtest import run_backtest
from .battle_plan import RAIN_SKIP_MM_48H, STAGE_SENSITIVITY, STYLE_WEIGHT, build_plan
from .forecast import projected_deviation
from .scenario import PERTURBATION_STORY, perturb_forward
from .scoring import DEVIATION_FULL_SCALE, FORECAST_WEIGHT, NOW_WEIGHT
from .season_bank import block_demand_totals, compute_bank

# Deterministic insight engine: every subject a user can click gets a headline,
# 2-4 sentences of grower language, the facts it rests on (with units), and honest
# caveats. Facts are read from live engine state, the same calls the routes make,
# never restated from a cached response. AI (if configured) only rephrases; it is
# layered on outside this module.

VALID_SUBJECTS = [
    "block_status", "score", "driver", "mswp", "glide_path", "pour_slip",
    "battle_plan_entry", "battle_plan_skip", "season_bank", "backtest_event",
    "scenario_delta", "photo_analysis", "term",
]

SCENARIO_KINDS = ("heatwave", "drought", "rain_event", "cool_spell")


class InsightError(Exception):
    pass


class UnknownSubjectType(InsightError):
    """Maps to 422."""


class InvalidRequest(InsightError):
    """Maps to 422: a required field is missing or malformed."""


class SubjectNotFound(InsightError):
    """Maps to 404: block/driver/event/photo/term does not exist."""


# --- copy building blocks ---------------------------------------------------

STAGE_STORY = {
    "dormant": "the vines are resting with no leaves to feed, so water status barely touches the coming wine",
    "budbreak": "young shoots are building the canopy that must ripen the crop, and real stress now stunts the season before it starts",
    "flowering": "the vines are deciding how many berries you get, so stress now costs bunches and they should live comfortably",
    "fruit_set": "the berries are forming, and a mild controlled thirst keeps them small and thick-skinned, where colour and flavour live",
    "veraison": "the berries are softening and colouring, and a moderate thirst concentrates sugar, colour and flavour",
    "harvest": "the flavour is largely set, so the job is holding the vine steady without plumping the berries with late water",
    "post_harvest": "the vine is stocking reserves for next spring; keep it comfortable without pushing new growth",
}

TOO_DRY_MEANS = (
    "past a useful thirst the vines start closing their leaf pores, ripening can stall, "
    "and in heat the fruit risks sunburn"
)
TOO_WET_MEANS = (
    "extra water at this point feeds shoots instead of grapes and can dilute "
    "flavour in the berries"
)

STYLE_WORDS = {
    "premium_red": "a premium red",
    "red": "a red",
    "white": "a white",
    "fresh_white": "a fresh white",
}

MODELLED_BALANCE_CAVEAT = (
    "Depletion comes from a modelled water balance driven by weather data, not a soil "
    "probe. Log every irrigation so the numbers stay honest."
)
MSWP_CAVEAT = (
    "MPa values are modelled equivalents, not leaf measurements. One pressure-bomb "
    "reading on this block calibrates the scale."
)
FORECAST_CAVEAT = (
    "The forward look leans on a weather forecast; it will be wrong in the details, "
    "so the engine re-checks every day."
)

DRIVER_STORY = {
    "et0_7d": {
        "what": "the drying power of the weather over the last week: how many millimetres of "
                "water a day the sun, heat, wind and dry air would pull from a well-watered canopy",
        "why": "every millimetre of it must come out of the soil tank or the drip line, so a "
               "high week here empties the root zone fast",
        "nature": "Weather-derived (FAO-56 calculation), not a field measurement.",
    },
    "eta_7d": {
        "what": "what the vines and soil actually gave up over the last week, in plain terms, "
                "how much the vines are drinking each day",
        "why": "when it runs well below the weather's demand, the vines are throttling back "
               "because water is getting hard to reach",
        "nature": "Satellite-derived measurement of actual water use, averaged over the block.",
    },
    "rain_7d": {
        "what": "rain that fell over the last week",
        "why": "only rain above about 2 mm in a day reaches the roots. Light sprinkles "
               "evaporate off leaves and hot soil before they soak in",
        "nature": "From the weather record; the balance only credits the effective share.",
    },
    "tmax_7d": {
        "what": "the average daily maximum temperature over the last week",
        "why": "heat drives the vines' thirst, and days much above 35 °C make them shut "
               "their pores regardless of soil water",
        "nature": "From the weather record.",
    },
    "forecast_rain_3d": {
        "what": "rain expected over the next three days",
        "why": "it is free irrigation on its way, so the schedule holds water back from blocks "
               "about to be rained on",
        "nature": "A forecast, not a promise. The engine re-checks daily.",
    },
    "ndvi": {
        "what": "a satellite greenness score for the canopy, from 0 (bare soil) to about 0.9 "
                "(dense healthy leaf)",
        "why": "a block sliding on greenness while its neighbours hold steady is thinning or "
               "yellowing. Vigour trouble shows here before yield does",
        "nature": "Satellite-measured, averaged over the block outline (zonal statistics).",
    },
    "transpiration_deficit_pct": {
        "what": "how far the vines' measured water use runs below what an unstressed canopy "
                "would use in this weather",
        "why": "vines that cannot find water throttle back before the leaves show it. A "
               "rising deficit is stress arriving in the plumbing first",
        "nature": "Computed from satellite ETa against the model's unstressed demand (ET0 × Kc).",
    },
}

PRESSURE_WORDS = {
    "high": "pushing the block hard right now",
    "medium": "worth watching",
    "low": "not a concern today",
}

HINT_MEANING = {
    "none": "the canopy looks comfortable",
    "mild": "some early loss of colour or cover, worth a walk-through",
    "visible": "clear canopy stress you would notice from the row",
}


# --- small helpers -----------------------------------------------------------

def _num(x: float, nd: int = 1) -> str:
    s = f"{float(x):.{nd}f}"
    if "." in s:
        s = s.rstrip("0").rstrip(".")
    return s


def _pct(fraction: float) -> str:
    return f"{round(fraction * 100)}%"


def _band_pct(lo: float, hi: float) -> str:
    return f"{round(lo * 100)}–{round(hi * 100)}%"


def _pts(deviation: float) -> int:
    return abs(round(deviation * 100))


def _fact(label: str, value) -> dict:
    return {"label": label, "value": str(value)}


def _join(sentences: list[str]) -> str:
    return " ".join(s.strip() for s in sentences if s and s.strip())


def _find_block(block_id: str | None, subject_type: str):
    if not block_id:
        raise InvalidRequest(f"block_id is required for subject_type '{subject_type}'")
    block = next((b for b in load_blocks() if b.id == block_id), None)
    if block is None:
        raise SubjectNotFound(f"block '{block_id}' not found")
    return block


def _evaluate(block, ctx: dict) -> Evaluation:
    return evaluate_block(block, ctx["as_of"], ctx["provider"], stress_targets(), kc_curves())


def _top_driver(drivers: list[dict]) -> dict:
    for level in ("high", "medium"):
        for d in drivers:
            if d["pressure"] == level:
                return d
    return drivers[0]


def _driver_reading(d: dict) -> str:
    unit = f" {d['unit']}" if d["unit"] else ""
    return f"{d['value']}{unit}"


def _ctx_int(ctx: dict, key: str, default: int, lo: int, hi: int) -> int:
    try:
        v = int(ctx.get(key, default))
    except (TypeError, ValueError):
        raise InvalidRequest(f"context.{key} must be an integer")
    return max(lo, min(hi, v))


def _ctx_float(ctx: dict, key: str, default: float, lo: float, hi: float) -> float:
    try:
        v = float(ctx.get(key, default))
    except (TypeError, ValueError):
        raise InvalidRequest(f"context.{key} must be a number")
    return max(lo, min(hi, v))


def load_glossary() -> dict:
    return json.loads((DATA_DIR / "glossary.json").read_text())


def _normalize_term(raw: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", raw.lower()).strip()


def _status_phrase(status: str, deviation: float) -> str:
    if status == "too_dry":
        return f"{_pts(deviation)} points past the dry edge"
    if status == "too_wet":
        return f"{_pts(deviation)} points below the wet edge"
    return "inside its band"


# --- subject builders --------------------------------------------------------

def _insight_block_status(block_id, subject_id, ctx):
    block = _find_block(block_id, "block_status")
    ev = _evaluate(block, ctx)
    r = ev.response
    lo, hi = r["target_band"]
    top = _top_driver(r["drivers"])
    story = DRIVER_STORY.get(top["key"], {})

    if r["status"] == "too_dry":
        headline = f"{block.name} is running too dry in {r['stage']}"
        state = (
            f"That is {_pts(r['deviation'])} points past the dry edge, and {TOO_DRY_MEANS}."
        )
    elif r["status"] == "too_wet":
        headline = f"{block.name} is wetter than the wine wants"
        state = (
            f"That is {_pts(r['deviation'])} points below the wet edge of the band, and {TOO_WET_MEANS}."
        )
    else:
        headline = f"{block.name} is on its glide path"
        state = "That sits inside the band, so the vines carry exactly the thirst the style wants."

    explanation = _join([
        f"{block.name} ({block.variety}) has used {_pct(r['depletion_fraction'])} of the water its "
        f"roots can reach, against a {r['stage']} comfort zone of {_band_pct(lo, hi)} for "
        f"{STYLE_WORDS.get(block.wine_style, block.wine_style)}.",
        state,
        f"Right now {STAGE_STORY[r['stage']]}.",
        f"The biggest pressure on it is {top['label']} at {_driver_reading(top)}: "
        f"{story.get('what', 'a key driver of water use')}.",
    ])

    facts = [
        _fact("Growth stage", f"{r['stage']} ({_num(r['gdd'])} GDD)"),
        _fact("Root-zone depletion", f"{_num(r['depletion_mm'])} mm ({_pct(r['depletion_fraction'])} of the tank)"),
        _fact("Target band", f"{_band_pct(lo, hi)} depletion"),
        _fact("Status", f"{r['status'].replace('_', ' ')} ({_status_phrase(r['status'], r['deviation'])})"),
        _fact("Priority score", f"{r['score']} / 100 ({r['traffic']}), 70% today and 30% forecast"),
        _fact("Top driver", f"{top['label']}: {_driver_reading(top)}"),
    ]
    return headline, explanation, facts, [MODELLED_BALANCE_CAVEAT, FORECAST_CAVEAT]


def _insight_score(block_id, subject_id, ctx):
    block = _find_block(block_id, "score")
    ev = _evaluate(block, ctx)
    r = ev.response
    dev_now = r["deviation"]
    dev7 = projected_deviation(ev.forecast, 7)
    comp_now = abs(dev_now) / DEVIATION_FULL_SCALE * 100.0
    comp_fc = abs(dev7) / DEVIATION_FULL_SCALE * 100.0

    if r["status"] == "too_dry":
        today_desc = f"{_pts(dev_now)} points past its dry edge today"
    elif r["status"] == "too_wet":
        today_desc = f"{_pts(dev_now)} points below its wet edge today"
    else:
        today_desc = "inside its band today"

    if dev7 > 0:
        week_desc = f"drifting {_pts(dev7)} points past the dry edge within a week if nothing is done"
    elif dev7 < 0:
        week_desc = f"still {_pts(dev7)} points below the wet edge a week out"
    else:
        week_desc = "projected to stay inside its band through the week"

    headline = f"Why {block.name} scores {r['score']}"
    explanation = _join([
        "The score is an attention ranking from 0 to 100, how urgently the block needs eyes, "
        "not a grade for the wine.",
        f"It blends how far the block sits outside its moisture band today (70% of the score) with "
        f"where the forecast pushes it over the coming week (30%).",
        "A block that is fine today but drying fast still climbs the list.",
        f"{block.name} is {today_desc} and {week_desc}, which blends to {r['score']}, "
        f"'{r['traffic']}' on the traffic light.",
    ])
    facts = [
        _fact("Today's deviation", f"{_pts(dev_now)} points outside the band"
              if dev_now else "0 points (in band)"),
        _fact("7-day projected deviation", f"{_pts(dev7)} points outside the band"
              if dev7 else "0 points (in band)"),
        _fact("Today's component", f"{_num(comp_now)} pts (weight {_num(NOW_WEIGHT * 100, 0)}%)"),
        _fact("Forecast component", f"{_num(comp_fc)} pts (weight {_num(FORECAST_WEIGHT * 100, 0)}%)"),
        _fact("Blended score", f"{r['score']} / 100 ({r['traffic']})"),
    ]
    return headline, explanation, facts, [FORECAST_CAVEAT, MODELLED_BALANCE_CAVEAT]


def _insight_driver(block_id, subject_id, ctx):
    block = _find_block(block_id, "driver")
    if not subject_id:
        raise InvalidRequest("subject_id (driver key, e.g. 'et0_7d') is required for subject_type 'driver'")
    ev = _evaluate(block, ctx)
    drivers = ev.response["drivers"]
    d = next((x for x in drivers if x["key"] == subject_id), None)
    if d is None:
        available = ", ".join(x["key"] for x in drivers)
        raise SubjectNotFound(f"driver '{subject_id}' not available for {block.id}; available: {available}")
    story = DRIVER_STORY.get(d["key"], {
        "what": "a driver in the block's water budget",
        "why": "it shifts how fast the root zone empties",
        "nature": "From the engine's data feed.",
    })
    headline = f"{d['label']}: {_driver_reading(d)}"
    explanation = _join([
        f"{d['label']} is {story['what']}.",
        f"It matters because {story['why']}.",
        f"At {_driver_reading(d)} it reads '{d['pressure']}' pressure for {block.name}: "
        f"{PRESSURE_WORDS[d['pressure']]}.",
    ])
    facts = [
        _fact("Current reading (7-day basis)" if "7" in d["label"] else "Current reading",
              _driver_reading(d) if d["unit"] else str(d["value"])),
        _fact("Pressure", d["pressure"]),
        _fact("Block", f"{block.name} ({ev.response['stage']})"),
    ]
    return headline, explanation, facts, [story["nature"]]


def _insight_mswp(block_id, subject_id, ctx):
    block = _find_block(block_id, "mswp")
    ev = _evaluate(block, ctx)
    r = ev.response
    mpa = r["mswp_estimate_mpa"]
    b_lo, b_hi = r["mswp_band_mpa"]

    if mpa < b_lo:
        position = (
            f"more negative than the target, so the vines are pulling harder than the style "
            f"wants, and {TOO_DRY_MEANS}"
        )
    elif mpa > b_hi:
        position = (
            f"less negative than the target, so the vines are more comfortable than the style "
            f"wants, and {TOO_WET_MEANS}"
        )
    else:
        position = "inside the target range, so the vines carry the working thirst the wine style asks for"

    headline = f"Modelled vine water tension: {_num(mpa, 2)} MPa"
    explanation = _join([
        "A pressure bomb measures how hard a vine is pulling to get water.",
        "You seal a bagged leaf in the chamber at midday and squeeze until sap just returns to "
        "the cut; that pressure, in negative MPa, is the vine's own report. More negative "
        "means thirstier.",
        f"The engine translates its soil-water model onto that same scale, so {block.name} reads "
        f"like a pressure-bomb result without leaving the office.",
        f"Today it models {_num(mpa, 2)} MPa against a {r['stage']} target of {_num(b_lo, 2)} to "
        f"{_num(b_hi, 2)} MPa for {STYLE_WORDS.get(block.wine_style, block.wine_style)}.",
        f"That is {position}.",
    ])
    facts = [
        _fact("Modelled MSWP", f"{_num(mpa, 2)} MPa"),
        _fact("Target band (this stage/style)", f"{_num(b_lo, 2)} to {_num(b_hi, 2)} MPa"),
        _fact("Growth stage", r["stage"]),
        _fact("Soil-water depletion behind it", f"{_pct(r['depletion_fraction'])} of the tank"),
    ]
    return headline, explanation, facts, [MSWP_CAVEAT, MODELLED_BALANCE_CAVEAT]


def _insight_glide_path(block_id, subject_id, ctx):
    block = _find_block(block_id, "glide_path")
    ev = _evaluate(block, ctx)
    r = ev.response
    lo, hi = r["target_band"]

    style_line = {
        "premium_red": "as a premium red, this block is flown the driest of all, deep concentration is the whole point",
        "red": "as a red, it is pushed into a real deficit through ripening",
        "white": "as a white, it is kept fresher than the reds, moderate thirst, never punishing",
        "fresh_white": "as a fresh white, it is kept the most comfortable on the farm, because freshness needs an easy vine",
    }[block.wine_style]

    if r["status"] == "too_dry":
        now_line = (
            f"Right now {block.name} sits at {_pct(r['depletion_fraction'])} of the tank used against a "
            f"{_band_pct(lo, hi)} target, above the band, and {TOO_DRY_MEANS}."
        )
    elif r["status"] == "too_wet":
        now_line = (
            f"Right now {block.name} sits at {_pct(r['depletion_fraction'])} of the tank used against a "
            f"{_band_pct(lo, hi)} target, below the band, and {TOO_WET_MEANS}."
        )
    else:
        now_line = (
            f"Right now {block.name} sits at {_pct(r['depletion_fraction'])} of the tank used, inside its "
            f"{_band_pct(lo, hi)} target, exactly the thirst this stage of the wine wants."
        )

    headline = f"The {r['stage']} glide path for {block.name}"
    explanation = _join([
        "The glide path is the season's flight plan for soil moisture: a stage-by-stage target "
        "range for how much of the root-zone tank the vines should have drawn down.",
        f"It moves with the season because the wine wants different things at different times: "
        f"comfortable vines through flowering to build canopy, then a controlled thirst through "
        f"fruit set and veraison to keep berries small and concentrated.",
        f"{style_line[0].upper()}{style_line[1:]}.",
        now_line,
    ])
    facts = [
        _fact("Growth stage", r["stage"]),
        _fact("Wine style", block.wine_style.replace("_", " ")),
        _fact("Target band", f"{_band_pct(lo, hi)} of the tank used"),
        _fact("Current depletion", f"{_pct(r['depletion_fraction'])} ({_num(r['depletion_mm'])} mm of {_num(block.taw_mm, 0)} mm)"),
        _fact("Position", _status_phrase(r["status"], r["deviation"])),
    ]
    caveats = [
        "Band targets come from FAO-56 and deficit-irrigation research, not this farm's soil "
        "pits. Refine them per block as you learn it.",
        MODELLED_BALANCE_CAVEAT,
    ]
    return headline, explanation, facts, caveats


def _insight_pour_slip(block_id, subject_id, ctx):
    block = _find_block(block_id, "pour_slip")
    ev = _evaluate(block, ctx)
    r = ev.response
    slip = r["pour_slip"]
    lo, hi = r["target_band"]
    mid = (lo + hi) / 2

    if slip["type"] == "hold":
        headline = f"Hold the water on {block.name}"
        hold_days = slip.get("hold_days")
        drink_back = (
            f"On the current forecast the vines will drink it back into the band in about "
            f"{hold_days} days; check again on {slip['next_check']}."
            if hold_days
            else f"Check again on {slip['next_check']} once the vines have drawn the excess down."
        )
        explanation = _join([
            f"{block.name} is sitting wetter than its {r['stage']} band, so the slip says hold, not pour.",
            f"Watering now would push it further off path: {TOO_WET_MEANS}.",
            drink_back,
        ])
        facts = [
            _fact("Current depletion", f"{_pct(r['depletion_fraction'])} of the tank ({_num(r['depletion_mm'])} mm)"),
            _fact("Band floor (wet edge)", f"{_pct(lo)} depletion"),
            _fact("Water needed", "0 mm (hold)"),
            _fact("Estimated hold", f"{hold_days} days" if hold_days else "re-check at next visit"),
            _fact("Next check", slip["next_check"]),
        ]
        return headline, explanation, facts, [FORECAST_CAVEAT, MODELLED_BALANCE_CAVEAT]

    mid_mm = mid * block.taw_mm
    window_words = (
        "short enough to finish in one night's set"
        if slip["window"] == "tonight"
        else "more than one night's drip set, so it is split over the next two nights"
    )
    headline = f"Pour {_num(slip['needed_mm'])} mm, about {_num(slip['runtime_hours'])} h of drip"
    explanation = _join([
        "A pour slip is the night's watering order, sized to glide the block back to the middle "
        "of its band.",
        "It never refills to full. The vines keep the working thirst the wine wants.",
        f"{block.name} has drawn down {_num(r['depletion_mm'])} mm and the band midpoint for "
        f"{r['stage']} is {_num(mid_mm)} mm ({_pct(mid)} of the tank), so the difference, "
        f"{_num(slip['needed_mm'])} mm, is what goes on.",
        f"The drip line puts down {_num(block.application_rate_mm_h)} mm/h, which makes "
        f"{_num(slip['runtime_hours'])} hours of pumping, {window_words}.",
        f"Check again on {slip['next_check']} once the water has worked in.",
    ])
    facts = [
        _fact("Current depletion", f"{_num(r['depletion_mm'])} mm ({_pct(r['depletion_fraction'])} of the tank)"),
        _fact("Band midpoint target", f"{_num(mid_mm)} mm ({_pct(mid)} depletion)"),
        _fact("Water needed", f"{_num(slip['needed_mm'])} mm"),
        _fact("Application rate", f"{_num(block.application_rate_mm_h)} mm/h"),
        _fact("Runtime", f"{_num(slip['runtime_hours'])} h"),
        _fact("Window", slip["window"]),
        _fact("Next check", slip["next_check"]),
    ]
    caveats = [
        "Runtime assumes the block's rated application rate. A blocked or ageing line delivers less.",
        MODELLED_BALANCE_CAVEAT,
    ]
    return headline, explanation, facts, caveats


def _battle_plan_for(ctx):
    evaluations = evaluate_all(ctx["as_of"], ctx["provider"])
    hours = _ctx_float(ctx, "available_hours_per_day", 6.0, 0.5, 24.0)
    horizon = _ctx_int(ctx, "horizon_days", 3, 1, 14)
    plan = build_plan(evaluations, hours, horizon, ctx["as_of"])
    return evaluations, plan, hours


def _insight_battle_plan_entry(block_id, subject_id, ctx):
    bid = subject_id or block_id
    if not bid:
        raise InvalidRequest("subject_id (block id) is required for subject_type 'battle_plan_entry'")
    evaluations, plan, hours = _battle_plan_for(ctx)
    ev = next((e for e in evaluations if e.block.id == bid), None)
    if ev is None:
        raise SubjectNotFound(f"block '{bid}' not found")

    want_day = str(ctx.get("day")) if ctx.get("day") else None
    hit = None
    for day in plan["plan"]:
        if want_day and day["day"] != want_day:
            continue
        for entry in day["entries"]:
            if entry["block_id"] == bid:
                hit = (day["day"], entry)
                break
        if hit:
            break
    if hit is None:
        skip = next((s for s in plan["skipped"] if s["block_id"] == bid), None)
        if skip:
            raise SubjectNotFound(
                f"block '{bid}' is not scheduled, it was skipped: {skip['reason']} "
                f"(ask subject_type 'battle_plan_skip')"
            )
        raise SubjectNotFound(
            f"block '{bid}' has no battle-plan entry"
            + (f" on {want_day}" if want_day else "")
            + ", it is already at or under its band midpoint"
        )

    day_iso, entry = hit
    r = ev.response
    block = ev.block
    stage_w = STAGE_SENSITIVITY.get(r["stage"], 1.0)
    style_w = STYLE_WEIGHT.get(block.wine_style, 1.0)

    headline = f"{block.name}: {_num(entry['hours'])} h on {day_iso}"
    explanation = _join([
        f"With only {_num(hours)} pump-hours a day, the plan ranks every block each morning by how "
        f"far it has drifted too dry.",
        "The plan weights that drift by growth stage (fruit set and veraison count double because "
        "they shape the wine most) and by wine value (premium red weighs 1.3×).",
        f"{block.name} earned {_num(entry['hours'])} hours ({_num(entry['mm_applied'])} mm) on {day_iso}: "
        f"it stands {_pts(r['deviation'])} points past its {r['stage']} band with no useful rain coming.",
        "Water spent here moves the wine more than anywhere else.",
        "If tomorrow's weather changes the ranking, the plan changes with it.",
    ])
    facts = [
        _fact("Day", day_iso),
        _fact("Hours allocated", f"{_num(entry['hours'])} h"),
        _fact("Water applied", f"{_num(entry['mm_applied'])} mm"),
        _fact("Scheduler's reason", entry["reason"]),
        _fact("Current deviation", f"{_pts(r['deviation'])} points past the dry edge"),
        _fact("Stage weight", f"×{_num(stage_w)} ({r['stage']})"),
        _fact("Wine-value weight", f"×{_num(style_w)} ({block.wine_style.replace('_', ' ')})"),
    ]
    return headline, explanation, facts, [FORECAST_CAVEAT, MODELLED_BALANCE_CAVEAT]


def _insight_battle_plan_skip(block_id, subject_id, ctx):
    bid = subject_id or block_id
    if not bid:
        raise InvalidRequest("subject_id (block id) is required for subject_type 'battle_plan_skip'")
    evaluations, plan, _hours = _battle_plan_for(ctx)
    ev = next((e for e in evaluations if e.block.id == bid), None)
    if ev is None:
        raise SubjectNotFound(f"block '{bid}' not found")
    skip = next((s for s in plan["skipped"] if s["block_id"] == bid), None)
    if skip is None:
        raise SubjectNotFound(f"block '{bid}' was not skipped by the battle plan")

    r = ev.response
    block = ev.block
    rain48 = sum(e["rain"] for e in ev.forecast[:2])

    if r["status"] == "too_wet":
        headline = f"{block.name} skipped: already too wet"
        explanation = _join([
            f"{block.name} sits below the wet edge of its {r['stage']} band, so it was left out of "
            f"the watering plan on purpose.",
            f"More water would push it further off path, and {TOO_WET_MEANS}.",
            "It comes back into the queue once the vines have drunk the excess down.",
        ])
        facts = [
            _fact("Skip reason", skip["reason"]),
            _fact("Current depletion", f"{_pct(r['depletion_fraction'])} of the tank"),
            _fact("Band floor (wet edge)", f"{_pct(r['target_band'][0])} depletion"),
            _fact("Status", "too wet"),
        ]
    else:
        headline = f"{block.name} skipped: rain is about to do the job"
        explanation = _join([
            "The scheduler looks 48 hours ahead before spending pump time.",
            f"{block.name} has {_num(rain48)} mm of rain forecast within the next two days, over "
            f"the {_num(RAIN_SKIP_MM_48H)} mm threshold at which rain closes the deficit on its own.",
            "Skipping it keeps those hours for blocks with nothing coming. That skipped water is "
            "the saving the plan's summary counts.",
            "If the rain disappoints, tomorrow's re-run puts the block straight back in the queue.",
        ])
        facts = [
            _fact("Skip reason", skip["reason"]),
            _fact("Rain forecast next 48 h", f"{_num(rain48)} mm"),
            _fact("Skip threshold", f"{_num(RAIN_SKIP_MM_48H)} mm in 48 h"),
            _fact("Current status", r["status"].replace("_", " ")),
        ]
    return headline, explanation, facts, [FORECAST_CAVEAT]


def _insight_season_bank(block_id, subject_id, ctx):
    remaining = _ctx_float(ctx, "remaining_m3", 12000.0, 0.0, 10_000_000.0)
    inputs = season_bank_inputs(ctx["as_of"], ctx["provider"])
    kc = kc_curves()
    bank = compute_bank(inputs, remaining, ctx["as_of"], kc)
    totals = block_demand_totals(inputs, ctx["as_of"], kc)
    names = {inp["block"].id: inp["block"].name for inp in inputs}

    demand = bank["projected_demand_m3"]
    if totals and demand > 0:
        top_id = max(totals, key=totals.get)
        share = totals[top_id] / max(1.0, sum(totals.values())) * 100
        top_line = (
            f"The biggest single draw is {names[top_id]} at about {round(totals[top_id]):,} m³ "
            f"({_num(share, 0)}% of demand)"
        )
    else:
        top_id, top_line = None, ""

    if bank["verdict"] == "sufficient":
        headline = f"Water bank: enough to finish the season"
        margin = bank["remaining_m3"] - demand
        verdict_line = (
            f"The verdict is 'sufficient': the rest of the season needs about {demand:,} m³ against "
            f"{bank['remaining_m3']:,} m³ in the dam, roughly {margin:,} m³ of margin at season end "
            f"({bank['season_end']})."
        )
        lever_line = f"{top_line}, the first lever if the dam level ever surprises you." if top_line else ""
    else:
        headline = "Water bank: the dam runs out before the vines do"
        verdict_line = (
            f"The verdict is 'shortfall': the season needs about {demand:,} m³ but only "
            f"{bank['remaining_m3']:,} m³ remains, running dry around {bank['run_dry_date']}, "
            f"{bank['days_short']} days short of the last harvest."
        )
        lever_line = (
            "The biggest lever is the white blocks: flying them at the lower (drier) edge of their "
            "bands trims roughly 15% of their demand without touching the reds."
        )

    explanation = _join([
        "The season bank is the dam-versus-vineyard ledger.",
        "Day by day until each block's harvest, it adds up the water needed to hold every block "
        "at the middle of its glide-path band.",
        "The next two weeks run on the real forecast; every stage after that runs on typical "
        "Cape weather.",
        verdict_line,
        lever_line,
    ])
    facts = [
        _fact("Projected demand to harvest", f"{demand:,} m³"),
        _fact("Water in the bank", f"{bank['remaining_m3']:,} m³"),
        _fact("Verdict", bank["verdict"]),
        _fact("Season end", bank["season_end"]),
    ]
    if top_id:
        facts.append(_fact("Biggest single draw", f"{names[top_id]} ({round(totals[top_id]):,} m³)"))
    if bank["verdict"] == "shortfall":
        facts.append(_fact("Projected run-dry date", str(bank["run_dry_date"])))
        facts.append(_fact("Days short", str(bank["days_short"])))
    caveats = [
        "Beyond the 14-day forecast the model runs on stage-typical climate, not weather. The "
        "verdict firms up as the season shortens.",
        "Demand assumes you hold every block at its band midpoint; deliberate deficit decisions "
        "reduce it.",
    ]
    return headline, explanation, facts, caveats


def _insight_backtest_event(block_id, subject_id, ctx):
    if not subject_id:
        raise InvalidRequest("subject_id (event date, YYYY-MM-DD) is required for subject_type 'backtest_event'")
    months = _ctx_int(ctx, "months", 4, 1, 12)
    result = run_backtest(
        load_blocks(), ctx["provider"], ctx["as_of"], months,
        stress_targets(), kc_curves(), irrigation_for_block,
    )
    event = next((e for e in result["events"] if e["date"] == subject_id), None)
    if event is None:
        available = ", ".join(e["date"] for e in result["events"]) or "none in this window"
        raise SubjectNotFound(f"no backtest event on '{subject_id}'; events in window: {available}")

    flagged = ", ".join(event["blocks_flagged"]) if event["blocks_flagged"] else "none"
    lead = event["lead_days"]
    if event["blocks_flagged"]:
        lead_line = (
            f"That {lead}-day head start is the point: enough time to fill the soil profile before "
            f"the heat lands, instead of chasing stress after it."
        )
    else:
        lead_line = "No block needed flagging: managed irrigation held the farm in band through the event."

    headline = f"Heat spike of {event['date']}: seen {lead} days out" if lead else f"Heat spike of {event['date']}"
    explanation = _join([
        "This replay is honest about hindsight: the engine re-scored every past day using only "
        "the weather knowable that morning, plus the forward projection it would have run.",
        "No peeking at what actually happened next.",
        event["narrative"],
        lead_line,
    ])
    facts = [
        _fact("Event date", event["date"]),
        _fact("Event type", event["type"].replace("_", " ")),
        _fact("Blocks flagged ahead of it", flagged),
        _fact("Lead time", f"{lead} days"),
        _fact("Method", "information-limited replay"),
    ]
    caveats = [
        "No archived forecasts exist to replay, so the archived weather series stands in for the "
        "forecast the engine would have held. We say so rather than claim foreknowledge.",
    ]
    return headline, explanation, facts, caveats


def _insight_scenario_delta(block_id, subject_id, ctx):
    block = _find_block(block_id, "scenario_delta")
    kind = str(subject_id or ctx.get("type") or "heatwave")
    if kind not in SCENARIO_KINDS:
        raise InvalidRequest(f"unknown scenario type '{kind}'; valid: {', '.join(SCENARIO_KINDS)}")
    days = _ctx_int(ctx, "days", 7, 1, 30)

    targets, kc = stress_targets(), kc_curves()
    baseline = evaluate_block(block, ctx["as_of"], ctx["provider"], targets, kc)
    forward = forward_weather(ctx["provider"], block.lat, block.lon, ctx["as_of"], FORWARD_DAYS)
    perturbed = evaluate_block(
        block, ctx["as_of"], ctx["provider"], targets, kc,
        forward_override=perturb_forward(forward, kind, days),
    )
    delta = perturbed.response["score"] - baseline.response["score"]

    def _f7(ev: Evaluation) -> float:
        idx = min(7, len(ev.forecast)) - 1
        return ev.forecast[idx]["depletion_fraction_projected"] if idx >= 0 else 0.0

    base_f7, pert_f7 = _f7(baseline), _f7(perturbed)
    story = PERTURBATION_STORY[kind].format(days=days)

    if delta > 0:
        meaning = (
            f"the block loses ground: its water comes under real pressure, and it climbs the "
            f"priority list by {delta} points"
        )
    elif delta < 0:
        meaning = f"pressure eases, the score drops {abs(delta)} points and the block can wait its turn"
    else:
        meaning = "the score barely moves, this block can ride the event out"

    headline = f"{kind.replace('_', ' ').title()} would move {block.name} {delta:+d} points"
    explanation = _join([
        f"This scenario re-ran {block.name}'s water balance with {story}.",
        f"A week out, projected depletion moves from {_pct(base_f7)} to {_pct(pert_f7)} of the tank, "
        f"and the priority score moves from {baseline.response['score']} to "
        f"{perturbed.response['score']}.",
        f"In grower terms, {meaning}.",
    ])
    facts = [
        _fact("Scenario", f"{kind.replace('_', ' ')} ({days} days)"),
        _fact("Baseline score", f"{baseline.response['score']} / 100"),
        _fact("Scenario score", f"{perturbed.response['score']} / 100"),
        _fact("Score change", f"{delta:+d} points"),
        _fact("Projected depletion in 7 days", f"{_pct(base_f7)} → {_pct(pert_f7)} of the tank"),
    ]
    caveats = [
        "A what-if on modelled weather, not a forecast. It shows sensitivity, not destiny.",
        MODELLED_BALANCE_CAVEAT,
    ]
    return headline, explanation, facts, caveats


def _insight_photo_analysis(block_id, subject_id, ctx):
    record = None
    if subject_id:
        record = photo_record(subject_id)
        if record is None:
            raise SubjectNotFound(f"photo '{subject_id}' not found")
    else:
        block = _find_block(block_id, "photo_analysis")
        rows = photos_for_block(block.id)
        if not rows:
            raise SubjectNotFound(f"no photos logged for block '{block.id}' yet")
        record = rows[0]

    a = record["analysis"]
    hint = a["stress_hint"]
    agree_word = "matched" if a.get("agrees_with_model") else "disagreed with"
    headline = f"Canopy photo reads '{hint}' for {record['block_id']}"
    explanation = _join([
        "The app reads the photo with plain colour math, not machine learning.",
        "Canopy cover is the share of the frame that is green leaf; GLI scores how deeply green "
        "those leaves are (healthy canopy sits around 0.1 or higher); yellowing is the share of "
        "foliage drifting off green.",
        f"This shot reads {_num(a['canopy_cover_pct'])}% canopy cover, GLI {_num(a['gli_mean'], 3)} and "
        f"{_num(a['yellowing_pct'])}% yellowing, hint '{hint}', meaning {HINT_MEANING[hint]}.",
        f"On the day it was taken, that visual read {agree_word} the water model's verdict for the block.",
    ])
    facts = [
        _fact("Photo date", record["date"]),
        _fact("Canopy cover", f"{_num(a['canopy_cover_pct'])}% of frame"),
        _fact("GLI (green leaf index)", _num(a["gli_mean"], 3)),
        _fact("Yellowing", f"{_num(a['yellowing_pct'])}% of foliage"),
        _fact("Stress hint", hint),
        _fact("Agrees with water model", "yes" if a.get("agrees_with_model") else "no"),
    ]
    caveats = [
        "A phone photo is a screening aid, not a diagnosis. Light, angle and background all shift "
        "the numbers. It corroborates the model; it does not replace a pressure bomb.",
    ]
    return headline, explanation, facts, caveats


def _insight_term(block_id, subject_id, ctx):
    if not subject_id:
        raise InvalidRequest("subject_id (the term to define) is required for subject_type 'term'")
    glossary = load_glossary()
    wanted = _normalize_term(subject_id)
    entry = None
    for t in glossary["terms"]:
        keys = {_normalize_term(t["id"]), _normalize_term(t["term"])}
        keys.update(_normalize_term(a) for a in t.get("aliases", []))
        if wanted in keys:
            entry = t
            break
    if entry is None:
        known = ", ".join(t["term"].split(" (")[0] for t in glossary["terms"])
        raise SubjectNotFound(f"term '{subject_id}' is not in the glossary; known terms: {known}")

    headline = entry["term"]
    explanation = _join([entry["definition"], entry.get("why_it_matters", "")])
    facts = [_fact("Term", entry["term"])]
    aliases = [a for a in entry.get("aliases", []) if _normalize_term(a) != _normalize_term(entry["term"])]
    if aliases:
        facts.append(_fact("Also called", ", ".join(aliases[:4])))
    return headline, explanation, facts, []


_BUILDERS = {
    "block_status": _insight_block_status,
    "score": _insight_score,
    "driver": _insight_driver,
    "mswp": _insight_mswp,
    "glide_path": _insight_glide_path,
    "pour_slip": _insight_pour_slip,
    "battle_plan_entry": _insight_battle_plan_entry,
    "battle_plan_skip": _insight_battle_plan_skip,
    "season_bank": _insight_season_bank,
    "backtest_event": _insight_backtest_event,
    "scenario_delta": _insight_scenario_delta,
    "photo_analysis": _insight_photo_analysis,
    "term": _insight_term,
}


def build_insight(subject_type: str, block_id: str | None, subject_id: str | None, context: dict) -> dict:
    """Assemble a deterministic insight. `context` must carry `as_of` (date) and
    `provider`; any client extras (scenario type, plan day, hours) ride alongside."""
    builder = _BUILDERS.get(subject_type)
    if builder is None:
        raise UnknownSubjectType(
            f"unknown subject_type '{subject_type}'; valid: {', '.join(VALID_SUBJECTS)}"
        )
    headline, explanation, facts, caveats = builder(block_id, subject_id, context)
    return {
        "headline": headline,
        "explanation": explanation,
        "facts": facts,
        "caveats": caveats,
        "source": "template",
        "subject_type": subject_type,
    }
