"""
VRX-1 detection brain — spectral indices.
Project Argus / VRX-1

Pure-numpy implementations so they are unit-testable without network or rasterio.
All functions accept array-likes in surface reflectance (0..1 or 0..10000 scaled —
formula is scale-invariant as long as all bands share the same scale) and return
float arrays with NaN where the denominator is zero / nodata.

Band mapping (Sentinel-2 L2A):
  B02 blue  10m, B03 green 10m, B04 red 10m,
  B08 NIR   10m, B11 SWIR1 20m, B12 SWIR2 20m
SWIR bands are resampled to 10m (bilinear/bicubic) BEFORE calling these functions.
Resampling does NOT increase native resolution — documented in docs/DETECTION.md.
"""
from __future__ import annotations

import numpy as np

_EPS = 1e-9


def _as_float(a) -> np.ndarray:
    return np.asarray(a, dtype=np.float64)


def _safe_div(num: np.ndarray, den: np.ndarray) -> np.ndarray:
    with np.errstate(divide="ignore", invalid="ignore"):
        out = num / (den + _EPS)
    out = np.where(np.abs(den) < _EPS, np.nan, out)
    return out


def ndvi(nir: np.ndarray, red: np.ndarray) -> np.ndarray:
    """NDVI = (B08 - B04) / (B08 + B04). Range [-1, 1]. Vegetation ~ >0.4."""
    nir, red = _as_float(nir), _as_float(red)
    return _safe_div(nir - red, nir + red)


def ndmi(nir: np.ndarray, swir1: np.ndarray) -> np.ndarray:
    """NDMI = (B08 - B11) / (B08 + B11). Moisture indicator."""
    nir, swir1 = _as_float(nir), _as_float(swir1)
    return _safe_div(nir - swir1, nir + swir1)


def ndbi(swir1: np.ndarray, nir: np.ndarray) -> np.ndarray:
    """NDBI = (B11 - B08) / (B11 + B08). Built-up candidate (confused by bare soil)."""
    swir1, nir = _as_float(swir1), _as_float(nir)
    return _safe_div(swir1 - nir, swir1 + nir)


def ndwi(green: np.ndarray, nir: np.ndarray) -> np.ndarray:
    """NDWI (McFeeters) = (B03 - B08) / (B03 + B08). Open water > 0."""
    green, nir = _as_float(green), _as_float(nir)
    return _safe_div(green - nir, green + nir)


def mndwi(green: np.ndarray, swir1: np.ndarray) -> np.ndarray:
    """MNDWI (Xu) = (B03 - B11) / (B03 + B11). Better urban water separation."""
    green, swir1 = _as_float(green), _as_float(swir1)
    return _safe_div(green - swir1, green + swir1)


def bsi(swir1: np.ndarray, red: np.ndarray, nir: np.ndarray, blue: np.ndarray) -> np.ndarray:
    """Bare Soil Index = ((B11 + B04) - (B08 + B02)) / ((B11 + B04) + (B08 + B02))."""
    swir1, red, nir, blue = map(_as_float, (swir1, red, nir, blue))
    num = (swir1 + red) - (nir + blue)
    den = (swir1 + red) + (nir + blue)
    return _safe_div(num, den)


def brightness(green: np.ndarray, red: np.ndarray, nir: np.ndarray) -> np.ndarray:
    """Simple mean brightness used as a bare-surface helper."""
    return (np.asarray(green, dtype=np.float64) + np.asarray(red, dtype=np.float64) + np.asarray(nir, dtype=np.float64)) / 3.0


def to_reflectance(dn: np.ndarray, offset: float = -1000.0) -> np.ndarray:
    """DN -> surface reflectance. Post-2022-01-25 baseline 04.00 uses offset -1000; DN=0 is NODATA.

    reflectance = (DN + offset_applied) / 10000 where offset_applied = offset for DN>0 else 0.
    Older products (baseline <04.00): use offset=0.0.
    """
    a = np.asarray(dn, dtype=np.float64)
    out = np.where(a == 0, np.nan, (a + np.where(a > 0, offset, 0.0)) / 10000.0)
    return np.clip(out, 0.0, 1.5)
