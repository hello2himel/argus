"use client";
import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export default function MapView({ geojson, height = 420, onSiteClick }: { geojson?: any; height?: number; onSiteClick?: (siteId: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const clickRef = useRef(onSiteClick);
  clickRef.current = onSiteClick;

  const esc = (s: any) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      // Esri World Imagery: free, keyless satellite basemap (verified reachable).
      style: {
        version: 8,
        sources: {
          "esri-sat": {
            type: "raster",
            tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
            tileSize: 256,
            attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
          },
        },
        layers: [{ id: "sat", type: "raster", source: "esri-sat" }],
      } as any,
      center: [90.35, 23.83],
      zoom: 7,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
    map.on("mousemove", "argus-fill", (e) => {
      const f = e.features?.[0] as any;
      if (!f) return;
      const p = f.properties || {};
      map.getCanvas().style.cursor = "pointer";
      popup.setLngLat(e.lngLat).setHTML(
        `<div style="font:13px system-ui"><b>${esc(p.name)}</b><br>` +
        `<span style="color:#555">${esc(p.category || "")}${p.level ? " · " + esc(p.level) : ""}${p.area ? " · " + esc(p.area) + " ha" : ""}</span></div>`
      ).addTo(map);
    });
    map.on("mouseleave", "argus-fill", () => { popup.remove(); map.getCanvas().style.cursor = ""; });
    map.on("click", "argus-fill", (e) => {
      const id = (e.features?.[0]?.properties as any)?.siteId;
      if (id && clickRef.current) clickRef.current(id);
    });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geojson) return;
    const draw = () => {
      const src = map.getSource("argus") as maplibregl.GeoJSONSource | undefined;
      if (src) src.setData(geojson);
      else {
        map.addSource("argus", { type: "geojson", data: geojson });
        map.addLayer({ id: "argus-fill", type: "fill", source: "argus", paint: { "fill-opacity": 0.25 } });
        map.addLayer({ id: "argus-line", type: "line", source: "argus", paint: { "line-width": 2 } });
      }
    };
    if (map.loaded()) draw();
    else map.once("load", draw);
  }, [geojson]);

  return (
    <div>
      <div ref={ref} style={{ height }} className="rounded-xl overflow-hidden border" />
      <p className="text-xs text-neutral-500 mt-1">Satellite basemap © Esri, Maxar, Earthstar Geographics. Site polygons: demo-only, not legal cadastre.</p>
    </div>
  );
}
