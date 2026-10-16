"""Process every registered protected site with REAL Sentinel-2 pixels.

For each site in the store: skip if a fresh real analysis exists for the same
windows, else run VRX-1 real analysis, store analysis + alert. Writes
data/processed_cache.json (committed) so fresh clones/seed carry results.

Usage: python3 scripts/process_all.py [--limit N] [--force]
Slow: ~2-3 min/site (COG reads). 49 sites ≈ 2h. Run in background.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "backend"))

import argparse

BASELINE = ("2024-11-01", "2025-02-28")
RECENT = ("2025-11-01", "2026-02-28")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--data", default=str(REPO / "data" / "demo.json"))
    args = ap.parse_args()

    from app import analysis as AN
    from app.store import JsonStore

    store = JsonStore(args.data)
    sites = store.list_sites()
    # only registry sites (skip manual leftovers? no — process all real sites)
    sites = [s for s in sites if s["id"].startswith("site-")]
    if args.limit:
        sites = sites[:args.limit]
    print(f"{len(sites)} sites to consider", flush=True)

    done = skipped = failed = 0
    for i, s in enumerate(sites):
        fresh = [a for a in store.list_analyses(5000)
                 if a.get("site_id") == s["id"] and (a.get("result") or {}).get("synthetic") is False]
        if fresh and not args.force:
            skipped += 1
            print(f"[{i+1}/{len(sites)}] skip {s['name']} (fresh {fresh[0]['id']})", flush=True)
            continue
        t0 = time.time()
        try:
            result = AN.run_analysis(s["geometry"], BASELINE[0], BASELINE[1],
                                     RECENT[0], RECENT[1], {"max_cloud": 60.0}, use_demo=False)
            import uuid
            aid = f"an-{uuid.uuid4().hex[:8]}"
            store.add_analysis({"id": aid, "site_id": s["id"], "geometry": s["geometry"],
                                "params": {"baseline": BASELINE, "recent": RECENT},
                                "status": "done", "algo": "vrx1-1.0.0", "demo": False,
                                "result": result})
            store.add_alert({"analysis_id": aid, "site_id": s["id"], "level": result["level"],
                             "total_ha": result.get("total_ha", 0),
                             "explanation": result.get("explanation", ""),
                             "provider": result.get("provider", ""), "synthetic": False})
            done += 1
            print(f"[{i+1}/{len(sites)}] {result['level']} {s['name']} "
                  f"{round(result.get('total_ha', 0), 1)}ha in {int(time.time()-t0)}s", flush=True)
        except Exception as e:
            failed += 1
            print(f"[{i+1}/{len(sites)}] FAIL {s['name']}: {str(e)[:160]}", flush=True)

    # committed cache so fresh clones carry processed results (real only;
    # synthetic demo/test runs stay local noise)
    d = json.loads(Path(args.data).read_text())
    real_an = [a for a in d.get("analyses", []) if (a.get("result") or {}).get("synthetic") is False]
    real_ids = {a["id"] for a in real_an}
    cache = {"analyses": real_an,
             "alerts": [al for al in d.get("alerts", []) if al.get("analysis_id") in real_ids],
             "reviews": d.get("reviews", []),
             "windows": {"baseline": list(BASELINE), "recent": list(RECENT)},
             "algo": "vrx1-1.0.0"}
    (REPO / "data" / "processed_cache.json").write_text(json.dumps(cache))
    print(f"done={done} skipped={skipped} failed={failed}; cache written ({len(cache['analyses'])} analyses)")


if __name__ == "__main__":
    main()
