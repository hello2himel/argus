"""Seed the store: BD protected-site registry + Turag river demo + processed cache.

Idempotent. Registry (data/protected_sites_bd.json) is authoritative for sites;
old synthetic demo polygons are retired. Processed real results
(data/processed_cache.json, committed) preload analyses/alerts so fresh
clones show cached data without reprocessing.
"""
import json, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "demo.json"
REG = ROOT / "data" / "protected_sites_bd.json"
CACHE = ROOT / "data" / "processed_cache.json"

def box(lon, lat, d):
    return {"type": "Polygon", "coordinates": [[[lon-d, lat-d],[lon+d, lat-d],[lon+d, lat+d],[lon-d, lat+d],[lon-d, lat-d]]]}

TURAG = {"id": "site-turag-demo", "name": "Turag River Buffer Ashulia (river demo)", "category": "river_buffer",
   "geometry": box(90.345, 23.83, 0.04), "boundary_source": "synthetic demo — not legal",
   "legal_reference": "Writ 3503/2009 context; CS/RS + BIWTA foreshore map required for legal use",
   "priority": "high", "notes": "Foreshore/earth-filling demo. Waterline != legal boundary."}

RETIRED = {"site-lawachara-demo", "site-chunati-demo"}  # superseded by real polygons


def main():
    DATA.parent.mkdir(parents=True, exist_ok=True)
    d = {"sites": [], "analyses": [], "alerts": [], "reviews": []}
    if DATA.exists():
        d = json.loads(DATA.read_text())
    d["sites"] = [s for s in d["sites"] if s["id"] not in RETIRED]
    ids = {s["id"] for s in d["sites"]}
    n = 0
    if REG.exists():
        for s in json.loads(REG.read_text())["sites"]:
            if s["id"] not in ids:
                d["sites"].append(s)
                ids.add(s["id"])
                n += 1
    if TURAG["id"] not in ids:
        d["sites"].append(TURAG)
        n += 1
    m = 0
    if CACHE.exists() and not d.get("analyses"):
        c = json.loads(CACHE.read_text())
        d["analyses"] = c.get("analyses", [])
        d["alerts"] = c.get("alerts", [])
        d["reviews"] = c.get("reviews", [])
        m = len(d["analyses"])
    DATA.write_text(json.dumps(d, indent=2))
    print(f"seeded {n} sites ({len(d['sites'])} total), preloaded {m} cached analyses -> {DATA}")


if __name__ == "__main__":
    main()
