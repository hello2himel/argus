# Project Argus — satellite screening for protected land (Bangladesh). Brain: VRX-1.

Argus compares historical vs recent Sentinel-2 observations over registered polygons (or manual GPS + radius), computes vegetation/soil/built/water change signals, intersects them with monitoring boundaries, and emits evidence-backed **GREEN / AMBER / RED / GRAY** alerts for human review. It never declares anyone "illegal" — it screens large areas and directs field inspection.

## Quickstart (any machine)

**Option A — Docker (full stack, needs Docker + Compose plugin):**
```bash
cp .env.example .env   # edit POSTGRES_PASSWORD
docker compose up --build
# frontend http://localhost:3000 · API http://localhost:8000/api/health · docs http://localhost:8000/docs
python scripts/seed.py  # optional: seeds 3 demo sites into ./data/demo.json
```

**Option B — local, no Docker (works everywhere):**
```bash
# backend
cd backend
pip install -r requirements.min.txt   # light; full: requirements.txt (needs GDAL)
ARGUS_DATA=../data/demo.json DEMO_MODE=true uvicorn app.main:app --port 8000 &
cd ..
python scripts/seed.py
curl localhost:8000/api/health
# frontend (new terminal)
cd frontend
npm install && NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
# open http://localhost:3000
```

**Try it (real pixels, no key needed):**
```bash
# real Sentinel-2 NDVI change (least-cloudy baseline vs recent COGs)
curl -X POST 'localhost:8000/api/analysis' -H 'Content-Type: application/json' \
  -d '{"lon":90.345,"lat":23.83,"radius_m":1500}'
# offline demo math (synthetic — labeled as such)
curl -X POST 'localhost:8000/api/analysis?demo=true' -H 'Content-Type: application/json' \
  -d '{"lon":90.345,"lat":23.83,"radius_m":1500}'
```
Real path reads B04+B08 10 m COGs via Planetary Computer STAC (signed URLs, windowed reads), reprojects recent onto the baseline grid, and runs VRX-1 NDVI-delta + alert logic. Single scene per epoch: seasonal phenology can mimic clearing — every result carries scene IDs, dates, cloud %, and that caveat.

## What runs where
- `backend/app/vrx1/` — VRX-1 brain (indices, masks, change, alerts). Pure numpy, tested.
- `backend/app/providers/` — replaceable imagery adapters (planetary-computer real, demo synthetic).
- `backend/app/main.py` — FastAPI REST (sites, analysis, alerts, review, health, data-sources).
- `frontend/` — Next.js + MapLibre + Recharts dashboard (7 pages).
- `data/demo.json` — JSON store fallback so it runs without Postgres. Postgres/PostGIS schema in `docs/SCHEMA.md`.

## Secrets
No keys committed. Copy `.env.example` → `.env`. STAC search needs no key; SAS blob tokens auto-sign. All operator keys come from the deployer's `.env`.

## Static quick-viewer (Netlify, no backend)

`site/` is a zero-build static page that shows **precalculated results only** — for viewing on the go. No analysis runs there, no API keys, no server.

```bash
python3 scripts/export_static.py   # writes site/data/snapshot.json (synthetic demo, labeled)
(cd site && python3 -m http.server 8080)  # open http://localhost:8080
```

Deploy: connect the repo to Netlify with publish dir `site` (see `netlify.toml`; build regenerates the snapshot offline). To refresh data: rerun the full stack, then `export_static.py`, commit, redeploy.

## Tests
```bash
cd backend && python -m pytest tests/ -q   # 11 tests, no network
```

## Docs
- `docs/SITES.md` (49-site BD registry) · `docs/ARCHITECTURE.md` · `INSTALL.md` · `ENV.md` · `SCHEMA.md` · `DATA_SOURCES.md` · `DETECTION.md` (VRX-1) · `API.md` · `TESTING.md` · `DEPLOY.md` · `TROUBLESHOOTING.md` · `LIMITATIONS.md`

## Full BD processing (all 49 sites, real pixels)

```bash
python3 scripts/seed.py            # import registry (idempotent)
python3 scripts/process_all.py     # ~20-30 s/site; skips fresh; writes data/processed_cache.json
python3 scripts/export_static.py --real  # Netlify snapshot + JPEG before/after + overlay
```

## Limitations (read before use)
10 m pixels = 100 m²; reliable only for ≥0.5 ha contiguous change. Clouds/monsoon, seasonality, floods cause false positives. Demo polygons are **not legal cadastre**. GREEN ≠ legal clearance; RED ≠ proven illegality. GRAY means blind — widen windows.
