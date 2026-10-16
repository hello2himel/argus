"""API + geo validation tests (no network)."""
import os
os.environ["ARGUS_DATA"] = "/tmp/opencode/argus-test-demo.json"
for p in ("/tmp/opencode/argus-test-demo.json",):
    try:
        import pathlib; pathlib.Path(p).unlink(missing_ok=True)
    except Exception:
        pass

from fastapi.testclient import TestClient
from app.main import app
from app import geo as G
import pytest

client = TestClient(app)


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["ok"] is True


def test_coord_validation():
    with pytest.raises(ValueError):
        G.validate_lon_lat(200, 0)
    with pytest.raises(ValueError):
        G.validate_lon_lat(0, -100)
    assert G.validate_lon_lat(90.35, 23.83) == (90.35, 23.83)


def test_site_crud_and_demo_analysis():
    s = client.post("/api/sites", json={
        "name": "Test Lawachara Edge",
        "category": "national_park",
        "geometry": {"type": "Polygon", "coordinates": [[[91.76, 24.30], [91.81, 24.30], [91.81, 24.34], [91.76, 24.34], [91.76, 24.30]]]},
        "boundary_source": "synthetic demo — not legal"}).json()
    assert "id" in s
    a = client.post("/api/analysis?demo=true", json={"site_id": s["id"]}).json()
    assert a["level"] in ("GREEN", "AMBER", "RED", "GRAY")
    assert a["result"]["synthetic"] is True
    al = client.get(f"/api/alerts/{a['alert_id']}").json()
    assert al["id"] == a["alert_id"]
    r = client.patch(f"/api/alerts/{a['alert_id']}/review",
                     json={"status": "UNDER_REVIEW", "note": "test"}).json()
    assert r["review_status"] == "UNDER_REVIEW"


def test_manual_lonlat_analysis_demo():
    a = client.post("/api/analysis?demo=true",
                    json={"lon": 90.345, "lat": 23.83, "radius_m": 1500}).json()
    assert "analysis_id" in a


def test_invalid_review_rejected():
    s = client.post("/api/sites", json={
        "name": "TestX", "geometry": {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]}}).json()
    a = client.post("/api/analysis?demo=true", json={"site_id": s["id"]}).json()
    r = client.patch(f"/api/alerts/{a['alert_id']}/review", json={"status": "GUILTY"})
    assert r.status_code == 422


def test_review_transitions_and_note_required():
    s = client.post("/api/sites", json={
        "name": "TransitionTest", "geometry": {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]}}).json()
    a = client.post("/api/analysis?demo=true", json={"site_id": s["id"]}).json()
    aid = a["alert_id"]
    # illegal jump UNVERIFIED -> DISMISSED
    r = client.patch(f"/api/alerts/{aid}/review", json={"status": "DISMISSED", "note": "skip"})
    assert r.status_code == 422
    # missing note
    r = client.patch(f"/api/alerts/{aid}/review", json={"status": "UNDER_REVIEW", "note": ""})
    assert r.status_code == 422
    # legal step + history recorded
    r = client.patch(f"/api/alerts/{aid}/review", json={"status": "UNDER_REVIEW", "note": "checking"})
    assert r.status_code == 200
    h = client.get(f"/api/alerts/{aid}/history").json()
    assert len(h["events"]) >= 1 and h["events"][-1]["note"] == "checking"
    t = client.get("/api/thresholds").json()
    assert "by_site_type" in t and "defaults" in t
