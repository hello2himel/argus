"""
VRX-1 alert logic: connected components + GREEN/AMBER/RED/GRAY.
GREEN  = suitable imagery, thresholds not exceeded (NOT a legal clearance).
AMBER  = meaningful change, needs inspection.
RED    = substantial/persistent/corroborated change, priority review.
GRAY   = insufficient imagery/quality — never show green when blind.
Review states (human, separate): UNVERIFIED, UNDER_REVIEW, CONFIRMED_DISTURBANCE,
DISMISSED, REQUIRES_FIELD_INSPECTION.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

try:
    from skimage.measure import label as _sk_label, regionprops as _sk_regionprops
    _HAS_SK = True
except Exception:  # pragma: no cover
    _HAS_SK = False

PIXEL_M2 = 100.0  # Sentinel-2 10m


@dataclass
class Region:
    label: int
    pixels: int
    area_m2: float
    area_ha: float
    centroid_row: float
    centroid_col: float
    mean_delta: float | None = None
    bbox: tuple[int, int, int, int] = (0, 0, 0, 0)


@dataclass
class AlertResult:
    level: str  # GREEN/AMBER/RED/GRAY
    total_pixels: int = 0
    total_m2: float = 0.0
    total_ha: float = 0.0
    n_events: int = 0
    max_region_ha: float = 0.0
    max_delta: float | None = None
    valid_fraction: float = 1.0
    n_clear: int = 0
    thresholds: dict = field(default_factory=dict)
    explanation: str = ""
    regions: list[Region] = field(default_factory=list)


def label_events(
    binary: np.ndarray,
    delta_layer: np.ndarray | None = None,
    pixel_m2: float = PIXEL_M2,
    min_px: int = 50,
) -> list[Region]:
    m = np.asarray(binary, dtype=bool)
    if m.size == 0 or not m.any():
        return []
    if _HAS_SK:
        lab = _sk_label(m, connectivity=2)
        out: list[Region] = []
        for rp in _sk_regionprops(lab):
            if rp.area < int(min_px):
                continue
            dl = None
            if delta_layer is not None:
                vals = np.asarray(delta_layer, dtype=np.float64)[lab == rp.label]
                vals = vals[~np.isnan(vals)]
                dl = float(vals.mean()) if vals.size else None
            out.append(Region(
                label=int(rp.label), pixels=int(rp.area),
                area_m2=float(rp.area * pixel_m2),
                area_ha=float(rp.area * pixel_m2 / 10000.0),
                centroid_row=float(rp.centroid[0]), centroid_col=float(rp.centroid[1]),
                mean_delta=dl, bbox=tuple(int(x) for x in rp.bbox),
            ))
        return sorted(out, key=lambda r: r.pixels, reverse=True)
    # fallback: single region (no skimage)
    n = int(m.sum())
    if n < int(min_px):
        return []
    r, c = np.nonzero(m)
    dl = None
    if delta_layer is not None:
        vals = np.asarray(delta_layer, dtype=np.float64)[m]
        vals = vals[~np.isnan(vals)]
        dl = float(vals.mean()) if vals.size else None
    return [Region(1, n, n * pixel_m2, n * pixel_m2 / 10000.0,
                   float(r.mean()), float(c.mean()), dl,
                   (int(r.min()), int(c.min()), int(r.max()), int(c.max())))]


def classify(
    total_ha: float,
    max_region_ha: float,
    max_delta_abs: float | None,
    valid_fraction: float,
    n_clear: int,
    thresholds: dict | None = None,
) -> AlertResult:
    t = dict(thresholds or {})
    min_vf = float(t.get("min_valid_fraction", 0.40))
    min_clear = int(t.get("min_clear_obs", 3))
    red_total = float(t.get("red_total_ha", 5.0))
    red_region = float(t.get("red_region_ha", 2.0))
    amber_total = float(t.get("amber_total_ha", 0.5))

    if valid_fraction < min_vf or n_clear < min_clear:
        return AlertResult("GRAY", valid_fraction=valid_fraction, n_clear=n_clear,
                           thresholds=t,
                           explanation=f"Insufficient evidence: valid_fraction={valid_fraction:.2f} (<{min_vf}) or n_clear={n_clear} (<{min_clear}). Widen date window or relax cloud filter.")

    if total_ha >= red_total or max_region_ha >= red_region:
        lvl, why = "RED", f"substantial change: total={total_ha:.2f}ha (red≥{red_total}), max_region={max_region_ha:.2f}ha (red≥{red_region})"
    elif total_ha >= amber_total:
        lvl, why = "AMBER", f"possible disturbance: total={total_ha:.2f}ha (amber≥{amber_total})"
    else:
        lvl, why = "GREEN", f"no significant change: total={total_ha:.3f}ha below amber={amber_total}ha"

    return AlertResult(lvl, total_m2=total_ha * 10000.0, total_ha=total_ha,
                       max_region_ha=max_region_ha, max_delta=max_delta_abs,
                       valid_fraction=valid_fraction, n_clear=n_clear,
                       thresholds=t, explanation=why)


def decide(binary: np.ndarray, delta_layer: np.ndarray | None, valid_fraction: float,
           n_clear: int, thresholds: dict | None = None, pixel_m2: float = PIXEL_M2) -> AlertResult:
    t = dict(thresholds or {})
    regs = label_events(binary, delta_layer, pixel_m2, int(t.get("min_region_px", 50)))
    total_ha = sum(r.area_ha for r in regs)
    max_r = max((r.area_ha for r in regs), default=0.0)
    md = None
    if delta_layer is not None:
        v = np.asarray(delta_layer, dtype=np.float64)[np.asarray(binary, dtype=bool)]
        v = v[~np.isnan(v)]
        md = float(np.abs(v).max()) if v.size else None
    res = classify(total_ha, max_r, md, valid_fraction, n_clear, t)
    res.regions = regs
    res.total_pixels = sum(r.pixels for r in regs)
    res.total_m2 = total_ha * 10000.0
    res.total_ha = total_ha
    res.n_events = len(regs)
    res.max_delta = md
    return res
