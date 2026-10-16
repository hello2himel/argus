"""Storage: Postgres/PostGIS when available, JSON-file fallback for demo/any-machine runs.

DEMO_MODE=true OR DATABASE_URL unset/unreachable -> JsonStore (data/demo.json).
/api/health reports which backend is active.
"""
from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class JsonStore:
    def __init__(self, path: str = "data/demo.json"):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self._write({"sites": [], "analyses": [], "alerts": [], "reviews": []})

    def _read(self) -> dict:
        return json.loads(self.path.read_text())

    def _write(self, d: dict) -> None:
        self.path.write_text(json.dumps(d, indent=2))

    # sites
    def list_sites(self) -> list[dict]:
        return self._read()["sites"]

    def add_site(self, site: dict) -> dict:
        d = self._read()
        site = dict(site)
        site.setdefault("id", f"site-{uuid.uuid4().hex[:8]}")
        site.setdefault("created_at", now_iso())
        d["sites"].append(site)
        self._write(d)
        return site

    def get_site(self, sid: str) -> dict | None:
        return next((s for s in self._read()["sites"] if s["id"] == sid), None)

    def delete_site(self, sid: str) -> bool:
        d = self._read()
        n = len(d["sites"])
        d["sites"] = [s for s in d["sites"] if s["id"] != sid]
        self._write(d)
        return len(d["sites"]) < n

    # analyses
    def add_analysis(self, a: dict) -> dict:
        d = self._read()
        a = dict(a)
        a.setdefault("id", f"an-{uuid.uuid4().hex[:8]}")
        a.setdefault("created_at", now_iso())
        d["analyses"].append(a)
        self._write(d)
        return a

    def get_analysis(self, aid: str) -> dict | None:
        return next((a for a in self._read()["analyses"] if a["id"] == aid), None)

    def list_analyses(self, limit: int = 50) -> list[dict]:
        return list(reversed(self._read()["analyses"]))[:limit]

    def update_analysis(self, aid: str, patch: dict) -> dict | None:
        d = self._read()
        for a in d["analyses"]:
            if a["id"] == aid:
                a.update(patch)
                self._write(d)
                return a
        return None

    # alerts
    def add_alert(self, al: dict) -> dict:
        d = self._read()
        al = dict(al)
        al.setdefault("id", f"al-{uuid.uuid4().hex[:8]}")
        al.setdefault("created_at", now_iso())
        al.setdefault("review_status", "UNVERIFIED")
        d["alerts"].append(al)
        self._write(d)
        return al

    def list_alerts(self) -> list[dict]:
        return list(reversed(self._read()["alerts"]))

    def get_alert(self, aid: str) -> dict | None:
        return next((a for a in self._read()["alerts"] if a["id"] == aid), None)

    def review_alert(self, aid: str, status: str, note: str = "") -> dict | None:
        d = self._read()
        for a in d["alerts"]:
            if a["id"] == aid:
                a["review_status"] = status
                a["review_note"] = note
                a["reviewed_at"] = now_iso()
                d.setdefault("reviews", []).append(
                    {"alert_id": aid, "status": status, "note": note, "at": now_iso()})
                self._write(d)
                return a
        return None


_store: JsonStore | None = None


def get_store() -> JsonStore:
    """Phase-1: JSON store always works. Postgres adapter plugs in here (see docs/SCHEMA.md)."""
    global _store
    if _store is None:
        data_path = os.getenv("ARGUS_DATA", str(Path(__file__).resolve().parents[2] / "data" / "demo.json"))
        _store = JsonStore(data_path)
    return _store


def db_kind() -> str:
    if os.getenv("DATABASE_URL"):
        return "postgres-configured (json fallback active in MVP)"
    return "json-demo"
