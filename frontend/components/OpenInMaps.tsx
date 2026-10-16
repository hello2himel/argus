"use client";
import { mapsUrl, getMapProvider } from "@/lib/maps";
import { useState } from "react";

export default function OpenInMaps({ lat, lon, zoom = 14 }: { lat: number; lon: number; zoom?: number }) {
  const [pref] = useState(getMapProvider);
  const m = mapsUrl(lat, lon, zoom, pref);
  return (
    <a className="text-xs border rounded px-2 py-1 inline-block" href={m.url} target="_blank" rel="noopener noreferrer" title={`Open ${lat.toFixed(4)}, ${lon.toFixed(4)} in ${m.name} (change provider under Settings)`}>
      <i aria-hidden className="ri-map-pin-line"></i> Open in {m.name}
    </a>
  );
}
