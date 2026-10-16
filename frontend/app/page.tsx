"use client";
import { useEffect, useState } from "react";
import { api, levelBadge } from "@/lib/api";
import dynamic from "next/dynamic";
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

export default function Overview() {
  const [health, setHealth] = useState<any>(null);
  const [sites, setSites] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setHealth(await api("/api/health"));
        setSites((await api<any>("/api/sites")).sites);
        setAlerts((await api<any>("/api/alerts")).alerts);
      } catch (e: any) { setErr(e.message); }
    })();
  }, []);

  const red = alerts.filter((a) => a.level === "RED").length;
  const pending = alerts.filter((a) => (a.review_status || "UNVERIFIED") === "UNVERIFIED").length;
  const geojson = { type: "FeatureCollection", features: sites.map((s) => ({ type: "Feature", properties: { name: s.name }, geometry: s.geometry })) };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Overview</h2>
      {err && <div className="card text-red-700">Backend unreachable: {err}. Start API on :8000 or set NEXT_PUBLIC_API_URL.</div>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[["Sites", sites.length], ["Alerts", alerts.length], ["High priority (RED)", red], ["Unverified", pending]].map(([k, v]) => (
          <div key={k as string} className="card"><p className="text-xs text-neutral-500">{k}</p><p className="text-2xl font-bold">{v as number}</p></div>
        ))}
      </div>
      <div className="card">
        <h3 className="font-semibold mb-2">Monitoring map</h3>
        <MapView geojson={geojson} />
      </div>
      <div className="card">
        <h3 className="font-semibold mb-2">Recent alerts</h3>
        {alerts.slice(0, 8).map((a) => (
          <div key={a.id} className="flex justify-between border-b py-1 text-sm">
            <span>{a.id} · {a.level} · {a.total_ha?.toFixed?.(2)} ha</span>
            <span className={levelBadge(a.level)}>{a.level}</span>
          </div>
        ))}
        {alerts.length === 0 && <p className="text-sm text-neutral-500">No alerts yet — run an analysis from Manual Inspection.</p>}
      </div>
      {health && <p className="text-xs text-neutral-500">API: {health.service} · {health.algo} · db={health.db}</p>}
    </div>
  );
}
