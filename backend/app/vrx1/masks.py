"""
VRX-1 cloud / shadow / nodata masking.
Sentinel-2 L2A Sen2Cor SCL:
  0 NO_DATA, 1 SATURATED/DEFECTIVE, 2 DARK, 3 CLOUD_SHADOW,
  4 VEGETATION, 5 NOT_VEGETATED (bare soil), 6 WATER,
  7 UNCLASSIFIED, 8 CLOUD_MEDIUM, 9 CLOUD_HIGH,
  10 CIRRUS, 11 SNOW/ICE
Strict clear = {4,5,6}. Relaxed also allows {2,7}.
Everything else is unusable. See docs/DETECTION.md.
"""
from __future__ import annotations

import numpy as np

try:
    from scipy.ndimage import binary_dilation as _dilate
    _HAS_SCIPY = True
except Exception:  # pragma: no cover
    _HAS_SCIPY = False

STRICT_CLEAR = {4, 5, 6}
RELAXED_CLEAR = {2, 4, 5, 6, 7}

# Legacy alias kept for backwards compat
DEFAULT_BAD_SCL = {0, 1, 2, 3, 7, 8, 9, 10, 11}


def scl_valid_mask(scl: np.ndarray, bad_values: set[int] | None = None) -> np.ndarray:
    """Legacy entrypoint: valid unless in bad_values."""
    bad = DEFAULT_BAD_SCL if bad_values is None else set(bad_values)
    scl_arr = np.asarray(scl)
    valid = np.ones(scl_arr.shape, dtype=bool)
    for v in bad:
        valid &= scl_arr != v
    return valid


def scl_clear_mask(scl: np.ndarray, strict: bool = True) -> np.ndarray:
    """Preferred entrypoint. True = clear/usable pixel."""
    good = STRICT_CLEAR if strict else RELAXED_CLEAR
    scl_arr = np.asarray(scl)
    return np.isin(scl_arr, list(good))


def dilate_mask(mask: np.ndarray, px: int = 1) -> np.ndarray:
    """Dilate a boolean *bad-pixel* mask by px pixels (cloud buffer ~40-80m)."""
    m = np.asarray(mask, dtype=bool)
    if px <= 0:
        return m
    if _HAS_SCIPY:
        return _dilate(m, iterations=int(px))
    # fallback: naive 3x3 dilation px times
    out = m.copy()
    for _ in range(int(px)):
        padded = np.pad(out, 1, mode="constant", constant_values=False)
        out = (padded[1:-1, 1:-1] | padded[:-2, 1:-1] | padded[2:, 1:-1]
               | padded[1:-1, :-2] | padded[1:-1, 2:])
    return out


def apply_mask(arr: np.ndarray, valid_mask: np.ndarray) -> np.ndarray:
    out = np.asarray(arr, dtype=np.float64).copy()
    out[~np.asarray(valid_mask, dtype=bool)] = np.nan
    return out


def nodata_mask(*bands: np.ndarray) -> np.ndarray:
    """True where ALL bands are zero/nan (nodata)."""
    stacked = [np.asarray(b, dtype=np.float64) for b in bands]
    if not stacked:
        raise ValueError("nodata_mask needs at least one band")
    arr = np.stack([(np.isnan(b) | (b == 0)) for b in stacked], axis=0)
    return np.all(arr, axis=0)


def combine_masks(scl_valid: np.ndarray, nodata: np.ndarray | None = None) -> np.ndarray:
    m = np.asarray(scl_valid, dtype=bool).copy()
    if nodata is not None:
        m &= ~np.asarray(nodata, dtype=bool)
    return m


def valid_fraction(mask: np.ndarray) -> float:
    m = np.asarray(mask, dtype=bool)
    if m.size == 0:
        return 0.0
    return float(m.sum()) / float(m.size)


def qa_stats(*masks: np.ndarray) -> dict:
    """Aggregate QA: clear_fraction + n pixels for one or stacked masks."""
    if not masks:
        return {"clear_fraction": 0.0, "n_clear": 0, "n_total": 0}
    stacked = np.stack([np.asarray(m, dtype=bool) for m in masks], axis=0)
    # pixel is clear if clear in majority / mean sense: use all-time mean
    clear = stacked.mean(axis=0) if stacked.ndim == 3 else stacked.astype(float)
    n_total = int(np.size(clear))
    n_clear = int((clear > 0.5).sum()) if clear.ndim > 0 else int(clear > 0.5)
    return {
        "clear_fraction": float(n_clear / n_total) if n_total else 0.0,
        "n_clear": n_clear,
        "n_total": n_total,
    }
