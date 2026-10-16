"""Real before/after previews with marked changes.

Builds PNGs from actual Sentinel-2 COGs for one analysis:
  before.png — baseline true-colour (visual asset, or B04/B03/B02 composite)
  after.png  — recent true-colour, reprojected onto the baseline grid
  overlay.png — translucent red change mask (same grid), toggled in the UI

Both epochs share one pixel grid, so the swipe viewer and the overlay align.
Results are cached under data/previews/{analysis_id}/ (backend) or copied to
site/data/previews/{analysis_id}/ (static export). Synthetic/demo analyses
have no satellite scenes -> ValueError, caller shows the written data only.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np

from .real_pixels import _read_clipped, _reproject_to, _to_reflectance

MAX_SIDE = 640


def _signed_item(collection: str, item_id: str):
    import pystac_client
    import planetary_computer
    from .providers.planetary import STAC_URL
    cat = pystac_client.Client.open(STAC_URL)
    search = cat.search(collections=[collection], ids=[item_id], limit=1)
    items = list(search.items())
    if not items:
        raise RuntimeError(f"STAC item not found: {item_id}")
    return planetary_computer.sign(items[0])


def _read_rgb(assets: dict, bbox: tuple, max_px: int = 900) -> tuple[np.ndarray, dict]:
    """(H, W, 3) uint8 true-colour + meta. Prefers the visual asset."""
    import rasterio
    from rasterio import windows
    from rasterio.warp import transform_bounds
    if "visual" in assets:
        href = assets["visual"]
        gdal_cfg = {"GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR", "GDAL_HTTP_TIMEOUT": "60"}
        with rasterio.Env(**gdal_cfg):
            with rasterio.open(href) as src:
                bx0, by0, bx1, by1 = transform_bounds("EPSG:4326", src.crs, *bbox, densify_pts=21)
                win = windows.from_bounds(bx0, by0, bx1, by1, src.transform).round_offsets().round_lengths()
                co = min(max(0, win.col_off), src.width); ro = min(max(0, win.row_off), src.height)
                w = min(win.width, src.width - co); h = min(win.height, src.height - ro)
                if w <= 0 or h <= 0:
                    raise RuntimeError("AOI outside visual asset")
                win = windows.Window(co, ro, w, h)
                scale = min(1.0, max_px / max(w, h))
                out_shape = (3, max(1, int(h * scale)), max(1, int(w * scale)))
                arr = src.read([1, 2, 3], window=win, boundless=True, fill_value=0, out_shape=out_shape)
                t = src.window_transform(windows.Window(co, ro, w, h))
                sx, sy = arr.shape[2] / w, arr.shape[1] / h
                tr = rasterio.Affine(t.a / sx, t.b, t.c, t.d, t.e / sy, t.f)
                return np.moveaxis(arr.astype(np.uint8), 0, -1), {
                    "crs": str(src.crs), "transform": tuple(tr)[:6], "shape": arr.shape[1:]}
    # fallback: B04/B03/B02 composite with percentile stretch
    bands = []
    meta = None
    for k in ("B04", "B03", "B02"):
        a, m = _read_clipped(assets[k], bbox, max_px=max_px)
        bands.append(_to_reflectance(a))
        meta = meta or m
    stack = np.stack(bands, axis=-1)
    lo, hi = np.nanpercentile(stack, (2, 98))
    rgb = np.clip((stack - lo) / max(1e-6, hi - lo), 0, 1)
    return (np.nan_to_num(rgb, nan=0) * 255).astype(np.uint8), meta


def _reproject_rgb(src: np.ndarray, src_meta: dict, ref_meta: dict, ref_shape: tuple) -> np.ndarray:
    import rasterio.warp
    from rasterio import Affine
    out = np.zeros((ref_shape[0], ref_shape[1], 3), dtype=np.uint8)
    for c in range(3):
        dst = np.zeros(ref_shape, dtype=np.float64)
        rasterio.warp.reproject(
            np.ascontiguousarray(src[:, :, c].astype(np.float64)), dst,
            src_transform=Affine(*src_meta["transform"]), src_crs=src_meta["crs"],
            dst_transform=Affine(*ref_meta["transform"]), dst_crs=ref_meta["crs"],
            resampling=rasterio.warp.Resampling.bilinear, src_nodata=0, dst_nodata=0)
        out[:, :, c] = np.clip(dst, 0, 255).astype(np.uint8)
    return out


def _downscale(rgb: np.ndarray, mask: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    from PIL import Image
    h, w = rgb.shape[:2]
    s = min(1.0, MAX_SIDE / max(h, w))
    if s < 1.0:
        rgb = np.asarray(Image.fromarray(rgb).resize((int(w * s), int(h * s)), Image.BILINEAR))
        m = np.asarray(Image.fromarray((mask > 0).astype(np.uint8) * 255).resize((int(w * s), int(h * s)), Image.NEAREST)).astype(bool)
        return rgb, m
    return rgb, mask.astype(bool)


def build(analysis: dict, out_dir: str | Path, photo_format: str = "png") -> dict[str, Any]:
    """Render before/after/overlay for a stored analysis record.

    photo_format "jpg" saves smaller JPEGs (static export); "png" keeps
    lossless (backend cache). Overlay is always PNG (needs alpha).
    """
    from .geo import bbox_of
    from .vrx1 import indices as IX, change as CH
    result = analysis.get("result") or {}
    if result.get("synthetic"):
        raise ValueError("synthetic demo analysis has no satellite scenes to preview")
    used = result.get("scenes_used") or []
    if len(used) < 2:
        raise ValueError("analysis has no resolvable scene pair")
    base_id = next((s["product_id"] for s in used if s.get("epoch") == "baseline"), used[0]["product_id"])
    recent_id = next((s["product_id"] for s in used if s.get("epoch") == "recent"), used[-1]["product_id"])
    collection = "sentinel-2-l2a"
    b_item = _signed_item(collection, base_id)
    r_item = _signed_item(collection, recent_id)
    bbox = bbox_of(analysis["geometry"])

    rgb_b, mb = _read_rgb({k: a.href for k, a in b_item.assets.items()}, bbox)
    rgb_r_raw, mr = _read_rgb({k: a.href for k, a in r_item.assets.items()}, bbox)
    rgb_r = _reproject_rgb(rgb_r_raw, mr, mb, rgb_b.shape[:2]) if rgb_r_raw.shape[:2] != rgb_b.shape[:2] else rgb_r_raw

    # change mask on the same grid (B04/B08 re-read, baseline grid)
    b4, b4m = _read_clipped(b_item.assets["B04"].href, bbox, max_px=900)
    b8, _ = _read_clipped(b_item.assets["B08"].href, bbox, max_px=900)
    r4, _ = _read_clipped(r_item.assets["B04"].href, bbox, max_px=900)
    r8, r8m = _read_clipped(r_item.assets["B08"].href, bbox, max_px=900)
    ndvi_b = IX.ndvi(_to_reflectance(b8), _to_reflectance(b4))
    ndvi_r = IX.ndvi(_to_reflectance(r8), _to_reflectance(r4))
    if ndvi_r.shape != ndvi_b.shape:
        ndvi_r = _reproject_to(ndvi_r, r8m, ndvi_b, b4m)
    t = dict(result.get("thresholds") or {})
    mask = CH.binary_change(CH.delta(ndvi_r, ndvi_b), float(t.get("ndvi_drop", 0.15)),
                            "decrease", ndvi_b, float(t.get("ndvi_base_min", 0.30)))
    mask &= ~np.isnan(ndvi_b) & ~np.isnan(ndvi_r)
    # resample mask to the RGB grid if read windows differ slightly
    if mask.shape != rgb_b.shape[:2]:
        from PIL import Image
        mask = np.asarray(Image.fromarray((mask > 0).astype(np.uint8) * 255).resize(
            (rgb_b.shape[1], rgb_b.shape[0]), Image.NEAREST)) > 0

    rgb_b, mask = _downscale(rgb_b, mask)
    from PIL import Image
    rgb_r = np.asarray(Image.fromarray(rgb_r).resize((rgb_b.shape[1], rgb_b.shape[0]), Image.BILINEAR))

    ov = np.zeros((rgb_b.shape[0], rgb_b.shape[1], 4), dtype=np.uint8)
    ov[mask] = (255, 30, 30, 130)

    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    ext = ".jpg" if photo_format == "jpg" else ".png"
    bname, aname = f"before{ext}", f"after{ext}"
    if ext == ".jpg":
        Image.fromarray(rgb_b).save(out / bname, quality=72)
        Image.fromarray(rgb_r).save(out / aname, quality=72)
    else:
        Image.fromarray(rgb_b).save(out / bname)
        Image.fromarray(rgb_r).save(out / aname)
    Image.fromarray(ov).save(out / "overlay.png")
    return {"before": bname, "after": aname, "overlay": "overlay.png",
            "width": rgb_b.shape[1], "height": rgb_b.shape[0],
            "changed_px": int(mask.sum()),
            "baseline": base_id, "recent": recent_id}
