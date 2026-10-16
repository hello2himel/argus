"use client";
import { useEffect, useState } from "react";
import { api, levelBadge } from "@/lib/api";
import { siteCenter } from "@/lib/maps";
import OpenInMaps from "@/components/OpenInMaps";
import ThemeToggle from "@/components/ThemeToggle";
import dynamic from "next/dynamic";
import AlertDrawer from "@/components/AlertDrawer";
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

export default function Overview() {
  const [health, setHealth] = useState<any>(null);
  const [sites, setSites] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [layers, setLayers] = useState({ bounds: true, alerts: true });
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const load = async () => {
    setHealth(await api("/api/health"));
    setSites((await api<any>("/api/sites")).sites);
    setAlerts((await api<any>("/api/alerts")).alerts);
    setRuns((await api<any>("/api/analysis-history?limit=4")).analyses || (await api<any>("/api/analysis-history")).analyses);
  };
  useEffect(() => { load().catch((e) => setErr(e.message)); }, []);

  const openAlerts = alerts.filter((a) => ["UNVERIFIED", "UNDER_REVIEW", "REQUIRES_FIELD_INSPECTION"].includes(a.review_status || "UNVERIFIED"));
  const red = openAlerts.filter((a) => a.level === "RED").length;
  const gray = alerts.filter((a) => a.level === "GRAY").length;
  const siteName = (id: string) => sites.find((s) => s.id === id)?.name || id || "manual";
  const alertFor = (siteId: string) => [...alerts].reverse().find((a) => a.site_id === siteId);
  const geojson = {
    type: "FeatureCollection",
    features: sites.map((s) => {
      const a = alertFor(s.id);
      return {
        type: "Feature",
        properties: {
          siteId: s.id, name: s.name, category: s.category,
          level: a?.level, area: a?.total_ha != null ? Number(a.total_ha).toFixed(1) : undefined,
        },
        geometry: s.geometry,
      };
    }),
  };
  const needs = [...openAlerts].sort((a, b) => (a.level === "RED" ? 0 : 1) - (b.level === "RED" ? 0 : 1)).slice(0, 4);
  const dist = ["RED", "AMBER", "GREEN", "GRAY"].map((l) => ({ l, n: alerts.filter((a) => a.level === l).length }));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-end flex-wrap gap-2">
        <div><h2 className="text-2xl font-bold">Overview</h2><p className="text-sm text-neutral-500">Counts are calculated from the records below.</p></div>
        <div className="flex gap-2"><ThemeToggle /><a className="btn" href="/inspect"><i aria-hidden className="ri-add-line"></i> New inspection</a></div>
      </div>
      {err && <div className="card text-red-700">Backend unreachable: {err}.</div>}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[["Registered sites", sites.length, ""], ["Analyses run", runs.length, ""], ["Pending alerts", openAlerts.length, ""], ["High-priority, open", red, "text-red-700"], ["Insufficient imagery", gray, "text-neutral-500"]].map(([k, v, c]) => (
          <div key={k as string} className="card"><p className="text-xs text-neutral-500">{k}</p><p className={`text-2xl font-bold font-mono ${c}`}>{v as number}</p></div>
        ))}
      </div>
      <div className="grid md:grid-cols-[1.5fr_1fr] gap-4 items-start">
        <div className="card">
          <div className="flex justify-between items-center mb-2"><h3 className="font-semibold">Monitoring map</h3>
            <div className="flex gap-3 text-sm text-neutral-600">
              <label><input type="checkbox" checked={layers.bounds} onChange={(e) => setLayers({ ...layers, bounds: e.target.checked })} /> Boundaries</label>
              <label><input type="checkbox" checked={layers.alerts} onChange={(e) => setLayers({ ...layers, alerts: e.target.checked })} /> Alerts</label>
            </div>
          </div>
          <MapView
            geojson={layers.bounds ? geojson : { type: "FeatureCollection", features: [] }}
            onSiteClick={(siteId) => { const a = alertFor(siteId); if (a) setOpen(a.id); }}
          />
          <p className="text-xs text-neutral-500 mt-1">● High priority ● Possible disturbance ● Insufficient — schematic polygons, not survey boundaries.</p>
        </div>
        <div className="space-y-4">
          <div className="card">
            <h3 className="font-semibold mb-2">Needs attention</h3>
            {needs.map((a) => (
              <div key={a.id} className="border-b py-2">
                <button className="w-full text-left flex gap-2 items-center text-sm hover:bg-neutral-50" onClick={() => setOpen(a.id)}>
                  <span className={levelBadge(a.level)}>{a.level}</span>
                  <span className="flex-1"><b>{siteName(a.site_id)}</b><br /><span className="text-neutral-500 text-xs">{a.id} · {a.total_ha != null ? `${Number(a.total_ha).toFixed(1)} ha` : "—"}</span></span>
                  <span className="badge-gray">{a.review_status}</span>
                </button>
                {(() => { const g = sites.find((s) => s.id === a.site_id)?.geometry; const c = g ? siteCenter(g) : null; return c ? <span className="ml-1"><OpenInMaps lat={c.lat} lon={c.lon} /></span> : null; })()}
              </div>
            ))}
            {needs.length === 0 && <p className="text-sm text-neutral-500">Nothing pending.</p>}
          </div>
          <div className="card">
            <h3 className="font-semibold mb-1">Alert distribution</h3>
            <div className="distbar">{dist.map((d) => d.n > 0 && <span key={d.l} className={`seg-${d.l.toLowerCase()}`} style={{ width: `${(d.n / Math.max(1, alerts.length)) * 100}%` }} />)}</div>
            <p className="text-xs text-neutral-500 mt-1">Green does not certify compliance. Gray means the site could not be assessed.</p>
          </div>
        </div>
      </div>
      <div className="card">
        <h3 className="font-semibold mb-2">Recent analysis activity</h3>
        {runs.slice(0, 4).map((r: any) => (
          <div key={r.id} className="flex justify-between text-sm border-b py-1"><span>{r.id} · {siteName(r.site_id)} · {r.result?.provider || ""} · {r.result?.n_baseline_scenes ?? "?"} / {r.result?.n_recent_scenes ?? "?"} scenes</span><span className={levelBadge(r.result?.level || "GRAY")}>{r.result?.level || r.status}</span></div>
        ))}
        {runs.length === 0 && <p className="text-sm text-neutral-500">No runs yet.</p>}
      </div>
      {health && <p className="text-xs text-neutral-500">API: {health.service} · {health.algo} · db={health.db}</p>}
      <AlertDrawer alertId={open} onClose={() => setOpen(null)} onChanged={load} />
    </div>
  );
}
