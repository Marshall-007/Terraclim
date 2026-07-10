import json

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import DATA_DIR

client = TestClient(app)


@pytest.fixture
def clean_irrigation_log():
    path = DATA_DIR / "irrigation_log.json"
    original = path.read_text()
    try:
        yield path
    finally:
        path.write_text(original)


def test_health_no_token_required():
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert isinstance(body["provider"], str)
    assert body["as_of"] == "2026-01-20"


def test_blocks_returns_seven_real_polygons():
    r = client.get("/api/blocks")
    assert r.status_code == 200
    fc = r.json()
    assert fc["type"] == "FeatureCollection"
    assert len(fc["features"]) == 7
    for feat in fc["features"]:
        ring = feat["geometry"]["coordinates"][0]
        assert len(ring) >= 4
        assert ring[0] == ring[-1]  # closed ring for point-in-polygon
        assert {"id", "name", "variety", "wine_style", "area_ha",
                "application_rate_mm_h", "taw_mm"} <= feat["properties"].keys()


def test_block_status_schema():
    r = client.get("/api/blocks/B1/status")
    assert r.status_code == 200
    body = r.json()
    for key in ("block_id", "stage", "gdd", "depletion_mm", "depletion_fraction",
                "target_band", "status", "deviation", "score", "traffic",
                "drivers", "recommendation", "pour_slip"):
        assert key in body
    assert body["status"] in ("on_track", "too_dry", "too_wet")
    assert body["traffic"] in ("stable", "watch", "high", "critical")
    assert 0 <= body["score"] <= 100
    assert len(body["drivers"]) == 4


def test_unknown_block_404():
    assert client.get("/api/blocks/ZZ/status").status_code == 404


def test_battle_plan():
    r = client.post("/api/battle-plan", json={"available_hours_per_day": 6, "horizon_days": 3})
    assert r.status_code == 200
    body = r.json()
    assert len(body["plan"]) == 3
    assert "skipped" in body
    assert "water saved" in body["summary"]


def test_season_bank():
    r = client.get("/api/season-bank", params={"remaining_m3": 8000})
    assert r.status_code == 200
    body = r.json()
    assert body["verdict"] in ("sufficient", "shortfall")
    assert isinstance(body["burn_down"], list) and body["burn_down"]
    assert body["projected_demand_m3"] >= 0


def test_backtest_window_and_series():
    r = client.get("/api/backtest", params={"months": 4})
    assert r.status_code == 200
    body = r.json()
    assert len(body["window"]) == 2
    assert body["window"][1] == "2026-01-20"
    assert isinstance(body["series"], list) and body["series"]
    for ev in body["events"]:
        assert ev["type"] == "heat_spike"


def test_briefing_sorted_by_score():
    r = client.get("/api/briefing")
    assert r.status_code == 200
    body = r.json()
    scores = [b["score"] for b in body["blocks"]]
    assert scores == sorted(scores, reverse=True)
    assert "farm_summary" in body


def test_scenario_heatwave_returns_deltas():
    r = client.post("/api/scenario", json={"type": "heatwave", "days": 7})
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 7
    assert all("delta" in item for item in body)


def test_irrigation_log_forces_too_wet(clean_irrigation_log):
    # A large irrigation drives the block's depletion to the floor -> too wet.
    r = client.post("/api/irrigation", json={"block_id": "B6", "date": "2026-01-20", "mm": 300})
    assert r.status_code == 200
    assert r.json() == {"ok": True}

    status = client.get("/api/blocks/B6/status").json()
    assert status["depletion_fraction"] == 0.0
    assert status["status"] == "too_wet"
    assert status["pour_slip"]["type"] == "hold"
    assert status["pour_slip"]["hold_days"] is not None


def test_explain_never_fails_without_ai_key():
    r = client.get("/api/explain/B1")
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "template"
    assert len(body["narrative"]) > 0
