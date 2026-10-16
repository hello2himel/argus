"""
VRX-1 change detection: compositing, deltas, binary masks.
Pure numpy + optional scikit-image for connected components (in alerts.py).
"""
from __future__ import annotations

import numpy as np


def median_composite(stack: np.ndarray, count_min: int = 3) -> tuple[np.ndarray, np.ndarray]:
    """Pixel-wise median over time axis. stack shape (n_obs, H, W) with NaN for cloudy.

    Returns (composite HxW, count HxW of clear obs).
    Pixels with count < count_min are set to NaN (insufficient).
    """
    s = np.asarray(stack, dtype=np.float64)
    if s.ndim != 3:
        raise ValueError("stack must be (n_obs, H, W)")
    count = np.sum(~np.isnan(s), axis=0)
    with np.errstate(all="ignore"):
        comp = np.nanmedian(s, axis=0)
    comp = np.where(count >= int(count_min), comp, np.nan)
    return comp, count.astype(int)


def delta(recent: np.ndarray, baseline: np.ndarray) -> np.ndarray:
    r = np.asarray(recent, dtype=np.float64)
    b = np.asarray(baseline, dtype=np.float64)
    if r.shape != b.shape:
        raise ValueError(f"shape mismatch recent={r.shape} baseline={b.shape}; reproject first")
    return r - b


def binary_change(
    d: np.ndarray,
    threshold: float,
    direction: str = "decrease",
    baseline: np.ndarray | None = None,
    baseline_min: float | None = None,
) -> np.ndarray:
    """Binary mask from a delta layer.

    direction: 'decrease' (d < -thresh), 'increase' (d > thresh), 'abs' (|d| > thresh).
    baseline_min: optional gate, e.g. base NDVI > 0.3 for veg-loss.
    NaN deltas -> False.
    """
    a = np.asarray(d, dtype=np.float64)
    if direction == "decrease":
        m = a < -abs(float(threshold))
    elif direction == "increase":
        m = a > abs(float(threshold))
    elif direction == "abs":
        m = np.abs(a) > abs(float(threshold))
    else:
        raise ValueError("direction must be decrease|increase|abs")
    m = np.where(np.isnan(a), False, m)
    if baseline is not None and baseline_min is not None:
        b = np.asarray(baseline, dtype=np.float64)
        m &= b > float(baseline_min)
    return m.astype(bool)


def combine_signals(*masks: np.ndarray, mode: str = "or") -> np.ndarray:
    if not masks:
        raise ValueError("need at least one mask")
    arrs = [np.asarray(m, dtype=bool) for m in masks]
    if mode == "or":
        out = arrs[0].copy()
        for m in arrs[1:]:
            out |= m
        return out
    if mode == "and":
        out = arrs[0].copy()
        for m in arrs[1:]:
            out &= m
        return out
    raise ValueError("mode must be or|and")


# Default VRX-1 v1 thresholds (documented, tunable per site type).
# See docs/DETECTION.md — these are starting points, NOT universal truths.
DEFAULTS = {
    "ndvi_drop": 0.15,
    "ndvi_base_min": 0.30,
    "ndmi_drop": 0.12,
    "ndbi_gain": 0.12,
    "bsi_gain": 0.10,
    "mndwi_gain": 0.20,  # new water
    "min_valid_fraction": 0.40,
    "min_clear_obs": 3,
    "min_region_px": 50,  # 50 x 100m² = 0.5 ha
}
