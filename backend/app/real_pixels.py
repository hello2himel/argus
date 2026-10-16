"""Real-pixel VRX-1 path: Sentinel-2 L2A COGs -> NDVI delta -> alert.

Reads B04 (red) + B08 (NIR) 10m assets for one least-cloudy baseline scene and
one least-cloudy recent scene, clipped to the AOI bbox, reprojects recent onto
the baseline grid, and runs the standard VRX-1 math (binary_change + decide).

Honest limits: single scene per epoch (not a median composite), so seasonal /
atmospheric noise is higher than the multi-scene design in docs/DETECTION.md.
valid_fraction < 0.4 or any download failure -> caller falls back to GRAY with
the real scene list attached. Never fabricates pixels.
"""
from __future__ import annotations

import os
from typing import Any

import numpy as np

os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
os.environ.setdefault("GDAL_HTTP_TIMEOUT", "60")
os.environ.setdefault("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif,.TIF,.jp2")

RES = 10.0  # Sentinel-2 VNIR metres


def _to_reflectance(dn: np.ndarray) -> np.ndarray:
    a = np.asarray(dn, dtype=np.float64)
    out = np.where(a == 0, np.nan, (a - 1000.0) / 10000.0)  # post-2022 baseline 04.00
    return np.clip(out, 0.0, 1.5)


def _read_clipped(href: str, bbox: tuple[float, float, float, float], buf_deg: float = 0.0,
                  max_px: int = 1200):
    """Read one COG band with a server-friendly windowed read clipped to lon/lat bbox.

    Uses rasterio window reads (HTTP range requests) so we never download full
    scenes. Returns (array2d float, meta dict with crs/transform/shape).
    """
    import rasterio
    from rasterio import windows
    x0, y0, x1, y1 = bbox
    x0 -= buf_deg; y0 -= buf_deg; x1 += buf_deg; y1 += buf_deg
    gdal_cfg = {"GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
                "GDAL_HTTP_TIMEOUT": "60",
                "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif,.TIF,.jp2",
                "GDAL_HTTP_MAX_RETRY": "3", "GDAL_HTTP_RETRY_DELAY": "2"}
    with rasterio.Env(**gdal_cfg):
        with rasterio.open(href) as src:
            from rasterio.warp import transform_bounds
            # bbox arrives as lon/lat; scene rasters are UTM metres -> warp first
            try:
                bx0, by0, bx1, by1 = transform_bounds("EPSG:4326", src.crs, x0, y0, x1, y1, densify_pts=21)
            except Exception as e:
                raise RuntimeError(f"CRS warp failed: {e}")
            win = windows.from_bounds(bx0, by0, bx1, by1, src.transform)
            win = win.round_offsets().round_lengths()
            # clamp to raster dims (scene may be a neighbouring tile -> no intersect)
            col_off = min(max(0, win.col_off), src.width)
            row_off = min(max(0, win.row_off), src.height)
            width = min(win.width, src.width - col_off)
            height = min(win.height, src.height - row_off)
            if width <= 0 or height <= 0:
                raise RuntimeError("AOI does not intersect scene raster")
            win = windows.Window(col_off, row_off, width, height)
            out_shape = None
            if max(win.width, win.height) > max_px:
                scale = max_px / max(win.width, win.height)
                out_shape = (max(1, int(win.height * scale)), max(1, int(win.width * scale)))
            arr = src.read(1, window=win, boundless=True, fill_value=0, out_shape=out_shape)
            transform = src.window_transform(win) if out_shape is None else None
            if transform is None:  # downsampled: scale transform
                t = src.window_transform(win)
                sx, sy = arr.shape[1] / win.width, arr.shape[0] / win.height
                transform = rasterio.Affine(t.a / sx, t.b, t.c, t.d, t.e / sy, t.f)
            return (np.asarray(arr, dtype=np.float64),
                    {"crs": str(src.crs), "transform": tuple(transform)[:6],
                     "shape": arr.shape})


def _reproject_to(src: np.ndarray, src_meta: dict, ref: np.ndarray, ref_meta: dict) -> np.ndarray:
    import rasterio.warp
    from rasterio import Affine
    dst = np.full_like(ref, np.nan, dtype=np.float64)
    rasterio.warp.reproject(
        np.ascontiguousarray(src), dst,
        src_transform=Affine(*src_meta["transform"]), src_crs=src_meta["crs"],
        dst_transform=Affine(*ref_meta["transform"]), dst_crs=ref_meta["crs"],
        resampling=rasterio.warp.Resampling.bilinear,
        src_nodata=np.nan, dst_nodata=np.nan,
    )
    return dst


def _f(x):
    """float() that maps NaN/None -> None so JSON stays valid (JS chokes on NaN)."""
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return None if np.isnan(v) else v


def pick_scene(observations: list, max_cloud: float = 60.0):
    """Least-cloudy observation that actually carries B04+B08 assets."""
    cands = [o for o in observations
             if "B04" in o.assets and "B08" in o.assets
             and (o.cloud_cover is None or o.cloud_cover <= max_cloud)]
    if not cands:
        return None
    return sorted(cands, key=lambda o: (o.cloud_cover if o.cloud_cover is not None else 99.0))[0]


def ranked_scenes(observations: list, max_cloud: float = 60.0, k: int = 5):
    cands = [o for o in observations
             if "B04" in o.assets and "B08" in o.assets
             and (o.cloud_cover is None or o.cloud_cover <= max_cloud)]
    return sorted(cands, key=lambda o: (o.cloud_cover if o.cloud_cover is not None else 99.0))[:max(1, k)]


def compute_real_change(geometry: dict, baseline_obs: list, recent_obs: list,
                        params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Full real-pixel computation. Raises RuntimeError on any unusable input."""
    from .geo import bbox_of
    from .vrx1 import indices as IX, change as CH, alerts as AL
    params = params or {}
    max_cloud = float(params.get("max_cloud", 60.0))

    b_cands = ranked_scenes(baseline_obs, max_cloud)
    r_cands = ranked_scenes(recent_obs, max_cloud)
    if not b_cands or not r_cands:
        raise RuntimeError(
            f"no readable scenes (need B04+B08, cloud<={max_cloud}): "
            f"baseline={len(baseline_obs)} recent={len(recent_obs)}")

    bbox = bbox_of(geometry)
    last_err = "unknown"
    for b_item in b_cands:
        for r_item in r_cands:
            try:
                return _compute_pair(geometry, bbox, b_item, r_item, params)
            except Exception as e:
                last_err = str(e)[:200]
                continue
    raise RuntimeError(f"all scene pairs failed (neighbouring tiles/clouds?). last: {last_err}")


def _compute_pair(geometry: dict, bbox: tuple, b_item, r_item, params: dict) -> dict[str, Any]:
    from .vrx1 import indices as IX, change as CH, alerts as AL
    b4, b4m = _read_clipped(b_item.assets["B04"], bbox)
    b8, _ = _read_clipped(b_item.assets["B08"], bbox)
    r4, _ = _read_clipped(r_item.assets["B04"], bbox)
    r8, r8m = _read_clipped(r_item.assets["B08"], bbox)

    ndvi_b = IX.ndvi(_to_reflectance(b8), _to_reflectance(b4))
    ndvi_r_raw = IX.ndvi(_to_reflectance(r8), _to_reflectance(r4))
    # align recent grid onto baseline grid
    if ndvi_r_raw.shape != ndvi_b.shape:
        ndvi_r = _reproject_to(ndvi_r_raw, r8m, ndvi_b, b4m)
    else:
        ndvi_r = ndvi_r_raw

    valid = ~np.isnan(ndvi_b) & ~np.isnan(ndvi_r)
    vf = float(valid.sum() / valid.size) if valid.size else 0.0
    t = {**CH.DEFAULTS, **{k: params[k] for k in CH.DEFAULTS if k in params}}
    # single scene per epoch: 2 clear observations is a complete pair (not a
    # thin multi-scene composite), so don't demand min_clear_obs=3 here.
    t["min_clear_obs"] = 2
    d = CH.delta(np.where(valid, ndvi_r, np.nan), np.where(valid, ndvi_b, np.nan))
    veg_loss = CH.binary_change(d, t["ndvi_drop"], "decrease", ndvi_b, t["ndvi_base_min"])
    veg_loss &= valid
    res = AL.decide(veg_loss, d, vf, 2, t)
    md = _f(res.max_delta)

    px_ha = RES * RES / 10000.0
    return {
        "level": res.level, "total_ha": float(res.total_ha * 1.0),
        "total_m2": float(res.total_m2), "n_events": res.n_events,
        "max_region_ha": res.max_region_ha, "max_delta": md,
        "valid_fraction": vf, "n_clear": 2, "thresholds": t,
        "explanation": res.explanation,
        "regions": [r.__dict__ for r in res.regions],
        "signals": {
            "veg_loss_px": int(veg_loss.sum()),
            "mean_d_ndvi": _f(np.nanmean(d)) if valid.any() else None,
            "mean_ndvi_baseline": _f(np.nanmean(np.where(valid, ndvi_b, np.nan))),
            "mean_ndvi_recent": _f(np.nanmean(np.where(valid, ndvi_r, np.nan))),
            "grid_shape": list(ndvi_b.shape),
        },
        "scenes_used": [
            {"product_id": b_item.product_id, "acquired": b_item.acquired,
             "cloud_cover": b_item.cloud_cover, "epoch": "baseline"},
            {"product_id": r_item.product_id, "acquired": r_item.acquired,
             "cloud_cover": r_item.cloud_cover, "epoch": "recent"},
        ],
    }
