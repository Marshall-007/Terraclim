import io
import json

import pytest
from fastapi.testclient import TestClient
from PIL import Image
import numpy as np

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


@pytest.fixture
def clean_runtime_files():
    """Snapshot/restore the runtime stores a test may create so tests stay isolated."""
    from app import config
    from app.deps import provider_singleton
    photos_dir = DATA_DIR / "photos"
    paths = [DATA_DIR / "user_blocks.geojson", DATA_DIR / "settings.json",
             DATA_DIR / "validation_readings.json", photos_dir / "index.json"]
    saved = {p: (p.read_bytes() if p.exists() else None) for p in paths}
    photos_before = set(photos_dir.glob("*.jpg")) if photos_dir.exists() else set()
    try:
        yield
    finally:
        for p, data in saved.items():
            if data is None:
                p.unlink(missing_ok=True)
            else:
                p.write_bytes(data)
        if photos_dir.exists():
            for f in photos_dir.glob("*.jpg"):
                if f not in photos_before:
                    f.unlink(missing_ok=True)
        config.get_settings.cache_clear()
        provider_singleton.cache_clear()


def _make_test_jpeg(green=True, yellow=True) -> bytes:
    arr = np.zeros((64, 64, 3), dtype=np.uint8)
    arr[:, :] = [90, 70, 60]  # soil-ish background
    if green:
        arr[:, :32] = [45, 165, 55]   # healthy green canopy
    if yellow:
        arr[:, 32:] = [200, 200, 45]  # yellowing foliage
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, format="JPEG")
    return buf.getvalue()


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
    # Base four drivers are always present; ETa/NDVI channels add more when data exists.
    driver_keys = {d["key"] for d in body["drivers"]}
    assert {"et0_7d", "rain_7d", "tmax_7d", "forecast_rain_3d"} <= driver_keys
    assert len(body["drivers"]) >= 4
    # v2 additive fields.
    assert "mswp_estimate_mpa" in body and "mswp_band_mpa" in body


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


# --- v2: ETa/NDVI + MSWP on status ----------------------------------------

def test_status_carries_eta_ndvi_and_mswp():
    body = client.get("/api/blocks/B4/status").json()
    keys = {d["key"] for d in body["drivers"]}
    assert {"eta_7d", "ndvi", "transpiration_deficit_pct"} <= keys  # fixture supplies ETa/NDVI
    assert isinstance(body["mswp_estimate_mpa"], (int, float))
    assert body["mswp_estimate_mpa"] < 0  # water potential is negative
    lo, hi = body["mswp_band_mpa"]
    assert lo <= hi <= 0


def test_timeseries_includes_kc_and_eta():
    ts = client.get("/api/blocks/B1/timeseries?days=10").json()
    assert ts["history"]
    row = ts["history"][-1]
    assert "kc" in row and 0 < row["kc"] <= 1.0
    assert "eta" in row and "ndvi" in row
    assert "kc" in ts["forecast"][0]


# --- v2: information-limited backtest --------------------------------------

def test_backtest_information_limited_catches_seeded_event():
    body = client.get("/api/backtest", params={"months": 4}).json()
    assert body["methodology"] == "information_limited"
    spikes = [e for e in body["events"] if e["date"] == "2025-12-04"]
    assert spikes, "seeded 2025-12-04 heat spike must still be detected"
    ev = spikes[0]
    assert ev["type"] == "heat_spike"
    assert ev["lead_days"] > 0            # projected ahead of the event, not hindsight
    assert ev["blocks_flagged"]


# --- v2: user-traced blocks ------------------------------------------------

def test_user_block_create_score_delete(clean_runtime_files):
    geom = {"type": "Polygon", "coordinates": [[
        [18.860, -33.930], [18.8625, -33.9305], [18.8630, -33.9288],
        [18.8612, -33.9280], [18.860, -33.930]]]}
    r = client.post("/api/blocks", json={
        "name": "Trace Test", "variety": "Merlot", "wine_style": "red",
        "application_rate_mm_h": 2.0, "geometry": geom})
    assert r.status_code == 201
    created = r.json()
    uid = created["id"]
    assert uid.startswith("U")
    assert created["feature"]["properties"]["area_ha"] > 0

    # It appears in the collection and scores like any block.
    fc = client.get("/api/blocks").json()
    assert any(f["properties"]["id"] == uid for f in fc["features"])
    status = client.get(f"/api/blocks/{uid}/status").json()
    assert status["status"] in ("on_track", "too_dry", "too_wet")
    assert 0 <= status["score"] <= 100

    # Base blocks cannot be deleted; user blocks can.
    assert client.delete("/api/blocks/B1").status_code == 400
    assert client.delete(f"/api/blocks/{uid}").status_code == 200
    assert client.delete(f"/api/blocks/{uid}").status_code == 404


def test_create_block_rejects_bad_geometry(clean_runtime_files):
    bad = {"type": "Polygon", "coordinates": [[[18.86, -33.93], [18.86, -33.93]]]}
    r = client.post("/api/blocks", json={
        "name": "Bad", "variety": "Merlot", "wine_style": "red",
        "application_rate_mm_h": 2.0, "geometry": bad})
    assert r.status_code == 400


# --- v2: settings + provider switch ----------------------------------------

def test_settings_get_shape():
    body = client.get("/api/settings").json()
    for key in ("provider", "terraclim_ready", "token_status", "cache", "as_of", "datapack"):
        assert key in body
    assert body["token_status"] in ("unset",) or body["token_status"].startswith("set (")


def test_provider_switch_persists_and_masks_token(clean_runtime_files):
    secret = "TESTTOKEN9876"
    r = client.post("/api/settings/provider", json={"provider": "terraclim", "token": secret})
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["token_status"] == "set (••••9876)"
    assert secret not in json.dumps(body)  # raw token never echoed

    # Persisted, and GET still masks it.
    settings_body = client.get("/api/settings").json()
    assert settings_body["token_status"] == "set (••••9876)"
    assert secret not in json.dumps(settings_body)
    assert (DATA_DIR / "settings.json").exists()


def test_demo_date_override(clean_runtime_files):
    r = client.post("/api/settings/demo-date", json={"as_of": "2026-01-10"})
    assert r.status_code == 200
    assert r.json()["as_of"] == "2026-01-10"


# --- v2: validation ---------------------------------------------------------

def test_validation_reading_and_view(clean_runtime_files):
    r = client.post("/api/validation/reading",
                    json={"block_id": "B4", "date": "2026-01-15", "mswp_mpa": -1.3})
    assert r.status_code == 200
    body = r.json()
    assert body["model_mswp_mpa"] is not None
    assert body["delta_mpa"] is not None

    view = client.get("/api/validation/B4").json()
    assert view["model_series"]
    assert view["reference_source"] == "pending_datapack"
    assert view["reference_series"] == []
    assert view["agreement"]["n"] >= 1


# --- v2: field photos with GLI analysis ------------------------------------

def test_photo_upload_analysis_and_serve(clean_runtime_files):
    jpeg = _make_test_jpeg(green=True, yellow=True)
    r = client.post("/api/photos", data={"block_id": "B1"},
                    files={"image": ("canopy.jpg", jpeg, "image/jpeg")})
    assert r.status_code == 200
    body = r.json()
    a = body["analysis"]
    assert 0 <= a["canopy_cover_pct"] <= 100
    assert -1.0 <= a["gli_mean"] <= 1.0
    assert a["yellowing_pct"] > 0          # the yellow half is detected
    assert a["stress_hint"] in ("none", "mild", "visible")
    assert isinstance(a["agrees_with_model"], bool)

    pid = body["photo_id"]
    assert len(pid) == 32                  # server-generated uuid hex, not the filename

    listing = client.get("/api/photos/B1").json()
    assert any(p["photo_id"] == pid for p in listing)

    served = client.get(f"/api/photos/file/{pid}")
    assert served.status_code == 200
    assert served.headers["content-type"] == "image/jpeg"
    assert served.headers["x-content-type-options"] == "nosniff"


def test_photo_rejects_non_image(clean_runtime_files):
    r = client.post("/api/photos", data={"block_id": "B1"},
                    files={"image": ("evil.svg", b"<svg onload=alert(1)>", "image/svg+xml")})
    assert r.status_code == 400
