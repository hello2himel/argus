"""Seed clearly-labeled DEMO sites (NOT legal cadastre). Idempotent."""
import json, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "demo.json"

def box(lon, lat, d):
    return {"type": "Polygon", "coordinates": [[[lon-d, lat-d],[lon+d, lat-d],[lon+d, lat+d],[lon-d, lat+d],[lon-d, lat-d]]]}

SITES = [
  {"id": "site-lawachara-demo", "name": "Lawachara NP Edge (forest demo)", "category": "national_park",
   "geometry": box(91.784, 24.32, 0.03), "boundary_source": "synthetic demo — not legal",
   "legal_reference": "", "priority": "high", "notes": "Demo box 24.30-24.34N 91.76-91.81E. NOT a Forest Dept boundary."},
  {"id": "site-chunati-demo", "name": "Chunati WS Corridor (forest demo)", "category": "wildlife_sanctuary",
   "geometry": box(92.03, 21.97, 0.05), "boundary_source": "synthetic demo — not legal",
   "legal_reference": "", "priority": "medium", "notes": "Elephant corridor mosaic — good for false-positive tuning."},
  {"id": "site-turag-demo", "name": "Turag River Buffer Ashulia (river demo)", "category": "river_buffer",
   "geometry": box(90.345, 23.83, 0.04), "boundary_source": "synthetic demo — not legal",
   "legal_reference": "Writ 3503/2009 context; CS/RS + BIWTA foreshore map required for legal use",
   "priority": "high", "notes": "Foreshore/earth-filling demo. Waterline != legal boundary."},
]

def main():
    DATA.parent.mkdir(parents=True, exist_ok=True)
    d = {"sites": [], "analyses": [], "alerts": [], "reviews": []}
    if DATA.exists():
        d = json.loads(DATA.read_text())
    ids = {s["id"] for s in d["sites"]}
    for s in SITES:
        if s["id"] not in ids:
            d["sites"].append(s)
    DATA.write_text(json.dumps(d, indent=2))
    print(f"seeded {len(SITES)} demo sites -> {DATA}")

if __name__ == "__main__":
    main()
