"""Append newly processed sites to site snapshot without re-running everything.

For every store site missing from frontend/public/data/snapshot.json:
take its latest real analysis, build JPEG previews, upsert analysis/alert
entries. Run in background; ~2-3 min/site.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "backend"))

SNAP = REPO / "frontend" / "public" / "data" / "snapshot.json"


def clean(o):
    import math
    if isinstance(o, float) and (math.isnan(o) or math.isinf(o)):
        return None
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, list):
        return [clean(v) for v in o]
    return o


def main() -> None:
    from app import previews as PV
    store = json.loads((REPO / "data" / "demo.json").read_text())
    snap = json.loads(SNAP.read_text())
    have = {a["site_id"] for a in snap["analyses"]}
    todo = [s for s in store["sites"] if s["id"] not in have]
    print(f"{len(todo)} sites to append", flush=True)
    latest: dict[str, dict] = {}
    for a in store["analyses"]:
        r = a.get("result") or {}
        if r.get("synthetic") is False:
            latest[a.get("site_id", "")] = a
    n = 0
    for i, s in enumerate(todo):
        a = latest.get(s["id"])
        if not a:
            print(f"[{i+1}/{len(todo)}] SKIP {s['name']} (no real analysis)", flush=True)
            continue
        r = a["result"]
        aid = f"static-an-{s['id'].replace('site-', '')}"
        an = {"id": aid, "site_id": s["id"], "status": "done", "algo": "vrx1-1.0.0",
              "demo": False, "baseline": {"start": "2024-11-01", "end": "2025-02-28"},
              "recent": {"start": "2025-11-01", "end": "2026-02-28"},
              "params": {"max_cloud": 60.0}, "result": r}
        try:
            meta = PV.build({"geometry": s["geometry"], "result": r},
                            REPO / "frontend" / "public" / "data" / "previews" / aid,
                            photo_format="jpg")
            an["preview"] = {**meta, "dir": f"previews/{aid}"}
            print(f"[{i+1}/{len(todo)}] preview {aid}: {meta['width']}x{meta['height']}", flush=True)
        except Exception as e:
            an["preview"] = None
            print(f"[{i+1}/{len(todo)}] preview {aid} FAILED: {str(e)[:140]}", flush=True)
        snap["analyses"].append(an)
        snap["alerts"].append({"id": aid.replace("static-an-", "static-al-"),
                               "analysis_id": aid, "site_id": s["id"],
                               "level": r["level"], "total_ha": r.get("total_ha", 0),
                               "explanation": r.get("explanation", ""),
                               "provider": r.get("provider", ""),
                               "synthetic": False, "review_status": "UNVERIFIED"})
        if s not in snap["sites"]:
            snap["sites"].append(s)
        n += 1
        snap["generated_at"] = __import__("datetime").datetime.now(
            __import__("datetime").timezone.utc).isoformat()
        SNAP.write_text(json.dumps(clean(snap)))  # incremental save
    print(f"appended {n}; snapshot now {len(snap['sites'])} sites, {len(snap['alerts'])} alerts")


if __name__ == "__main__":
    main()
