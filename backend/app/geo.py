"""Geometry helpers: validation, buffers, areas. Pure shapely."""
from __future__ import annotations

from shapely.geometry import shape, mapping, Point
from shapely.validation import make_valid


def validate_lon_lat(lon: float, lat: float) -> tuple[float, float]:
    try:
        lo, la = float(lon), float(lat)
    except (TypeError, ValueError):
        raise ValueError("longitude/latitude must be numbers")
    if not (-180.0 <= lo <= 180.0):
        raise ValueError(f"longitude {lo} out of range [-180,180]")
    if not (-90.0 <= la <= 90.0):
        raise ValueError(f"latitude {la} out of range [-90,90]")
    return lo, la


def validate_geojson_polygon(geom: dict) -> dict:
    if not isinstance(geom, dict) or geom.get("type") not in ("Polygon", "MultiPolygon"):
        raise ValueError("geometry must be a GeoJSON Polygon or MultiPolygon")
    try:
        shp = shape(geom)
    except Exception as e:
        raise ValueError(f"invalid geometry: {e}")
    if shp.is_empty:
        raise ValueError("geometry is empty")
    if not shp.is_valid:
        shp = make_valid(shp)
        if not shp.is_valid:
            raise ValueError("geometry is not valid (self-intersection?)")
    # Bangladesh sanity: warn if wildly outside BD bbox (not reject — manual global checks allowed)
    return mapping(shp)


def buffer_point(lon: float, lat: float, radius_m: float) -> dict:
    """Approx circular polygon around lon/lat. Equirectangular approx, fine for small radii."""
    import math
    lo, la = validate_lon_lat(lon, lat)
    if not (10 <= float(radius_m) <= 20000):
        raise ValueError("radius_m must be within [10, 20000]")
    r = float(radius_m)
    deg_lat = r / 111320.0
    deg_lon = r / (111320.0 * max(0.2, math.cos(math.radians(la))))
    pt = Point(lo, la)
    # project to meters-ish, buffer, project back
    coords = []
    for i in range(48):
        a = 2 * math.pi * i / 48
        coords.append((lo + deg_lon * math.cos(a), la + deg_lat * math.sin(a)))
    coords.append(coords[0])
    return {"type": "Polygon", "coordinates": [coords]}


def bbox_of(geom: dict, pad_deg: float = 0.005) -> tuple[float, float, float, float]:
    shp = shape(geom)
    x0, y0, x1, y1 = shp.bounds
    return (x0 - pad_deg, y0 - pad_deg, x1 + pad_deg, y1 + pad_deg)
