// External map providers + per-site center. Preference is local-only.
export const MAP_PROVIDERS = {
  osm: {
    name: "OpenStreetMap",
    url: (la: number, lo: number, z: number) =>
      `https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}#map=${z}/${la}/${lo}`,
  },
  google: {
    name: "Google Maps",
    url: (la: number, lo: number) =>
      `https://www.google.com/maps/search/?api=1&query=${la},${lo}`,
  },
  apple: {
    name: "Apple Maps",
    url: (la: number, lo: number, z: number) =>
      `https://maps.apple.com/?q=${la},${lo}&z=${z}`,
  },
  bing: {
    name: "Bing Maps",
    url: (la: number, lo: number, z: number) =>
      `https://www.bing.com/maps?cp=${la}~${lo}&lvl=${z}`,
  },
  esri: {
    name: "Esri / ArcGIS",
    url: (la: number, lo: number, z: number) =>
      `https://www.arcgis.com/home/webmap/viewer.html?center=${lo},${la}&level=${z}`,
  },
  geohack: {
    name: "GeoHack",
    url: (la: number, lo: number) =>
      `https://geohack.toolforge.org/geohack.php?params=${la}_N_${lo}_E`,
  },
} as const;

export type MapProviderId = keyof typeof MAP_PROVIDERS;

export function getMapProvider(): MapProviderId {
  if (typeof window === "undefined") return "osm";
  const p = window.localStorage.getItem("argus-maps-provider");
  return p && p in MAP_PROVIDERS ? (p as MapProviderId) : "osm";
}

export function setMapProvider(p: MapProviderId) {
  window.localStorage.setItem("argus-maps-provider", p);
}

export function mapsUrl(lat: number, lon: number, zoom = 14, provider?: MapProviderId) {
  const id = provider || getMapProvider();
  return { id, name: MAP_PROVIDERS[id].name, url: MAP_PROVIDERS[id].url(lat, lon, zoom) };
}

/** Bounding-box center of a GeoJSON Polygon/MultiPolygon — robust for odd shapes. */
export function siteCenter(geom: any): { lat: number; lon: number } | null {
  try {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const walk = (c: any) => {
      if (typeof c[0] === "number") {
        x0 = Math.min(x0, c[0]); y0 = Math.min(y0, c[1]);
        x1 = Math.max(x1, c[0]); y1 = Math.max(y1, c[1]);
      } else c.forEach(walk);
    };
    walk(geom.coordinates);
    if (x0 > x1) return null;
    return { lon: (x0 + x1) / 2, lat: (y0 + y1) / 2 };
  } catch {
    return null;
  }
}
