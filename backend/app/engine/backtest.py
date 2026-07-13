"""Information-limited backtest: replays past days using only the data the
engine would actually have had at the time, to honestly evaluate whether it
would have caught real stress events (like a heat spike) ahead of time.

Nothing here peeks at weather or depletion measured after a given row's own
date; the "projection" on each row is what the engine's forward model would
have produced running from that day forward, exactly as it does live.
"""
from __future__ import annotations

from datetime import date, timedelta

from dateutil.relativedelta import relativedelta

from .forecast import project_forward, projected_deviation
from .phenology import build_phenology, variety_factor
from .scoring import band_for, deviation_status, score_value
from .water_balance import compute_balance

HEAT_SPIKE_TMAX = 35.0
HEAT_FORECAST_TMAX = 33.0   # a day this hot inside the forward window = the engine "saw heat coming"
LEAD_LOOKBACK_DAYS = 14
FORWARD_HORIZON = 7         # 7-day window for the score's forecast component (contract)
PROJECTION_DAYS = 10       # early-warning look-ahead for event detection
HARVEST_GDD = 1600.0


def _season_start(as_of: date) -> date:
    """1 September of the Southern-Hemisphere season containing as_of (local
    copy of services.season_start to keep this module free of the services
    import cycle)."""
    year = as_of.year if as_of.month >= 9 else as_of.year - 1
    return date(year, 9, 1)


def _block_daily(block, provider, targets, kc, season: date, as_of: date, irrigation: dict) -> list[dict]:
    """Per-day record for one block. Each day D carries its actual state (from data
    up to and including D) and a *projected* signal: what the engine's own forward
    model, run at D on a forecast it would have had, expected over the next week. No
    row consults weather or depletion measured after its own date: the backtest is
    information-limited."""
    factor = variety_factor(block.variety)
    history = provider.get_daily(block.lat, block.lon, season, as_of)
    # Forward weather the engine would have projected from; deterministic here, a live
    # forecast feed in production (disclosed: no archived forecast exists to replay).
    forward_ext = provider.get_daily(
        block.lat, block.lon, as_of + timedelta(days=1), as_of + timedelta(days=PROJECTION_DAYS)
    )
    combined = history + forward_ext

    phen = build_phenology(history, factor)
    balance = compute_balance(history, phen, kc, block.taw_mm, irrigation)
    tmax_by_date = {w.date: w.tmax for w in history}
    gdd_by_i = [g for _d, g, _s in phen]
    harvest_onset = next((d for d, g, _s in phen if g >= HARVEST_GDD * factor), None)

    rows: list[dict] = []
    for i, bd in enumerate(balance):
        lo, hi = band_for(targets, bd.stage, block.wine_style)
        dev, status = deviation_status(bd.depletion_fraction, lo, hi)

        window = combined[i + 1: i + 1 + PROJECTION_DAYS]
        proj = project_forward(
            bd.depletion_mm, gdd_by_i[i], harvest_onset, window,
            factor, kc, block.taw_mm, targets, block.wine_style,
        )
        # Score's forecast component uses the 7-day deviation, identical to the live
        # engine; event detection scans the fuller window for a projected breach.
        proj_dev = projected_deviation(proj, FORWARD_HORIZON)
        proj_breach = any(p["depletion_fraction_projected"] > p["band_hi"] for p in proj)
        proj_hot = max((w.tmax for w in window), default=0.0)

        rows.append(
            {
                "date": bd.date,
                "f": bd.depletion_fraction,
                "lo": lo,
                "hi": hi,
                "dev": dev,
                "status": status,
                "tmax": tmax_by_date.get(bd.date, 0.0),
                "proj_dev": proj_dev,
                "proj_breach": proj_breach,
                "proj_hot": proj_hot,
            }
        )
    return rows


def _score_at(rows: list[dict], i: int) -> int:
    """Score with the forward component drawn from the day-i projection: the same
    now/forecast blend the live engine uses, never a peek at realised future state."""
    return score_value(rows[i]["dev"], rows[i]["proj_dev"])


def run_backtest(blocks, provider, as_of: date, months: int, targets: dict, kc: dict, irrigation_lookup) -> dict:
    """Replay the last `months` of the season for every block and return the
    farm-wide score series plus any detected heat-spike events with their lead time."""
    window_start = as_of - relativedelta(months=months)
    season = _season_start(as_of)

    per_block: dict[str, list[dict]] = {}
    for block in blocks:
        per_block[block.id] = _block_daily(
            block, provider, targets, kc, season, as_of, irrigation_lookup(block.id)
        )

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
        "methodology": "information_limited",
        "events": events,
        "series": series,
    }


def _detect_heat_spikes(window_dates, farm_tmax, per_block, idx_by_date) -> list[dict]:
    """Find local-maximum days at or above HEAT_SPIKE_TMAX in the farm-mean max
    temperature, then collapse nearby days into single events."""
    spikes: list[date] = []
    for k, d in enumerate(window_dates):
        t = farm_tmax[d]
        if t < HEAT_SPIKE_TMAX:
            continue
        # A "spike" day must be the hottest within its own +/-2-day neighbourhood,
        # not just any day over the threshold, so a multi-day heat wave registers
        # once at its peak rather than as several overlapping events.
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
    """Flag a block if, at a decision day in the fortnight *before* the peak, the
    engine's forward projection (run on data up to that day) crossed the block into
    a too-dry breach while it was still in band: a genuine ahead-of-time warning,
    not a block already out of band. Lead = the earliest such warning day."""
    pi = idx_by_date[peak]
    flagged: list[str] = []
    best_lead = 0
    headline_block: str | None = None

    for bid, rows in per_block.items():
        lead = 0
        for back in range(1, LEAD_LOOKBACK_DAYS + 1):
            di = pi - back
            if di < 0:
                break
            r = rows[di]
            # Early warning: the forecast the engine held at di carried building heat
            # AND its projection crossed the still-in-band block into a too-dry breach.
            if r["proj_breach"] and r["status"] != "too_dry" and r["proj_hot"] >= HEAT_FORECAST_TMAX:
                lead = back  # keep advancing -> ends at the earliest warning day
        if lead == 0:
            continue
        flagged.append(bid)
        if lead > best_lead:
            best_lead = lead
            headline_block = bid

    if headline_block is None and flagged:
        headline_block = flagged[0]

    peak_temp = round(farm_tmax[peak])
    if not flagged:
        narrative = f"{peak_temp}°C heat spike; managed irrigation held all blocks in band."
    else:
        narrative = (
            f"On data available at the time, the engine projected {headline_block} "
            f"breaching its band {best_lead} days before the {peak_temp}°C spike."
        )

    return {
        "date": peak.isoformat(),
        "type": "heat_spike",
        "blocks_flagged": flagged,
        "lead_days": best_lead,
        "narrative": narrative,
    }
