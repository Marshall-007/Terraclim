from datetime import date, timedelta
from types import SimpleNamespace

from app.engine.battle_plan import build_plan
from app.engine.phenology import build_phenology
from app.engine.scoring import (
    band_for,
    build_pour_slip,
    deviation_status,
    score_value,
    traffic_for,
)
from app.engine.season_bank import compute_bank
from app.engine.water_balance import compute_balance
from app.providers.base import DailyWeather
from app.providers.fixture import FixtureProvider
from app.services import Block, stress_targets, kc_curves

SEASON_START = date(2025, 9, 1)


def make_weather(n_days, tmax, tmin, et0=5.0, rain=0.0, start=SEASON_START):
    return [
        DailyWeather(date=start + timedelta(days=i), et0=et0, rain=rain, tmax=tmax, tmin=tmin)
        for i in range(n_days)
    ]


# --- phenology / GDD stage inference --------------------------------------

def test_gdd_stage_inference_and_variety_factor():
    # 10 GDD/day: (20+20)/2 - 10 = 10.
    weather = make_weather(120, tmax=20.0, tmin=20.0)

    chenin = build_phenology(weather, factor=1.00)  # thresholds unscaled
    # Day 60 -> 600 GDD -> fruit_set (>=500, <1150). Day index 59 = 600 cumulative.
    assert chenin[59][1] == 600.0
    assert chenin[59][2] == "fruit_set"
    # Day 10 -> 100 GDD -> exactly budbreak entry.
    assert chenin[9][2] == "budbreak"

    cabernet = build_phenology(weather, factor=1.15)  # fruit_set needs 575 GDD
    # At 600 GDD Cabernet is fruit_set (575) but flowering entry at 460, veraison 1322.
    assert cabernet[59][2] == "fruit_set"
    # At 500 GDD (day 50) Cabernet still flowering (needs 575 for fruit_set).
    assert cabernet[49][1] == 500.0
    assert cabernet[49][2] == "flowering"


def test_gdd_below_base_is_dormant():
    weather = make_weather(30, tmax=8.0, tmin=4.0)  # mean 6 < base 10 -> no GDD
    phen = build_phenology(weather, factor=1.0)
    assert all(row[1] == 0.0 for row in phen)
    assert phen[-1][2] == "dormant"


# --- water balance clamping -----------------------------------------------

def test_depletion_clamps_to_taw_and_zero():
    kc = kc_curves()
    taw = 120.0
    # High ET, no rain: depletion climbs toward TAW but the FAO-56 Ks throttle keeps
    # it below the ceiling; it must never exceed TAW.
    weather = make_weather(60, tmax=30.0, tmin=18.0, et0=12.0, rain=0.0)
    phen = build_phenology(weather, factor=1.0)
    balance = compute_balance(weather, phen, kc, taw, {})
    assert max(b.depletion_mm for b in balance) <= taw
    assert balance[-1].depletion_fraction >= 0.9  # deep deficit, Ks-limited short of 1.0

    # Sustained soaking rain (past the 40 mm/day infiltration cap) drives depletion
    # to the zero floor; it must never go negative.
    for i in range(4):
        weather[-1 - i] = DailyWeather(
            date=weather[-1 - i].date, et0=5.0, rain=90.0, tmax=25.0, tmin=15.0
        )
    balance = compute_balance(weather, phen, kc, taw, {})
    assert balance[-1].depletion_mm == 0.0


# --- scoring: too_dry AND too_wet -----------------------------------------

def test_status_too_dry_and_too_wet():
    lo, hi = 0.35, 0.55
    dev_dry, status_dry = deviation_status(0.68, lo, hi)
    assert status_dry == "too_dry"
    assert dev_dry > 0

    dev_wet, status_wet = deviation_status(0.22, lo, hi)
    assert status_wet == "too_wet"
    assert dev_wet < 0

    dev_ok, status_ok = deviation_status(0.45, lo, hi)
    assert status_ok == "on_track"
    assert dev_ok == 0.0


def test_score_blend_and_traffic():
    # deviation 0.13 now, 0.13 in 7 days -> component 37.1 -> score 37 -> "watch".
    s = score_value(0.13, 0.13)
    assert s == 37
    assert traffic_for(s) == "watch"
    assert traffic_for(90) == "critical"
    assert traffic_for(10) == "stable"
    # Deviation is capped at full scale, so score saturates at 100.
    assert score_value(1.0, 1.0) == 100


# --- pour vs hold slip ----------------------------------------------------

def test_pour_slip_pour_and_hold():
    as_of = date(2026, 1, 20)
    lo, hi = 0.35, 0.55
    taw, rate = 120.0, 2.0
    # too_dry: D=82.1 -> mid=0.45 -> needed = 82.1 - 54 = 28.1 mm, runtime = 28.1/2 = 14.05 h.
    pour = build_pour_slip("too_dry", 82.1, taw, lo, hi, rate, as_of, None)
    assert pour["type"] == "pour"
    assert pour["needed_mm"] == 28.1
    # runtime uses the unrounded deficit (82.1 - 54.0)/2 = 14.05 -> 14.0 at 0.1 h.
    assert pour["runtime_hours"] == 14.0
    assert pour["hold_days"] is None

    hold = build_pour_slip("too_wet", 20.0, taw, lo, hi, rate, as_of, 4)
    assert hold["type"] == "hold"
    assert hold["needed_mm"] == 0.0
    assert hold["hold_days"] == 4


# --- battle plan skips rain blocks ----------------------------------------

def _eval_stub(block, depletion, stage, band, status, forecast):
    response = {
        "stage": stage,
        "status": status,
        "depletion_mm": depletion,
        "target_band": list(band),
    }
    return SimpleNamespace(block=block, response=response, forecast=forecast)


def test_battle_plan_skips_rain_and_too_wet():
    as_of = date(2026, 1, 20)
    dry_block = Block("B1", "Dry", "Cabernet Sauvignon", "premium_red", 2.8, 2.0, 120,
                      18.86, -33.93, {})
    rain_block = Block("B5", "Rainy", "Chenin Blanc", "white", 3.6, 2.4, 120,
                       18.86, -33.94, {})
    wet_block = Block("B3", "Wet", "Merlot", "red", 2.1, 2.2, 120, 18.87, -33.93, {})

    def fc(rain):
        return [
            {"date": (as_of + timedelta(days=i)).isoformat(), "et0": 6.0, "etc": 4.2,
             "rain": rain if i < 2 else 0.0, "depletion_fraction_projected": 0.7,
             "band_lo": 0.35, "band_hi": 0.55, "stage": "veraison"}
            for i in range(1, 15)
        ]

    evals = [
        _eval_stub(dry_block, 90.0, "veraison", (0.35, 0.55), "too_dry", fc(0.0)),
        _eval_stub(rain_block, 78.0, "veraison", (0.30, 0.50), "too_dry", fc(12.0)),
        _eval_stub(wet_block, 20.0, "veraison", (0.35, 0.55), "too_wet", fc(0.0)),
    ]
    plan = build_plan(evals, available_hours_per_day=6, horizon_days=3, as_of=as_of)

    skipped_ids = {s["block_id"] for s in plan["skipped"]}
    assert "B5" in skipped_ids   # rain closes the deficit
    assert "B3" in skipped_ids   # too wet
    scheduled = {e["block_id"] for day in plan["plan"] for e in day["entries"]}
    assert "B1" in scheduled     # dry block gets water
    assert "B5" not in scheduled


# --- season bank shortfall verdict ----------------------------------------

def test_season_bank_shortfall_and_sufficient():
    as_of = date(2026, 1, 20)
    provider = FixtureProvider()
    block = Block("B1", "Bosberg", "Cabernet Sauvignon", "premium_red", 3.0, 2.0, 120,
                  18.86, -33.93, {})
    forward = provider.get_daily(block.lat, block.lon, as_of + timedelta(days=1),
                                 as_of + timedelta(days=14))
    inputs = [{"block": block, "factor": 1.15, "cum_gdd": 1200.0,
               "harvest_onset": None, "forward": forward}]

    tight = compute_bank(inputs, remaining_m3=50.0, as_of=as_of, kc=kc_curves())
    assert tight["verdict"] == "shortfall"
    assert tight["run_dry_date"] is not None
    assert tight["days_short"] > 0

    ample = compute_bank(inputs, remaining_m3=1_000_000.0, as_of=as_of, kc=kc_curves())
    assert ample["verdict"] == "sufficient"
    assert ample["run_dry_date"] is None


def test_band_lookup_by_style():
    targets = stress_targets()
    assert band_for(targets, "fruit_set", "premium_red") == [0.45, 0.65]
    assert band_for(targets, "fruit_set", "fresh_white") == [0.25, 0.45]
