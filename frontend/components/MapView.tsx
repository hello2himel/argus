"use client";
import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export default function MapView({ geojson, height = 420 }: { geojson?: any; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: "https://demotiles.maplibre.org/style.json",
      center: [90.35, 23.83],
      zoom: 7,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
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
      <p className="text-xs text-neutral-500 mt-1">Basemap © OpenStreetMap contributors © CARTO. Site polygons: demo-only, not legal cadastre.</p>
    </div>
  );
}
