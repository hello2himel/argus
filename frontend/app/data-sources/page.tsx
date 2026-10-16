"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
export default function Sources() {
  const [s, setS] = useState<any>(null);
  useEffect(() => { api<any>("/api/data-sources/status").then(setS).catch(() => {}); }, []);
  return (
    <div className="space-y-4"><h2 className="text-2xl font-bold">Data Sources</h2>
      <div className="card text-sm space-y-1">
        <p><b>Primary:</b> Sentinel-2 L2A via Microsoft Planetary Computer STAC (free, 10m). No key needed for search; blob reads auto-SAS.</p>
        <p><b>Complement:</b> Sentinel-1 SAR (cloudy periods), Landsat 8/9 (history).</p>
        <p><b>Boundaries:</b> Bangladesh Forest Dept / MoEFCC / BWDB authoritative; Protected Planet + OSM reference only. River waterline ≠ legal boundary.</p>
        <p><b>Limit:</b> 10m pixels ≈ 100 m²; reliable only for ≥0.5 ha contiguous change. See docs/LIMITATIONS.md.</p>
      </div>
      <pre className="card text-xs overflow-auto">{JSON.stringify(s, null, 2) || "loading…"}</pre>
    </div>
  );
}
