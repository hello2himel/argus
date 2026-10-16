"""Project Argus API — FastAPI. VRX-1 brain served over REST."""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .store import get_store, db_kind
from . import geo as G
from . import analysis as AN
from .providers.planetary import PlanetaryProvider
from .providers.demo import DemoProvider

ALGO_VERSION = "vrx1-1.0.0"
VALID_REVIEW = {"UNVERIFIED", "UNDER_REVIEW", "CONFIRMED_DISTURBANCE", "DISMISSED", "REQUIRES_FIELD_INSPECTION"}
# Allowed human review transitions (reference UI pattern: review is a
# state machine, not free jumps; every change needs a note for the audit trail).
REVIEW_TRANSITIONS = {
    "UNVERIFIED": ["UNDER_REVIEW"],
    "UNDER_REVIEW": ["CONFIRMED_DISTURBANCE", "DISMISSED", "REQUIRES_FIELD_INSPECTION"],
    "REQUIRES_FIELD_INSPECTION": ["UNDER_REVIEW", "CONFIRMED_DISTURBANCE", "DISMISSED"],
    "CONFIRMED_DISTURBANCE": ["UNDER_REVIEW"],
    "DISMISSED": ["UNDER_REVIEW"],
}

# Starting detection thresholds by site type (tune against reviewed examples).
THRESHOLD_TABLE = [
    {"site_type": "Forest and national park", "ndvi_drop": 0.20, "min_patch_ha": 0.5, "min_scenes": 2, "max_cloud": 20},
    {"site_type": "Wetland and haor", "ndvi_drop": 0.15, "min_patch_ha": 1.0, "min_scenes": 2, "max_cloud": 25},
    {"site_type": "River protection zone", "ndvi_drop": 0.15, "min_patch_ha": 0.3, "min_scenes": 2, "max_cloud": 25},
]

app = FastAPI(title="Project Argus", version="1.0.0",
              description="Satellite-based protected-land change screening for Bangladesh. Brain: VRX-1.")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

try:  # preview PNG cache (before/after/overlay); absent dir is fine
    from fastapi.staticfiles import StaticFiles
    from pathlib import Path as _P
    _PV = _P(__file__).resolve().parents[2] / "data" / "previews"
    _PV.mkdir(parents=True, exist_ok=True)
    app.mount("/previews", StaticFiles(directory=str(_PV)), name="previews")
except Exception:
    pass


# ---------- schemas ----------
class SiteIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    category: str = "protected"
    geometry: dict
    boundary_source: str = "manual-demo (NOT legal cadastre)"
    legal_reference: str = ""
    buffer_m: float = 0
    priority: str = "medium"
    notes: str = ""


class AnalysisIn(BaseModel):
    site_id: str | None = None
    geometry: dict | None = None
    lon: float | None = None
    lat: float | None = None
    radius_m: float = 1000
    baseline_start: str = "2024-11-01"
    baseline_end: str = "2025-02-28"
    recent_start: str = "2025-11-01"
    recent_end: str = "2026-02-28"
    max_cloud: float = 30.0
    min_change_m2: float = 5000
    sensitivity: str = "medium"


class ReviewIn(BaseModel):
    status: str
    note: str = ""


def _geom_from_analysis(a: AnalysisIn) -> dict:
    if a.geometry:
        return G.validate_geojson_polygon(a.geometry)
    if a.site_id:
        s = get_store().get_site(a.site_id)
        if not s:
            raise HTTPException(404, "site not found")
        return s["geometry"]
    if a.lon is not None and a.lat is not None:
        lo, la = G.validate_lon_lat(a.lon, a.lat)
        return G.buffer_point(lo, la, a.radius_m)
    raise HTTPException(422, "provide geometry, site_id, or lon+lat")


# ---------- routes ----------
@app.get("/api/health")
def health():
    return {"ok": True, "service": "argus-api", "algo": ALGO_VERSION,
            "db": db_kind(), "time": datetime.now(timezone.utc).isoformat()}


@app.get("/api/data-sources/status")
def data_sources():
    pc = PlanetaryProvider().status()
    demo = DemoProvider().status()
    return {"sources": [pc, demo], "primary": "planetary-computer (Sentinel-2 L2A)",
            "note": "STAC search needs no key; blob reads auto-SAS. Demo provider is synthetic."}


@app.get("/api/sites")
def list_sites():
    return {"sites": get_store().list_sites()}


@app.post("/api/sites", status_code=201)
def create_site(body: SiteIn):
    geom = G.validate_geojson_polygon(body.geometry)
    return get_store().add_site({
        "name": body.name, "category": body.category, "geometry": geom,
        "boundary_source": body.boundary_source, "legal_reference": body.legal_reference,
        "buffer_m": body.buffer_m, "priority": body.priority, "notes": body.notes,
        "verification": "UNVERIFIED-DEMO" if "demo" in body.boundary_source.lower() else "UNVERIFIED",
    })


@app.get("/api/sites/{sid}")
def get_site(sid: str):
    s = get_store().get_site(sid)
    if not s:
        raise HTTPException(404, "site not found")
    return s


@app.delete("/api/sites/{sid}")
def delete_site(sid: str):
    if not get_store().delete_site(sid):
        raise HTTPException(404, "site not found")
    return {"deleted": sid}


@app.get("/api/map/monitoring-sites")
def map_sites():
    feats = [{"type": "Feature", "properties": {"id": s["id"], "name": s.get("name")},
              "geometry": s["geometry"]} for s in get_store().list_sites()]
    return {"type": "FeatureCollection", "features": feats}


@app.post("/api/analysis", status_code=202)
def start_analysis(body: AnalysisIn, demo: bool = Query(False)):
    geom = _geom_from_analysis(body)
    aid = f"an-{uuid.uuid4().hex[:8]}"
    store = get_store()
    rec = store.add_analysis({"id": aid, "site_id": body.site_id, "geometry": geom,
                              "params": body.model_dump(), "status": "running",
                              "algo": ALGO_VERSION, "demo": demo})
    try:
        result = AN.run_analysis(
            geom, body.baseline_start, body.baseline_end,
            body.recent_start, body.recent_end,
            {"max_cloud": body.max_cloud, "min_change_m2": body.min_change_m2,
             "sensitivity": body.sensitivity}, use_demo=demo)
    except ValueError as e:
        store.update_analysis(aid, {"status": "failed", "error": str(e)})
        raise HTTPException(422, str(e))
    store.update_analysis(aid, {"status": "done", "result": result})
    # auto-create alert record for AMBER/RED (and keep GRAY/GREEN traceable)
    alert = store.add_alert({"analysis_id": aid, "site_id": body.site_id,
                             "level": result["level"], "total_ha": result.get("total_ha", 0),
                             "explanation": result.get("explanation", ""),
                             "provider": result.get("provider", ""),
                             "synthetic": result.get("synthetic", False),
                             "geometry": geom})
    return {"analysis_id": aid, "status": "done", "level": result["level"],
            "alert_id": alert["id"], "result": result}


@app.get("/api/analysis/{aid}")
def get_analysis(aid: str):
    a = get_store().get_analysis(aid)
    if not a:
        raise HTTPException(404, "analysis not found")
    return a


@app.get("/api/analysis/{aid}/results")
def analysis_results(aid: str):
    a = get_store().get_analysis(aid)
    if not a:
        raise HTTPException(404, "analysis not found")
    return {"analysis_id": aid, "result": a.get("result")}


@app.get("/api/analysis/{aid}/preview")
def analysis_preview(aid: str):
    """Real before/after + change-overlay PNGs (cached). 422 for synthetic demos."""
    from pathlib import Path
    a = get_store().get_analysis(aid)
    if not a:
        raise HTTPException(404, "analysis not found")
    if (a.get("result") or {}).get("synthetic"):
        raise HTTPException(422, "synthetic demo analysis has no satellite preview; see written data")
    from . import previews as PV
    out_dir = Path(__file__).resolve().parents[2] / "data" / "previews" / aid
    if not ((out_dir / "before.png").exists() and (out_dir / "after.png").exists()
            and (out_dir / "overlay.png").exists()):
        try:
            meta = PV.build(a, out_dir)
        except ValueError as e:
            raise HTTPException(422, str(e))
        except Exception as e:
            raise HTTPException(502, f"preview render failed: {str(e)[:300]}")
    else:
        from PIL import Image
        im = Image.open(out_dir / "before.png")
        meta = {"before": "before.png", "after": "after.png", "overlay": "overlay.png",
                "width": im.width, "height": im.height}
    base = f"/previews/{aid}"
    meta.update({"before_url": f"{base}/before.png", "after_url": f"{base}/after.png",
                 "overlay_url": f"{base}/overlay.png"})
    return meta


@app.get("/api/alerts")
def list_alerts(level: str | None = None, site_id: str | None = None):
    als = get_store().list_alerts()
    if level:
        als = [a for a in als if a.get("level") == level.upper()]
    if site_id:
        als = [a for a in als if a.get("site_id") == site_id]
    return {"alerts": als}


@app.get("/api/alerts/{aid}")
def get_alert(aid: str):
    a = get_store().get_alert(aid)
    if not a:
        raise HTTPException(404, "alert not found")
    return a


@app.patch("/api/alerts/{aid}/review")
def review_alert(aid: str, body: ReviewIn):
    st = body.status.upper()
    if st not in VALID_REVIEW:
        raise HTTPException(422, f"status must be one of {sorted(VALID_REVIEW)}")
    if not body.note or not body.note.strip():
        raise HTTPException(422, "a reviewer note is required with every status change")
    cur = get_store().get_alert(aid)
    if not cur:
        raise HTTPException(404, "alert not found")
    allowed = REVIEW_TRANSITIONS.get(cur.get("review_status", "UNVERIFIED"), [])
    if st != cur.get("review_status") and st not in allowed:
        raise HTTPException(422, f"transition {cur.get('review_status')} -> {st} not allowed; allowed: {allowed}")
    a = get_store().review_alert(aid, st, body.note.strip())
    return a


@app.get("/api/alerts/{aid}/history")
def alert_history(aid: str):
    if not get_store().get_alert(aid):
        raise HTTPException(404, "alert not found")
    d = get_store()._read()
    return {"alert_id": aid,
            "events": [r for r in d.get("reviews", []) if r.get("alert_id") == aid]}


@app.get("/api/thresholds")
def thresholds():
    from .vrx1 import change as CH
    return {"algo": ALGO_VERSION, "defaults": dict(CH.DEFAULTS),
            "by_site_type": THRESHOLD_TABLE,
            "note": "Starting values. Tune against reviewed examples before relying on them. No illegality probability is calculated."}


@app.get("/api/analysis-history")
def history(limit: int = 50):
    return {"analyses": get_store().list_analyses(limit)}
