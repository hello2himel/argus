"""Append MAJOR Bangladesh riverbank corridors to data/protected_sites_bd.json.

Strict allowlist of major BD rivers (EN + BN). OSM waterway=river centerlines
(/tmp/bd_rivers.json) are normalized (strip River/Nadi/নদী suffixes), mapped
through BN_EN, kept only if allowlisted, clipped to the BD bbox, buffered
400 m each side in UTM. A waterline is NOT a legal boundary.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
RIVERS = Path("/tmp/bd_rivers.json")
REG = REPO / "data/protected_sites_bd.json"

MIN_LEN_KM = 10.0
BUF_M = 400.0
VULNERABLE = {"Buriganga", "Turag", "Balu", "Bangshi", "Ichamati", "Kaliganga",
              "Dakatia", "Naf", "Karnaphuli", "Shitalakshya", "Kushiyara",
              "Surma", "Halda", "Sangu", "Buriganga-Turag"}
ALLOW = {
    "Buriganga", "Turag", "Shitalakshya", "Balu", "Dhaleshwari", "Bangshi",
    "Arial Khan", "Ichamati", "Padma", "Meghna", "Jamuna", "Old Brahmaputra",
    "Brahmaputra", "Teesta", "Surma", "Kushiyara", "Karnaphuli", "Halda",
    "Sangu", "Matamuhuri", "Naf", "Feni", "Muhuri", "Rupsha", "Pasur",
    "Gorai", "Madhumati", "Bhairab", "Kopotaksha", "Chitra", "Nabaganga",
    "Kumar", "Kaliganga", "Dakatia", "Gomti", "Titas", "Karatoya", "Atrai",
    "Mahananda", "Baral", "Khowai", "Manu", "Dhalai", "Someshwari", "Kangsa",
    "Dhanu", "Ghaghat", "Hurasagar", "Dharla", "Dudhkumar", "Jamuneshwari",
    "Narsunda", "Begboti", "Haraboti", "Tulshi Ganga", "Baral", "Chandana",
    "Kankai", "Shivnalini", "Old Brahmaputra",
}
BN_EN = {
    "বুড়িগঙ্গা": "Buriganga", "বুড়িগঙ্গা নদী": "Buriganga", "তুরাগ": "Turag",
    "তুরাগ নদী": "Turag", "শীতলক্ষ্যা": "Shitalakshya", "শীতলক্ষা": "Shitalakshya",
    "বালু": "Balu", "বালু নদী": "Balu", "ধলেশ্বরী": "Dhaleshwari",
    "পদ্মা": "Padma", "পদ্মা নদী": "Padma", "মেঘনা": "Meghna",
    "মেঘনা নদী": "Meghna", "যমুনা": "Jamuna", "ব্রহ্মপুত্র": "Brahmaputra",
    "পুরাতন ব্রহ্মপুত্র": "Old Brahmaputra", "তিস্তা": "Teesta", "সুরমা": "Surma",
    "কুশিয়ারা": "Kushiyara", "কর্ণফুলী": "Karnaphuli", "কর্ণফুলি": "Karnaphuli",
    "হালদা": "Halda", "সাঙ্গু": "Sangu", "মাতামুহুরী": "Matamuhuri",
    "নাফ": "Naf", "নাফ নদী": "Naf", "ফেনী": "Feni", "মুহুরী": "Muhuri",
    "রূপসা": "Rupsha", "পসুর": "Pasur", "পশুর": "Pasur", "গড়াই": "Gorai",
    "বংশী": "Bangshi", "আড়িয়াল খাঁ": "Arial Khan", "ইছামতী": "Ichamati",
    "মধুমতী": "Madhumati", "কপোতাক্ষ": "Kopotaksha", "চিত্রা": "Chitra",
    "নবগঙ্গা": "Nabaganga", "কুমার": "Kumar", "কালীগঙ্গা": "Kaliganga",
    "ডাকাতিয়া": "Dakatia", "গোমতী": "Gomti", "তিতাস": "Titas",
    "করতোয়া": "Karatoya", "আত্রাই": "Atrai", "মহানন্দা": "Mahananda",
    "বরাল": "Baral", "খোয়াই": "Khowai", "মনু": "Manu", "ধলাই": "Dhalai",
    "সোমেশ্বরী": "Someshwari", "কংস": "Kangsa", "বুড়ি তিস্তা": "Dudhkumar",
    "বুড়ি তিস্তা নদী": "Dudhkumar", "বুড়ী তিস্তা": "Dudhkumar",
    "বুড়ী তিস্তা নদী": "Dudhkumar", "নরসুন্দা": "Narsunda",
    "বেগবতী": "Begboti", "হराबতী": "Haraboti", "হারাবতি": "Haraboti",
    "তুলশী গঙ্গা": "Tulshi Ganga", "চন্দনা": "Chandana",
    "ধলা": "Dhalai", "ঘাঘট": "Ghaghat", "হুরাসাগর": "Hurasagar",
    "যমুনেশ্বরী": "Jamuneshwari", "ডাকাতিয়া": "Dakatia",
}
SUFFIX = re.compile(r"\s*(river|nadi|নদী|nod|khal|খাল|canal)\s*$", re.IGNORECASE)
# OSM spelling variants -> canonical
VARIANTS = {
    "Arial Kha": "Arial Khan", "Ariāl Khan": "Arial Khan",
    "Bongshai": "Bangshi", "Bongshi": "Bangshi",
    "Ichhamoti": "Ichamati", "Old Bhramaputra": "Old Brahmaputra",
    "Gorai-Madhumati": "Gorai", "Dhaleswari": "Dhaleshwari",
    "Shitalakshya": "Shitalakshya", "Sitalakshya": "Shitalakshya",
    "Pashur": "Pasur", "Karnafuli": "Karnaphuli",
}
# Curated courses where OSM has no usable river line (lon,lat waypoints)
CURATED_RIVERS = {
    "Shitalakshya": [(90.75, 24.05), (90.72, 23.95), (90.70, 23.85), (90.62, 23.72), (90.58, 23.65), (90.51, 23.62)],
    "Pasur": [(89.57, 22.82), (89.56, 22.65), (89.59, 22.48), (89.56, 22.30), (89.50, 22.05)],
}


def norm(raw: str) -> str:
    s = (raw or "").strip()
    s = SUFFIX.sub("", s).strip(" -")
    s = re.sub(r"\s+", " ", s)
    if s in BN_EN:
        return BN_EN[s]
    t = s.title()
    if t in BN_EN:
        return BN_EN[t]
    if t in VARIANTS:
        return VARIANTS[t]
    return t


def main() -> None:
    import geopandas as gpd
    from shapely.geometry import LineString, box, mapping
    raw = json.loads(RIVERS.read_text())["elements"]
    groups: dict[str, list] = {}
    for e in raw:
        tags = e.get("tags") or {}
        cand = tags.get("name:en") or tags.get("name", "")
        name = norm(cand) if not tags.get("name:en") else norm(tags.get("name:en", ""))
        if not name or name not in ALLOW:
            continue
        lines = []
        if e["type"] == "way" and e.get("geometry"):
            pts = [(p["lon"], p["lat"]) for p in e["geometry"]]
            if len(pts) >= 2:
                lines = [pts]
        elif e["type"] == "relation":
            for m in e.get("members", []):
                if m.get("geometry") and len(m["geometry"]) >= 2:
                    lines.append([(p["lon"], p["lat"]) for p in m["geometry"]])
        if lines:
            groups.setdefault(name, []).extend(lines)
    print(f"allowlisted groups: {sorted(groups)}", flush=True)

    reg = json.loads(REG.read_text())
    have = {s["name"] for s in reg["sites"]}
    bd = box(88.0, 20.3, 92.8, 26.9)
    added = 0
    def add_site(name: str, poly, km: float, src_note: str):
        nonlocal added
        sname = f"{name} River corridor"
        if sname in have:
            return
        c = poly.centroid
        reg["sites"].append({
            "id": "site-" + "".join(c if c.isalnum() else "-" for c in (name.lower() + "-river")).strip("-")[:40],
            "name": sname, "category": "river_buffer",
            "region": f"Bangladesh ({c.y:.2f}N, {c.x:.2f}E)",
            "geometry": mapping(poly),
            "boundary_source": src_note,
            "verification": "CURATED-COURSE" if src_note.startswith("Curated") else "OSM-REFERENCE",
            "legal_reference": "Waterline is not the legal boundary. CS/RS + BWDB foreshore records required (Writ 3503/2009).",
            "area_ha_wiki": 0, "priority": "high" if name in VULNERABLE else "medium",
            "notes": f"~{km:.0f} km of mapped BD-reach centerline. Seasonal migration, erosion and chars shift the observed channel.",
        })
        have.add(sname)
        added += 1
        print(f"+ {sname} ~{km:.0f}km", flush=True)
    for name in sorted(groups):
        try:
            g = gpd.GeoSeries([LineString(p) for p in groups[name]], crs="EPSG:4326").to_crs("EPSG:32646")
            g = g.intersection(gpd.GeoSeries([bd], crs="EPSG:4326").to_crs("EPSG:32646").iloc[0])
            g = g[~g.is_empty]
            if len(g) == 0:
                continue
            km = float(g.length.sum() / 1000.0)
        except Exception:
            continue
        if km < MIN_LEN_KM and name not in VULNERABLE:
            print(f"skip {name} ({km:.0f}km, short)", flush=True)
            continue
        try:
            poly = g.buffer(BUF_M).union_all().simplify(100)
            if poly.is_empty:
                continue
            poly = gpd.GeoSeries([poly], crs="EPSG:32646").to_crs("EPSG:4326").iloc[0]
        except Exception as ex:
            print("buffer fail", name, str(ex)[:100])
            continue
        sname = f"{name} River corridor"
        if sname in have:
            continue
        c = poly.centroid
        add_site(name, poly, km,
                 "OpenStreetMap waterway centerline, BD reach, buffered 400 m (reference — NOT legal, ODbL)")
    for name, pts in CURATED_RIVERS.items():
        try:
            from shapely.geometry import LineString
            g = gpd.GeoSeries([LineString(pts)], crs="EPSG:4326").to_crs("EPSG:32646")
            km = float(g.length.sum() / 1000.0)
            poly = gpd.GeoSeries([g.buffer(BUF_M).union_all().simplify(100)], crs="EPSG:32646").to_crs("EPSG:4326").iloc[0]
            if poly.is_empty:
                continue
            add_site(name, poly, km, "Curated course waypoints (unverified — NOT legal)")
        except Exception as ex:
            print("curated fail", name, str(ex)[:100])
    reg["count"] = len(reg["sites"])
    REG.write_text(json.dumps(reg))
    print(f"appended {added}; registry now {reg['count']}")


if __name__ == "__main__":
    main()
