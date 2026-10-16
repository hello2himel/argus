"""Export precalculated snapshot for the Netlify static viewer.

Runs offline VRX-1 DEMO math (synthetic, clearly labeled) for each seed site in
data/demo.json and writes site/data/snapshot.json. The static site reads ONLY
this file — no backend, no API keys, no runtime analysis.

Usage:
    python3 scripts/export_static.py [--data data/demo.json] [--out site/data/snapshot.json]

Regenerate before each static deploy so the viewer shows fresh previous results.
Real-scene metadata (STAC lists) can be merged later; demo math stays synthetic.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "backend"))

from app import analysis as AN  # noqa: E402

BASELINE = ("2024-11-01", "2025-02-28")
RECENT = ("2025-11-01", "2026-02-28")

# Per-site demo seeds so each card shows a different outcome (still synthetic).
SITE_PARAMS = {
    "site-lawachara-demo": {"seed": 7, "sensitivity": "medium"},
    "site-chunati-demo": {"seed": 21, "sensitivity": "medium"},
    "site-turag-demo": {"seed": 42, "sensitivity": "medium"},
}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=str(REPO / "data" / "demo.json"))
    ap.add_argument("--out", default=str(REPO / "site" / "data" / "snapshot.json"))
    args = ap.parse_args()

    store = json.loads(Path(args.data).read_text())
    sites = store.get("sites", [])
    if not sites:
        raise SystemExit(f"no sites in {args.data}; run python3 scripts/seed.py first")

    analyses, alerts = [], []
    for i, s in enumerate(sites):
        params = {"max_cloud": 30.0, **SITE_PARAMS.get(s["id"], {"seed": 7 + i})}
        result = AN.run_analysis(
            s["geometry"], BASELINE[0], BASELINE[1], RECENT[0], RECENT[1],
            params, use_demo=True,
        )
        aid = f"static-an-{s['id'].replace('site-', '')}"
        analyses.append({
            "id": aid, "site_id": s["id"], "status": "done",
            "algo": "vrx1-1.0.0", "demo": True,
            "baseline": {"start": BASELINE[0], "end": BASELINE[1]},
            "recent": {"start": RECENT[0], "end": RECENT[1]},
            "params": params, "result": result,
        })
        alerts.append({
            "id": f"static-al-{s['id'].replace('site-', '')}",
            "analysis_id": aid, "site_id": s["id"],
            "level": result["level"], "total_ha": result.get("total_ha", 0),
            "explanation": result.get("explanation", ""),
            "provider": result.get("provider", ""),
            "synthetic": True, "review_status": "UNVERIFIED",
        })

    snapshot = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "algo": "vrx1-1.0.0",
        "synthetic": True,
        "note": ("Precalculated DEMO snapshot — synthetic math, not satellite truth. "
                 "For live analysis run the full stack (see README)."),
        "baseline": {"start": BASELINE[0], "end": BASELINE[1]},
        "recent": {"start": RECENT[0], "end": RECENT[1]},
        "sites": sites,
        "analyses": analyses,
        "alerts": alerts,
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(snapshot, indent=2))
    print(f"wrote {out} ({len(sites)} sites, {len(alerts)} alerts)")


if __name__ == "__main__":
    main()
