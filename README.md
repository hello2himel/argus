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

**Try it:**
```bash
# demo math (offline, synthetic — labeled as such)
curl -X POST 'localhost:8000/api/analysis?demo=true' -H 'Content-Type: application/json' \
  -d '{"lon":90.345,"lat":23.83,"radius_m":1500}'
# real catalog search (needs internet, no key)
curl -X POST 'localhost:8000/api/analysis' -H 'Content-Type: application/json' \
  -d '{"lon":90.345,"lat":23.83,"radius_m":1500}'
```

## What runs where
- `backend/app/vrx1/` — VRX-1 brain (indices, masks, change, alerts). Pure numpy, tested.
- `backend/app/providers/` — replaceable imagery adapters (planetary-computer real, demo synthetic).
- `backend/app/main.py` — FastAPI REST (sites, analysis, alerts, review, health, data-sources).
- `frontend/` — Next.js + MapLibre + Recharts dashboard (7 pages).
- `data/demo.json` — JSON store fallback so it runs without Postgres. Postgres/PostGIS schema in `docs/SCHEMA.md`.

## Secrets
No keys committed. Copy `.env.example` → `.env`. STAC search needs no key; SAS blob tokens auto-sign. All operator keys come from the deployer's `.env`.

## Tests
```bash
cd backend && python -m pytest tests/ -q   # 11 tests, no network
```

## Docs
- `docs/ARCHITECTURE.md` · `INSTALL.md` · `ENV.md` · `SCHEMA.md` · `DATA_SOURCES.md` · `DETECTION.md` (VRX-1) · `API.md` · `TESTING.md` · `DEPLOY.md` · `TROUBLESHOOTING.md` · `LIMITATIONS.md`

## Limitations (read before use)
10 m pixels = 100 m²; reliable only for ≥0.5 ha contiguous change. Clouds/monsoon, seasonality, floods cause false positives. Demo polygons are **not legal cadastre**. GREEN ≠ legal clearance; RED ≠ proven illegality. GRAY means blind — widen windows.
