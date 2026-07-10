from __future__ import annotations

from datetime import date, timedelta

# Stage sensitivity: fruit-set and veraison are the quality-defining deficit
# windows, so they weigh double when ranking who gets scarce irrigation hours.
STAGE_SENSITIVITY = {"fruit_set": 2.0, "veraison": 2.0}
STYLE_WEIGHT = {"premium_red": 1.3, "red": 1.15, "white": 1.0, "fresh_white": 1.0}

RAIN_SKIP_MM_48H = 8.0
MEANINGFUL_RAIN_MM = 5.0


def _days_to_rain(forecast: list[dict]) -> int:
    for i, e in enumerate(forecast, start=1):
        if e["rain"] >= MEANINGFUL_RAIN_MM:
            return i
    return len(forecast)


def build_plan(evaluations: list, available_hours_per_day: float, horizon_days: int, as_of: date) -> dict:
    blocks = []
    for ev in evaluations:
        r = ev.response
        lo, hi = r["target_band"]
        blocks.append(
            {
                "id": ev.block.id,
                "taw": ev.block.taw_mm,
                "rate": ev.block.application_rate_mm_h,
                "area_m2": ev.block.area_m2,
                "stage": r["stage"],
                "style": ev.block.wine_style,
                "status": r["status"],
                "D": r["depletion_mm"],
                "lo": lo,
                "hi": hi,
                "forecast": ev.forecast,
                "fmap": {date.fromisoformat(e["date"]): e for e in ev.forecast},
                "rain48": sum(e["rain"] for e in ev.forecast[:2]),
            }
        )

    skipped: list[dict] = []
    eligible: list[dict] = []
    water_saved_m3 = 0.0

    for b in blocks:
        mid = (b["lo"] + b["hi"]) / 2
        if b["status"] == "too_wet":
            skipped.append({"block_id": b["id"],
                            "reason": "Currently too wet — irrigation would push it further off path."})
            continue
        if b["rain48"] >= RAIN_SKIP_MM_48H:
            needed = max(0.0, b["D"] - mid * b["taw"])
            water_saved_m3 += needed / 1000.0 * b["area_m2"]
            skipped.append({"block_id": b["id"],
                            "reason": f"{round(b['rain48'])} mm rain forecast within 48 h "
                                      f"closes the deficit without irrigation."})
            continue
        if b["D"] <= mid * b["taw"] + 1e-9:
            continue  # already at/under the band midpoint: no irrigation needed
        eligible.append(b)

    sim = {b["id"]: b["D"] for b in eligible}
    plan: list[dict] = []
    scheduled_ids: set[str] = set()

    for i in range(horizon_days):
        day = as_of + timedelta(days=i)
        budget = float(available_hours_per_day)
        entries: list[dict] = []

        ranked = []
        for b in eligible:
            D = sim[b["id"]]
            mid = (b["lo"] + b["hi"]) / 2
            if D <= mid * b["taw"] + 1e-9:
                continue
            too_dry_dev = max(0.0, D / b["taw"] - b["hi"])
            priority = too_dry_dev * STAGE_SENSITIVITY.get(b["stage"], 1.0) * STYLE_WEIGHT.get(b["style"], 1.0)
            if priority > 0:
                ranked.append((priority, b))
        ranked.sort(key=lambda x: x[0], reverse=True)

        for rank_idx, (_priority, b) in enumerate(ranked):
            if budget <= 0.05:
                break
            D = sim[b["id"]]
            mid = (b["lo"] + b["hi"]) / 2
            needed_mm = max(0.0, D - mid * b["taw"])
            hours = round(min(budget, needed_mm / b["rate"]), 1) if b["rate"] > 0 else 0.0
            if hours <= 0:
                continue
            mm_applied = round(hours * b["rate"], 1)
            sim[b["id"]] = max(0.0, D - mm_applied)
            budget -= hours
            scheduled_ids.add(b["id"])
            rank_word = "Highest" if rank_idx == 0 else "Elevated"
            entries.append(
                {
                    "block_id": b["id"],
                    "hours": hours,
                    "mm_applied": mm_applied,
                    "reason": f"{rank_word} glide-path deviation (too dry) in {b['stage']}; "
                              f"no rain forecast {_days_to_rain(b['forecast'])} days.",
                }
            )

        next_day = as_of + timedelta(days=i + 1)
        for b in eligible:
            e = b["fmap"].get(next_day)
            if e:
                sim[b["id"]] = min(b["taw"], max(0.0, sim[b["id"]] + e["etc"] - e["rain"]))
        plan.append({"day": day.isoformat(), "entries": entries})

    total_available_hours = round(available_hours_per_day * horizon_days, 1)
    if total_available_hours == int(total_available_hours):
        total_available_hours = int(total_available_hours)
    skipped_noun = "block" if len(skipped) == 1 else "blocks"
    summary = (
        f"{total_available_hours} available hours allocated to {len(scheduled_ids)} of "
        f"{len(blocks)} blocks; {len(skipped)} {skipped_noun} skipped on forecast; "
        f"est. {round(water_saved_m3)} m³ water saved."
    )
    return {"as_of": as_of.isoformat(), "plan": plan, "skipped": skipped, "summary": summary}
