import io

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.services import DATA_DIR

client = TestClient(app)

RESPONSE_KEYS = {"headline", "explanation", "facts", "caveats", "source", "subject_type"}


@pytest.fixture
def clean_photo_store():
    photos_dir = DATA_DIR / "photos"
    index = photos_dir / "index.json"
    saved = index.read_bytes() if index.exists() else None
    before = set(photos_dir.glob("*.jpg")) if photos_dir.exists() else set()
    yield
    if saved is None:
        index.unlink(missing_ok=True)
    else:
        index.write_bytes(saved)
    if photos_dir.exists():
        for f in photos_dir.glob("*.jpg"):
            if f not in before:
                f.unlink(missing_ok=True)


def _post(subject_type, **kw):
    return client.post("/api/insight", json={"subject_type": subject_type, **kw})


def _assert_valid(body, subject_type):
    assert RESPONSE_KEYS <= set(body)
    assert body["subject_type"] == subject_type
    assert body["source"] == "template"
    assert body["headline"].strip()
    # 2-4 sentences of grower language (allow a fourth/fifth for compound subjects).
    assert body["explanation"].count(". ") + 1 >= 2
    assert isinstance(body["facts"], list) and body["facts"]
    for f in body["facts"]:
        assert f["label"].strip() and str(f["value"]).strip()
    assert isinstance(body["caveats"], list)


SUBJECT_CASES = [
    ("block_status", {"block_id": "B4"}),
    ("block_status", {"block_id": "B1"}),
    ("score", {"block_id": "B4"}),
    ("score", {"block_id": "B1"}),
    ("driver", {"block_id": "B4", "subject_id": "et0_7d"}),
    ("driver", {"block_id": "B4", "subject_id": "eta_7d"}),
    ("driver", {"block_id": "B4", "subject_id": "ndvi"}),
    ("mswp", {"block_id": "B1"}),
    ("mswp", {"block_id": "B4"}),
    ("glide_path", {"block_id": "B4"}),
    ("glide_path", {"block_id": "B1"}),
    ("pour_slip", {"block_id": "B4"}),
    ("pour_slip", {"block_id": "B1"}),
    ("battle_plan_entry", {"subject_id": "B4"}),
    ("battle_plan_skip", {"subject_id": "B7"}),
    ("battle_plan_skip", {"subject_id": "B1"}),
    ("season_bank", {}),
    ("backtest_event", {"subject_id": "2025-12-04"}),
    ("scenario_delta", {"block_id": "B4", "context": {"type": "heatwave", "days": 7}}),
    ("photo_analysis", {"block_id": "B4"}),   # bundled demo photo
    ("term", {"subject_id": "NDVI"}),
]


@pytest.mark.parametrize("subject_type,payload", SUBJECT_CASES,
                         ids=[f"{s}-{p.get('block_id') or p.get('subject_id') or 'farm'}"
                              for s, p in SUBJECT_CASES])
def test_every_subject_type_answers_on_demo_seed(subject_type, payload):
    r = _post(subject_type, **payload)
    assert r.status_code == 200, r.text
    _assert_valid(r.json(), subject_type)


# --- facts must match the live engine, not restate stale numbers -------------

def _facts_text(body):
    return " | ".join(f"{f['label']}: {f['value']}" for f in body["facts"])


def test_block_status_facts_match_live_engine():
    status = client.get("/api/blocks/B4/status").json()
    body = _post("block_status", block_id="B4").json()
    text = _facts_text(body)
    assert f"{status['depletion_mm']:g} mm" in text
    assert f"{status['score']} / 100" in text
    lo, hi = status["target_band"]
    assert f"{round(lo * 100)}–{round(hi * 100)}%" in text
    assert status["stage"] in text


def test_driver_fact_matches_live_engine_value():
    status = client.get("/api/blocks/B4/status").json()
    eta = next(d for d in status["drivers"] if d["key"] == "eta_7d")
    body = _post("driver", block_id="B4", subject_id="eta_7d").json()
    assert f"{eta['value']} mm/day" in _facts_text(body)
    assert "mm/day" in body["headline"]


def test_mswp_facts_match_live_engine():
    status = client.get("/api/blocks/B1/status").json()
    body = _post("mswp", block_id="B1").json()
    text = _facts_text(body)
    assert f"{status['mswp_estimate_mpa']:g} MPa" in text
    lo, hi = status["mswp_band_mpa"]
    assert f"{lo:g}" in text and f"{hi:g}" in text


def test_pour_slip_facts_match_live_engine():
    status = client.get("/api/blocks/B4/status").json()
    slip = status["pour_slip"]
    body = _post("pour_slip", block_id="B4").json()
    text = _facts_text(body)
    assert f"{slip['needed_mm']:g} mm" in text
    assert f"{slip['runtime_hours']:g} h" in text
    assert slip["window"] in text


def test_hold_slip_explains_dilution_risk():
    status = client.get("/api/blocks/B1/status").json()
    assert status["pour_slip"]["type"] == "hold"
    body = _post("pour_slip", block_id="B1").json()
    assert "hold" in body["headline"].lower()
    assert "dilute" in body["explanation"].lower()
    assert f"{status['pour_slip']['hold_days']} days" in _facts_text(body)


def test_battle_plan_entry_matches_live_plan():
    plan = client.post("/api/battle-plan",
                       json={"available_hours_per_day": 6, "horizon_days": 3}).json()
    entry = plan["plan"][0]["entries"][0]
    assert entry["block_id"] == "B4"
    body = _post("battle_plan_entry", subject_id="B4",
                 context={"available_hours_per_day": 6, "horizon_days": 3,
                          "day": plan["plan"][0]["day"]}).json()
    text = _facts_text(body)
    assert f"{entry['hours']:g} h" in text
    assert f"{entry['mm_applied']:g} mm" in text
    assert entry["reason"] in text


def test_battle_plan_skip_explains_rain_math_for_b7():
    body = _post("battle_plan_skip", subject_id="B7").json()
    assert "rain" in body["explanation"].lower()
    text = _facts_text(body)
    assert "12 mm" in text        # the seeded 48-h rain cell
    assert "8 mm" in text         # the skip threshold


def test_battle_plan_skip_too_wet_for_b1():
    body = _post("battle_plan_skip", subject_id="B1").json()
    assert "wet" in body["headline"].lower() or "wet" in body["explanation"].lower()


def test_season_bank_facts_match_live_engine():
    bank = client.get("/api/season-bank", params={"remaining_m3": 12000}).json()
    body = _post("season_bank", context={"remaining_m3": 12000}).json()
    text = _facts_text(body)
    assert f"{bank['projected_demand_m3']:,} m³" in text
    assert bank["verdict"] in text
    assert bank["season_end"] in text


def test_backtest_event_facts_match_live_engine():
    events = client.get("/api/backtest", params={"months": 4}).json()["events"]
    ev = next(e for e in events if e["date"] == "2025-12-04")
    body = _post("backtest_event", subject_id="2025-12-04").json()
    text = _facts_text(body)
    assert f"{ev['lead_days']} days" in text
    assert ev["narrative"] in body["explanation"]
    assert "information-limited" in text


def test_scenario_delta_matches_live_scenario_endpoint():
    results = client.post("/api/scenario", json={"type": "heatwave", "days": 7}).json()
    b4 = next(r for r in results if r["block_id"] == "B4")
    body = _post("scenario_delta", block_id="B4",
                 context={"type": "heatwave", "days": 7}).json()
    assert f"{b4['delta']:+d} points" in _facts_text(body)


def test_photo_analysis_insight_from_uploaded_photo(clean_photo_store):
    arr = np.zeros((64, 64, 3), dtype=np.uint8)
    arr[:, :] = [90, 70, 60]
    arr[:, :40] = [45, 165, 55]
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, format="JPEG")
    up = client.post("/api/photos", data={"block_id": "B1"},
                     files={"image": ("canopy.jpg", buf.getvalue(), "image/jpeg")})
    assert up.status_code == 200
    uploaded = up.json()

    # By photo_id and by block (latest) must both resolve and agree with the stored analysis.
    for payload in ({"subject_id": uploaded["photo_id"]}, {"block_id": "B1"}):
        r = _post("photo_analysis", **payload)
        assert r.status_code == 200, r.text
        body = r.json()
        _assert_valid(body, "photo_analysis")
        text = _facts_text(body)
        assert f"{uploaded['analysis']['canopy_cover_pct']:g}%" in text
        assert uploaded["analysis"]["stress_hint"] in text
        assert "screening" in " ".join(body["caveats"]).lower()


def test_photo_analysis_no_photos_404():
    r = _post("photo_analysis", block_id="B5")
    assert r.status_code == 404
    assert "no photos" in r.json()["detail"]


# --- glossary + term ----------------------------------------------------------

def test_glossary_serves_at_least_twelve_grower_terms():
    r = client.get("/api/insight/glossary")
    assert r.status_code == 200
    terms = r.json()["terms"]
    assert len(terms) >= 12
    names = " ".join(t["term"] for t in terms)
    for expected in ("ET0", "ETa", "Kc", "Ks", "NDVI", "GDD", "MSWP", "RDI", "TAW",
                     "Depletion", "glide path", "Zonal", "Effective rainfall"):
        assert expected.lower() in names.lower()
    for t in terms:
        assert t["definition"].strip() and t["term"].strip()


def test_term_lookup_by_alias_and_case():
    for query in ("pressure bomb", "MSWP", "mpa"):
        body = _post("term", subject_id=query).json()
        assert "stem water potential" in body["headline"].lower()
    body = _post("term", subject_id="glide path").json()
    assert "flight plan" in body["explanation"]


def test_unknown_term_404_lists_known_terms():
    r = _post("term", subject_id="flux capacitor")
    assert r.status_code == 404
    assert "NDVI" in r.json()["detail"]


# --- validation errors --------------------------------------------------------

def test_unknown_subject_type_422_lists_valid_types():
    r = _post("wibble", block_id="B4")
    assert r.status_code == 422
    detail = r.json()["detail"]
    for st in ("block_status", "driver", "season_bank", "term"):
        assert st in detail


def test_unknown_block_404():
    assert _post("block_status", block_id="ZZ").status_code == 404
    assert _post("battle_plan_skip", subject_id="ZZ").status_code == 404


def test_block_scoped_without_block_id_422():
    r = _post("block_status")
    assert r.status_code == 422
    assert "block_id" in r.json()["detail"]


def test_unknown_driver_key_404_lists_available():
    r = _post("driver", block_id="B4", subject_id="moon_phase")
    assert r.status_code == 404
    assert "et0_7d" in r.json()["detail"]


def test_unknown_backtest_event_404():
    r = _post("backtest_event", subject_id="1999-01-01")
    assert r.status_code == 404


def test_bad_scenario_type_422():
    r = _post("scenario_delta", block_id="B4", context={"type": "locusts"})
    assert r.status_code == 422


# --- AI layer: optional, silent fallback ---------------------------------------

@pytest.fixture
def ai_key_set(monkeypatch):
    from app import config
    monkeypatch.setenv("AI_KEY", "test-key")
    config.get_settings.cache_clear()
    yield
    config.get_settings.cache_clear()


def test_no_ai_key_source_is_template():
    body = _post("block_status", block_id="B4").json()
    assert body["source"] == "template"


def test_ai_failure_silently_falls_back_to_template(ai_key_set, monkeypatch):
    from app.engine import ai_rephrase

    def boom(*args, **kwargs):
        raise RuntimeError("provider unreachable")

    monkeypatch.setattr(ai_rephrase.httpx, "post", boom)
    r = _post("block_status", block_id="B4")
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "template"
    _assert_valid(body, "block_status")


def test_ai_success_rephrases_without_touching_facts(ai_key_set, monkeypatch):
    from app.engine import ai_rephrase

    rephrased = "The vines are thirsty and tonight is the night to water them properly."

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {"choices": [{"message": {"content": rephrased}}]}

    # Capture the deterministic template via a failing AI call first.
    def boom(*args, **kwargs):
        raise RuntimeError("provider unreachable")

    monkeypatch.setattr(ai_rephrase.httpx, "post", boom)
    template = _post("block_status", block_id="B4").json()
    assert template["source"] == "template"

    # With the fake succeeding, source flips to ai and ONLY the explanation changes.
    monkeypatch.setattr(ai_rephrase.httpx, "post", lambda *a, **k: FakeResponse())
    body = _post("block_status", block_id="B4").json()
    assert body["source"] == "ai"
    assert body["explanation"] == rephrased
    assert body["facts"] == template["facts"]
    assert body["headline"] == template["headline"]
    assert body["caveats"] == template["caveats"]


def test_ai_reply_with_invented_numbers_is_discarded(ai_key_set, monkeypatch):
    from app.engine import ai_rephrase

    class FakeResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {"choices": [{"message": {"content": "Apply exactly 999 mm right now."}}]}

    monkeypatch.setattr(ai_rephrase.httpx, "post", lambda *a, **k: FakeResponse())
    body = _post("block_status", block_id="B4").json()
    assert body["source"] == "template"
    assert "999" not in body["explanation"]


def test_explain_wrapper_still_serves_template_narrative():
    r = client.get("/api/explain/B4")
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "template"
    assert "Windberg Pinotage" in body["narrative"]
    assert client.get("/api/explain/ZZ").status_code == 404
