"""Build data/protected_sites_bd.json — comprehensive BD protected-site registry.

Sources (all recorded per site, verification status honest):
  1. OpenStreetMap polygons (Overpass, /tmp/bd_pa.json) — real boundary shapes,
     source "OpenStreetMap (reference, pending verification)". ODbL.
  2. Wikipedia coordinates (List of protected areas of Bangladesh) for gazetted
     sites missing OSM geometry — point buffers, source recorded as such.
  3. Curated centroids for a handful of well-known sites with neither.

Water-only designations (dolphin sanctuaries, marine reserves) are EXCLUDED:
NDVI change detection is meaningless over open water and they would all be
GRAY noise. Indian-side features and obvious noise are filtered out.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
OSM = Path("/tmp/bd_pa.json")

# ---------------- Wikipedia gazette overlay ----------------
# name -> (category, division, area_ha, declared)
WIKI = {
    "Bhawal National Park": ("national_park", "Dhaka (Gazipur)", 5022.29, "11 May 1982"),
    "Madhupur National Park": ("national_park", "Dhaka (Tangail)", 8436.13, "4 Feb 1982"),
    "Ramsagar National Park": ("national_park", "Rangpur (Dinajpur)", 27.75, "30 Apr 2001"),
    "Himchari National Park": ("national_park", "Chattogram (Cox's Bazar)", 1729.21, "15 Feb 1980"),
    "Lawachara National Park": ("national_park", "Sylhet (Moulvibazar)", 1250, "7 Jul 1996"),
    "Kaptai National Park": ("national_park", "Chattogram (Rangamati)", 5464.78, "9 Sep 1999"),
    "Nijhum Dwip National Park": ("national_park", "Chattogram (Noakhali)", 16352.23, "8 Apr 2001"),
    "Medhakachhapia National Park": ("national_park", "Chattogram (Cox's Bazar)", 395.92, "4 Apr 2004"),
    "Satchari National Park": ("national_park", "Sylhet (Habiganj)", 242.91, "10 Oct 2005"),
    "Khadim Nagar National Park": ("national_park", "Sylhet (Sylhet)", 678.8, "13 Apr 2006"),
    "Baroiyadhala National Park": ("national_park", "Chattogram (Chattogram)", 2933.61, "6 Apr 2010"),
    "Kuakata National Park": ("national_park", "Barishal (Patuakhali)", 1613, "24 Oct 2010"),
    "Nawabganj National Park": ("national_park", "Rangpur (Dinajpur)", 517.61, "24 Oct 2010"),
    "Singra National Park": ("national_park", "Rangpur (Dinajpur)", 305.69, "4 Oct 2010"),
    "Kadigarh National Park": ("national_park", "Mymensingh (Mymensingh)", 344.13, "24 Oct 2010"),
    "Altadighi National Park": ("national_park", "Rajshahi (Naogaon)", 264.12, "14 Dec 2011"),
    "Birganj National Park": ("national_park", "Rangpur (Dinajpur)", 168.56, "14 Dec 2011"),
    "Sheikh Jamal Inani National Park": ("national_park", "Chattogram (Cox's Bazar)", 7085.16, "15 Apr 2019"),
    "Dharmapur National Park": ("national_park", "Rangpur (Dinajpur)", 704.7, "24 Nov 2021"),
    "Rema-Kalenga Wildlife Sanctuary": ("wildlife_sanctuary", "Sylhet (Habiganj)", 1795.54, "7 Jul 1996"),
    "Char Kukri-Mukri Wildlife Sanctuary": ("wildlife_sanctuary", "Barishal (Bhola)", 40, "19 Dec 1981"),
    "Sundarbans East Wildlife Sanctuary": ("wildlife_sanctuary", "Khulna (Bagerhat)", 122920.90, "1996/2017"),
    "Sundarbans West Wildlife Sanctuary": ("wildlife_sanctuary", "Khulna (Satkhira)", 119718.88, "1996/2017"),
    "Sundarbans South Wildlife Sanctuary": ("wildlife_sanctuary", "Khulna (Khulna)", 75310.30, "1996/2017"),
    "Pablakhali Wildlife Sanctuary": ("wildlife_sanctuary", "Chattogram (CHT)", 42069.37, "20 Sep 1983"),
    "Chunati Wildlife Sanctuary": ("wildlife_sanctuary", "Chattogram (Chattogram)", 7763.97, "18 Mar 1986"),
    "Fasiakhali Wildlife Sanctuary": ("wildlife_sanctuary", "Chattogram (Cox's Bazar)", 1302.42, "11 Apr 2007"),
    "Dudpukuria-Dhopachari Wildlife Sanctuary": ("wildlife_sanctuary", "Chattogram (Chattogram)", 4716.57, "6 Apr 2010"),
    "Hazarikhil Wildlife Sanctuary": ("wildlife_sanctuary", "Chattogram (Chattogram)", 1177.53, "6 Apr 2010"),
    "Sangu Wildlife Sanctuary": ("wildlife_sanctuary", "Chattogram (Bandarban)", 2331.98, "6 Apr 2010"),
    "Teknaf Wildlife Sanctuary": ("wildlife_sanctuary", "Chattogram (Cox's Bazar)", 11614.57, "9 Dec 2009"),
    "Tengragiri Wildlife Sanctuary": ("wildlife_sanctuary", "Barishal (Barguna)", 4048.58, "24 Oct 2010"),
    "Dudmukhi Wildlife Sanctuary": ("wildlife_sanctuary", "Khulna (Bagerhat)", 170, "29 Jan 2012"),
    "Dudhmukhi Wildlife Sanctuary": ("wildlife_sanctuary", "Khulna (Bagerhat)", 170, "29 Jan 2012"),
    "Chadpai Wildlife Sanctuary": ("wildlife_sanctuary", "Khulna (Bagerhat)", 560, "29 Jan 2012"),
    "Dhangmari Wildlife Sanctuary": ("wildlife_sanctuary", "Khulna (Bagerhat)", 340, "29 Jan 2012"),
    "Sonarchar Wildlife Sanctuary": ("wildlife_sanctuary", "Barishal (Patuakhali)", 2026.48, "24 Dec 2011"),
    "Padma Bridge Wildlife Sanctuary": ("wildlife_sanctuary", "Dhaka (Madaripur/Shariatpur)", 11772.61, "26 Nov 2020"),
    "Baishari Bangdepa Wildlife Sanctuary": ("wildlife_sanctuary", "Chattogram (Cox's Bazar)", 2233.06, "16 Apr 2023"),
    "Hail Haor Wildlife Sanctuary": ("wildlife_sanctuary", "Sylhet (Moulvibazar)", 12000, "waterfowl centre"),
    "Tanguar Haor": ("wetland_ramsar", "Sylhet (Sunamganj)", 9727, "Ramsar"),
    "Sundarbans Reserved Forest": ("forest_reserve", "Khulna Division", 601700, "reserved forest"),
}
# Wikipedia point coords for gazetted NPs lacking OSM geometry (lon, lat)
WIKI_PTS = {
    "Kaptai National Park": (92.20111, 22.50222),
    "Dharmapur National Park": (88.547689, 25.539639),
    "Birganj National Park": (88.662552, 25.849129),
}
# Curated centroids where neither OSM nor Wikipedia gives geometry (lon, lat, buf_m)
CURATED = {
    "Rema-Kalenga Wildlife Sanctuary": (91.62, 24.10, 3000),
    "Pablakhali Wildlife Sanctuary": (92.25, 22.95, 8000),
    "Baishari Bangdepa Wildlife Sanctuary": (92.10, 21.40, 3000),
    "Padma Bridge Wildlife Sanctuary": (90.25, 23.35, 8000),
    "Hail Haor Wildlife Sanctuary": (91.68, 24.35, 8000),
    "Tanguar Haor": (91.07, 25.15, 6000),
}
BN_EN = {  # fallback for ways missing name:en
    "সীতাকুন্ড ইকোপার্ক": "Sitakunda Eco Park",
    "মধুটিলা ইকোপার্ক": "Madhutila Eco Park",
    "ডুলাহাজারা সাফারি পার্ক": "Dulahazara Safari Park",
    "গাজীপুর সাফারি পার্ক": "Gazipur Safari Park",
    "বরশীজোড়া ইকোপার্ক": "Borshijora Eco Park",
    "রাজেশপুর ইকোপার্ক": "Rajeshpur Eco Park",
    "টিলাগড় ইকোপার্ক": "Tilaghar Eco Park",
    "জাতীয় উদ্ভিদ উদ্যান": "National Botanical Garden",
}
SKIP_NAMES = {"Dulla Beel", "দক্ষিণ বালাপাড়া ঈদগাহ", "দক্ষিণ বালাপারা ঈদগাহ", "Dampa Tiger Reserve",
              "cluster of trees", "field", "FET Tea Research",
              "Gomati Wildlife Sanctuary", "Sunderban Tiger Reserve",
              "Sunderbans National Park", "সামুদ্রিক রক্ষিত এলাকা",
              "সোয়াচ অফ নো-গ্রাউন্ড সামুদ্রিক রক্ষিত এলাকা",
              "Marine Reserve", "Swatch of No Ground Marine Protected Area"}
# OSM name:en -> Wikipedia gazette name (transliteration variants)
ALIASES = {"Chandpai Wildlife Sanctuary": "Chadpai Wildlife Sanctuary",
           "Nababganj National Park": "Nawabganj National Park",
           "Khadimnagar National Park": "Khadim Nagar National Park",
           "Nijhum Dweep National Park": "Nijhum Dwip National Park",
           "Hajarikhil Wildlife Sanctuary": "Hazarikhil Wildlife Sanctuary",
           "Dudhmukhi Wildlife Sanctuary": "Dudhmukhi Wildlife Sanctuary",
           "Inani National Park": "Sheikh Jamal Inani National Park"}
# substring kills (noise / water-only that slips transliteration)
SKIP_SUB = {"ঈদগাহ", "Dolphin", "ডলফিন", "Marine Reserve", "Swatch of No Ground",
            "সামুদ্রিক"}
ECO_CATS = {"Eco-Park": "eco_park", "Safari Park": "safari_park",
            "Botanical Garden": "botanical_garden"}
SKIP_IDS = set()  # filled below for water-only designations (dolphin/marine)
WATER_ONLY = {"ডলফিন", "Dolphin", "সামুদ্রিক"}


def _in_bd(lon: float, lat: float) -> bool:
    return 87.8 <= lon <= 93.0 and 20.3 <= lat <= 26.8


def main() -> None:
    from shapely.geometry import Polygon, MultiPolygon, mapping, shape
    from shapely.ops import unary_union
    raw = json.loads(OSM.read_text())
    polys: dict[str, list] = {}
    for e in raw.get("elements", []):
        tags = e.get("tags") or {}
        name = tags.get("name:en") or BN_EN.get(tags.get("name", ""), tags.get("name", ""))
        if not name or name in SKIP_NAMES or any(w in name for w in WATER_ONLY | SKIP_SUB):
            continue
        geoms = []
        if e["type"] == "way" and e.get("geometry"):
            pts = [(p["lon"], p["lat"]) for p in e["geometry"]]
            if len(pts) >= 4:
                geoms = [pts]
        elif e["type"] == "relation":
            for m in e.get("members", []):
                if m.get("role") == "outer" and m.get("geometry"):
                    pts = [(p["lon"], p["lat"]) for p in m["geometry"]]
                    if len(pts) >= 4:
                        geoms.append(pts)
        for pts in geoms:
            try:
                pg = Polygon(pts)
                if not pg.is_valid or pg.area == 0:
                    continue
                c = pg.centroid
                if not _in_bd(c.x, c.y):
                    continue
                polys.setdefault(name, []).append(pg)
            except Exception:
                continue

    sites = []
    for name, parts in sorted(polys.items()):
        try:
            u = unary_union(parts)
            if u.is_empty:
                continue
            u = u.simplify(0.002, preserve_topology=True)
            if u.is_empty:
                continue
            gname = ALIASES.get(name, name)
            if any(w in gname or w in name for w in SKIP_SUB):
                continue
            cat, region, area_ha, declared = WIKI.get(gname, ("protected", "Bangladesh", round(u.area * 12321), ""))
            if cat == "protected":
                for suf, c in ECO_CATS.items():
                    if suf in gname:
                        cat = c
                        break
            sites.append({
                "id": "site-" + "".join(c if c.isalnum() else "-" for c in gname.lower()).strip("-")[:40],
                "name": gname, "category": cat, "region": region,
                "geometry": mapping(u),
                "boundary_source": "OpenStreetMap (reference — pending verification, ODbL)",
                "verification": "OSM-REFERENCE",
                "legal_reference": f"Gazette/declaration: {declared}" if declared else "",
                "area_ha_wiki": area_ha, "priority": "high" if name in (
                    "Teknaf Wildlife Sanctuary", "Chunati Wildlife Sanctuary",
                    "Lawachara National Park", "Sundarbans East Wildlife Sanctuary",
                    "Sundarbans West Wildlife Sanctuary", "Sundarbans South Wildlife Sanctuary",
                    "Sundarbans Reserved Forest") else "medium",
                "notes": "OSM community boundary — NOT a Forest Department legal cadastre.",
            })
        except Exception as ex:
            print("skip", name, ex)

    have = {s["name"] for s in sites}

    def circle(lon: float, lat: float, r_m: float) -> dict:
        import math
        dl = r_m / (111320.0 * max(0.2, math.cos(math.radians(lat))))
        da = r_m / 111320.0
        ring = [(lon + dl * math.cos(2 * math.pi * i / 48), lat + da * math.sin(2 * math.pi * i / 48)) for i in range(48)]
        ring.append(ring[0])
        return {"type": "Polygon", "coordinates": [ring]}

    # Wikipedia point buffers for gazetted sites with no OSM geometry
    for name, (lon, lat) in WIKI_PTS.items():
        if name in have:
            continue
        cat, region, area_ha, declared = WIKI[name]
        r = min(8000, max(1500, math.sqrt(area_ha * 10000 / math.pi)))
        sites.append({"id": "site-" + "".join(c if c.isalnum() else "-" for c in name.lower()).strip("-")[:40],
                      "name": name, "category": cat, "region": region, "geometry": circle(lon, lat, r),
                      "boundary_source": "Wikipedia coordinate point-buffer (unverified)",
                      "verification": "POINT-BUFFER", "legal_reference": f"Declaration: {declared}",
                      "area_ha_wiki": area_ha, "priority": "medium",
                      "notes": "Centred on published coordinates — NOT a legal boundary."})
        have.add(name)
    for name, (lon, lat, r) in CURATED.items():
        if name in have:
            continue
        cat, region, area_ha, declared = WIKI.get(name, ("protected", "Bangladesh", 0, ""))
        sites.append({"id": "site-" + "".join(c if c.isalnum() else "-" for c in name.lower()).strip("-")[:40],
                      "name": name, "category": cat, "region": region, "geometry": circle(lon, lat, r),
                      "boundary_source": "Curated centroid buffer (unverified)",
                      "verification": "POINT-BUFFER", "legal_reference": f"Declaration: {declared}",
                      "area_ha_wiki": area_ha, "priority": "medium",
                      "notes": "Approximate location — NOT a legal boundary."})

    out = REPO / "data" / "protected_sites_bd.json"
    out.write_text(json.dumps({"sources": [
        "OpenStreetMap via Overpass API (ODbL) — /tmp/bd_pa.json",
        "Wikipedia: List of protected areas of Bangladesh (CC-BY-SA) — gazette overlay",
        "Curated centroids for 6 sites with no open geometry"],
        "count": len(sites), "sites": sites}, indent=2))
    by_src: dict[str, int] = {}
    for s in sites:
        k = "OSM" if s["verification"] == "OSM-REFERENCE" else "buffer"
        by_src[k] = by_src.get(k, 0) + 1
    print(f"wrote {out}: {len(sites)} sites {by_src}")


if __name__ == "__main__":
    main()
