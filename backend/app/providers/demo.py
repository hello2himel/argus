"""Demo provider — clearly labeled SYNTHETIC, never presented as real imagery.

Used when: DEMO_MODE=true, offline, or provider unreachable, so the UI/API
pipeline (composites -> indices -> alerts -> review) stays testable.
Every Observation has extra['synthetic']=True and product_id prefix SYN-.
"""
from __future__ import annotations

import numpy as np

from .base import ImageryProvider, Observation, SearchResult


class DemoProvider(ImageryProvider):
    name = "demo-synthetic"

    def status(self):
        return {"provider": self.name, "ok": True, "synthetic": True,
                "note": "Synthetic demo data only. Not satellite observations."}

    def search(self, bbox, start, end, max_cloud: float = 30.0, limit: int = 50) -> SearchResult:
        obs = [
            Observation(self.name, "synthetic-s2-like", "SYN-BASELINE-001",
                        start, 5.0, {"B04": "synthetic://baseline/red", "B08": "synthetic://baseline/nir"},
                        list(bbox), {"synthetic": True}),
            Observation(self.name, "synthetic-s2-like", "SYN-RECENT-001",
                        end, 4.0, {"B04": "synthetic://recent/red", "B08": "synthetic://recent/nir"},
                        list(bbox), {"synthetic": True}),
        ]
        return SearchResult(obs, self.name, {"synthetic": True})

    @staticmethod
    def synthetic_bands(seed: int = 0, clearing: bool = False, size: int = 64) -> dict:
        """Deterministic synthetic B02..B12-like arrays for pipeline demo/tests."""
        rng = np.random.default_rng(seed)
        veg = 0.45 + 0.1 * rng.standard_normal((size, size))
        veg = float(np.clip(veg, 0.05, 0.9)) if False else np.clip(veg, 0.05, 0.9)
        red = 0.08 + 0.02 * rng.standard_normal((size, size))
        nir = np.clip(0.35 + 0.1 * rng.standard_normal((size, size)), 0.05, 0.9)
        if clearing:
            nir[20:40, 20:40] = 0.12  # cleared block: NIR collapses
            red[20:40, 20:40] = 0.20  # red rises (soil)
        green = np.clip(red * 1.1, 0.02, 0.5)
        blue = np.clip(red * 0.9, 0.02, 0.5)
        swir1 = np.clip(0.18 + 0.03 * rng.standard_normal((size, size)), 0.02, 0.6)
        if clearing:
            swir1[20:40, 20:40] = 0.30
        swir2 = np.clip(swir1 * 0.8, 0.02, 0.6)
        scl = np.full((size, size), 4, dtype=int)
        return {"B02": blue, "B03": green, "B04": np.clip(red, 0.01, 1),
                "B08": nir, "B11": swir1, "B12": swir2, "SCL": scl}
