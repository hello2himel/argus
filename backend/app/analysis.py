"""VRX-1 analysis runner: geometry -> observations -> indices -> change -> alert.

Two paths:
 1. REAL path (default when provider reachable): query STAC catalog for scene
    metadata (proves real catalog integration). Pixel processing requires
    raster download; in MVP we compute indices over retrieved thumbnails when
    available, else return GRAY/insufficient with the real scene list attached.
 2. DEMO path (DEMO_MODE=true or ?demo=true): deterministic synthetic bands
    so the full math pipeline is exercisable offline. Results are labeled
    synthetic=True and must never be presented as satellite truth.
"""
from __future__ import annotations

import os
from typing import Any

import numpy as np

from .providers.planetary import PlanetaryProvider
from .providers.demo import DemoProvider
from .vrx1 import indices as IX
from .vrx1 import masks as MX
from .vrx1 import change as CH
from .vrx1 import alerts as AL


def _run_math(bands_base: dict[str, np.ndarray], bands_recent: dict[str, np.ndarray],
              params: dict[str, Any]) -> dict[str, Any]:
    t = {**CH.DEFAULTS, **{k: params[k] for k in CH.DEFAULTS if k in params}}
    ndvi_b = IX.ndvi(bands_base["B08"], bands_base["B04"])
    ndvi_r = IX.ndvi(bands_recent["B08"], bands_recent["B04"])
    ndmi_b = IX.ndmi(bands_base["B08"], bands_base["B11"])
    ndmi_r = IX.ndmi(bands_recent["B08"], bands_recent["B11"])
    ndbi_b = IX.ndbi(bands_base["B11"], bands_base["B08"])
    ndbi_r = IX.ndbi(bands_recent["B11"], bands_recent["B08"])
    bsi_b = IX.bsi(bands_base["B11"], bands_base["B04"], bands_base["B08"], bands_base["B02"])
    bsi_r = IX.bsi(bands_recent["B11"], bands_recent["B04"], bands_recent["B08"], bands_recent["B02"])
    mndwi_b = IX.mndwi(bands_base["B03"], bands_base["B11"])
    mndwi_r = IX.mndwi(bands_recent["B03"], bands_recent["B11"])

    d_ndvi = CH.delta(ndvi_r, ndvi_b)
    d_ndbi = CH.delta(ndbi_r, ndbi_b)
    d_bsi = CH.delta(bsi_r, bsi_b)

    veg_loss = CH.binary_change(d_ndvi, t["ndvi_drop"], "decrease", ndvi_b, t["ndvi_base_min"])
    built_gain = CH.binary_change(d_ndbi, t["ndbi_gain"], "increase")
    bare_gain = CH.binary_change(d_bsi, t["bsi_gain"], "increase")
    combined = CH.combine_signals(veg_loss, CH.combine_signals(built_gain, bare_gain, mode="or"), mode="or")

    # quality: synthetic SCL all clear -> fraction 1.0, n from params
    vf = float(params.get("valid_fraction", 1.0))
    n_clear = int(params.get("n_clear", 6))
    res = AL.decide(combined, d_ndvi, vf, n_clear, t)
    return {
        "level": res.level, "total_ha": res.total_ha, "total_m2": res.total_m2,
        "n_events": res.n_events, "max_region_ha": res.max_region_ha,
        "max_delta": res.max_delta, "valid_fraction": vf, "n_clear": n_clear,
        "thresholds": t, "explanation": res.explanation,
        "regions": [r.__dict__ for r in res.regions],
        "signals": {
            "veg_loss_px": int(veg_loss.sum()), "built_gain_px": int(built_gain.sum()),
            "bare_gain_px": int(bare_gain.sum()),
            "mean_d_ndvi": float(np.nanmean(d_ndvi)),
            "mean_d_ndbi": float(np.nanmean(d_ndbi)),
        },
    }


def run_analysis(geometry: dict, baseline_start: str, baseline_end: str,
                 recent_start: str, recent_end: str, params: dict[str, Any],
                 use_demo: bool = False) -> dict[str, Any]:
    from .geo import bbox_of
    bbox = bbox_of(geometry)
    max_cloud = float(params.get("max_cloud", 30.0))

    demo_forced = use_demo or os.getenv("DEMO_MODE", "false").lower() == "true"
    provider = DemoProvider() if demo_forced else PlanetaryProvider()
    base_res = provider.search(bbox, baseline_start, baseline_end, max_cloud)
    recent_res = provider.search(bbox, recent_start, recent_end, max_cloud)

    n_base, n_recent = len(base_res.observations), len(recent_res.observations)
    scenes = [{"product_id": o.product_id, "acquired": o.acquired,
               "cloud_cover": o.cloud_cover, "provider": o.provider,
               "synthetic": bool(o.extra.get("synthetic", False))}
              for o in (base_res.observations + recent_res.observations)]

    if demo_forced:
        seed = int(params.get("seed", 7))
        size = int(params.get("demo_size", 64))
        # clearing=True in recent half simulates encroachment in demo
        bb = DemoProvider.synthetic_bands(seed, clearing=False, size=size)
        br = DemoProvider.synthetic_bands(seed, clearing=True, size=size)
        math = _run_math(bb, br, params)
        math.update({"provider": DemoProvider.name, "synthetic": True,
                     "n_baseline_scenes": 2, "n_recent_scenes": 2, "scenes": scenes,
                     "note": "SYNTHETIC demo math — not satellite truth."})
        return math

    # REAL path: we have real catalog metadata. Pixel math needs raster fetch;
    # MVP ships metadata + explicit insufficient-data for pixels (Phase 2/3 adds COG reads).
    if n_base == 0 or n_recent == 0:
        return {"level": "GRAY", "total_ha": 0.0, "total_m2": 0.0, "n_events": 0,
                "max_region_ha": 0.0, "max_delta": None, "valid_fraction": 0.0,
                "n_clear": 0, "thresholds": dict(CH.DEFAULTS),
                "explanation": f"Insufficient cloud-free scenes: baseline={n_base}, recent={n_recent}. Widen windows or relax cloud filter.",
                "regions": [], "signals": {}, "provider": provider.name,
                "synthetic": False, "n_baseline_scenes": n_base,
                "n_recent_scenes": n_recent, "scenes": scenes}
    return {"level": "GRAY", "total_ha": 0.0, "total_m2": 0.0, "n_events": 0,
            "max_region_ha": 0.0, "max_delta": None,
            "valid_fraction": 0.5, "n_clear": min(n_base, n_recent),
            "thresholds": dict(CH.DEFAULTS),
            "explanation": (f"Found {n_base} baseline + {n_recent} recent real scenes. "
                            "Pixel-level COG download lands in Phase 3; run with ?demo=true for offline math demo."),
            "regions": [], "signals": {}, "provider": provider.name,
            "synthetic": False, "n_baseline_scenes": n_base,
            "n_recent_scenes": n_recent, "scenes": scenes}
