# Protected-site registry (Bangladesh)

`data/protected_sites_bd.json` — 49 sites, built by `scripts/build_registry.py`.

## What it covers

- All **19 national parks** (gazette names, declaration dates, areas from Wikipedia).
- **20 wildlife sanctuaries** (Sundarbans East/West/South, Teknaf, Chunati, Tengragiri, Sonarchar, Sangu, Hazarikhil, Fasiakhali, Dudpukuria-Dhopachari, Char Kukri-Mukri, Chadpai, Dudmukhi, Dhangmari, Rema-Kalenga, Pablakhali, Baishari Bangdepa, Padma Bridge, Hail Haor).
- 5 eco-parks, 2 safari parks, National Botanical Garden, Sundarbans Reserved Forest, Tanguar Haor (Ramsar).

## Boundary provenance (honest, per site)

| `verification` | Meaning |
|---|---|
| `OSM-REFERENCE` (41) | Real community-mapped polygon from OpenStreetMap (ODbL) via Overpass. Shape is genuinely the mapped park — but it is **not** a Forest Department legal cadastre. |
| `POINT-BUFFER` (8) | No open polygon exists (Kaptai, Dharmapur, Rema-Kalenga, Pablakhali, Baishari, Padma Bridge, Hail Haor, Tanguar Haor). Circle around published coordinates. Screening only. |

Excluded deliberately: dolphin sanctuaries + marine reserves (open water — NDVI is meaningless, they would be pure GRAY noise), Indian-side features that overlap the bbox, and obvious OSM noise.

## Rebuilding

```bash
# needs /tmp/bd_pa.json (Overpass export); then:
python3 scripts/build_registry.py
python3 scripts/seed.py            # idempotent import into the store
python3 scripts/process_all.py     # real VRX-1 run per site (~20-30 s each)
python3 scripts/export_static.py --real   # Netlify snapshot + JPEG previews
```
