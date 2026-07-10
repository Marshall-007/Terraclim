from __future__ import annotations

from datetime import date

from dateutil.relativedelta import relativedelta

from .phenology import build_phenology, variety_factor
from .scoring import band_for, deviation_status, score_value
from .water_balance import compute_balance

HEAT_SPIKE_TMAX = 35.0
LEAD_LOOKBACK_DAYS = 14
FORWARD_HORIZON = 7


def _season_start(as_of: date) -> date:
    year = as_of.year if as_of.month >= 9 else as_of.year - 1
    return date(year, 9, 1)


def _block_daily(block, provider, targets, kc, season: date, as_of: date, irrigation: dict) -> list[dict]:
    factor = variety_factor(block.variety)
    history = provider.get_daily(block.lat, block.lon, season, as_of)
    phen = build_phenology(history, factor)
    balance = compute_balance(history, phen, kc, block.taw_mm, irrigation)
    tmax_by_date = {w.date: w.tmax for w in history}

    rows: list[dict] = []
    for bd in balance:
        lo, hi = band_for(targets, bd.stage, block.wine_style)
        dev, status = deviation_status(bd.depletion_fraction, lo, hi)
        rows.append(
            {
                "date": bd.date,
                "f": bd.depletion_fraction,
                "lo": lo,
                "hi": hi,
                "dev": dev,
                "status": status,
                "tmax": tmax_by_date.get(bd.date, 0.0),
            }
        )
    return rows


def _score_at(rows: list[dict], i: int) -> int:
    now = rows[i]["dev"]
    j = min(i + FORWARD_HORIZON, len(rows) - 1)
    fut = rows[j]["dev"]
    return score_value(now, fut)


def run_backtest(blocks, provider, as_of: date, months: int, targets: dict, kc: dict, irrigation_lookup) -> dict:
    season = _season_start(as_of)
    window_start = as_of - relativedelta(months=months)

    per_block: dict[str, list[dict]] = {}
    for block in blocks:
        per_block[block.id] = _block_daily(
            block, provider, targets, kc, season, as_of, irrigation_lookup(block.id)
        )

    # Align on the first block's dates; all share the same calendar.
    ref = next(iter(per_block.values()))
    idx_by_date = {row["date"]: i for i, row in enumerate(ref)}
    window_dates = [row["date"] for row in ref if row["date"] >= window_start]

    series: list[dict] = []
    farm_tmax: dict[date, float] = {}
    for d in window_dates:
        i = idx_by_date[d]
        scores = []
        out_of_band = 0
        tmaxes = []
        for rows in per_block.values():
            scores.append(_score_at(rows, i))
            if rows[i]["status"] != "on_track":
                out_of_band += 1
            tmaxes.append(rows[i]["tmax"])
        farm_tmax[d] = sum(tmaxes) / len(tmaxes)
        series.append(
            {
                "date": d.isoformat(),
                "farm_mean_score": round(sum(scores) / len(scores)),
                "blocks_out_of_band": out_of_band,
            }
        )

    events = _detect_heat_spikes(window_dates, farm_tmax, per_block, idx_by_date)

    return {
        "window": [window_start.isoformat(), as_of.isoformat()],
        "events": events,
        "series": series,
    }


def _detect_heat_spikes(window_dates, farm_tmax, per_block, idx_by_date) -> list[dict]:
    spikes: list[date] = []
    for k, d in enumerate(window_dates):
        t = farm_tmax[d]
        if t < HEAT_SPIKE_TMAX:
            continue
        neighbours = [farm_tmax[window_dates[j]]
                      for j in range(max(0, k - 2), min(len(window_dates), k + 3))]
        if t >= max(neighbours):
            spikes.append(d)

    # Collapse spikes within 3 days into a single event at the peak.
    events: list[dict] = []
    used: set[date] = set()
    for d in spikes:
        if d in used:
            continue
        cluster = [s for s in spikes if abs((s - d).days) <= 3]
        used.update(cluster)
        peak = max(cluster, key=lambda s: farm_tmax[s])
        events.append(_build_event(peak, farm_tmax, per_block, idx_by_date))
    return events


def _build_event(peak: date, farm_tmax, per_block, idx_by_date) -> dict:
    pi = idx_by_date[peak]
    flagged: list[str] = []
    best_lead = 0
    headline_block: str | None = None

    for bid, rows in per_block.items():
        # Flagged if out of band at the spike or in the two days around it.
        window_status = any(
            rows[j]["status"] == "too_dry"
            for j in range(max(0, pi - 1), min(len(rows), pi + 2))
        )
        if not window_status:
            continue
        flagged.append(bid)

        lead = 0
        for back in range(1, LEAD_LOOKBACK_DAYS + 1):
            di = pi - back
            if di < 0:
                break
            j = min(di + FORWARD_HORIZON, len(rows) - 1)
            projected_breach = rows[j]["f"] > rows[di]["hi"]
            if projected_breach:
                lead = back
        if lead > best_lead:
            best_lead = lead
            headline_block = bid

    if headline_block is None and flagged:
        headline_block = flagged[0]

    peak_temp = round(farm_tmax[peak])
    if headline_block:
        narrative = (
            f"Engine projected {headline_block} breaching its band {best_lead} days "
            f"before the {peak_temp}°C spike."
        )
    else:
        narrative = f"{peak_temp}°C heat spike; all blocks held inside their bands."

    return {
        "date": peak.isoformat(),
        "type": "heat_spike",
        "blocks_flagged": flagged,
        "lead_days": best_lead,
        "narrative": narrative,
    }
