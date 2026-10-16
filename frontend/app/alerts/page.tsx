"use client";
import { useEffect, useState } from "react";
import { api, levelBadge } from "@/lib/api";
import { siteCenter } from "@/lib/maps";
import AlertDrawer from "@/components/AlertDrawer";
import OpenInMaps from "@/components/OpenInMaps";

export default function Alerts() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [fPri, setFPri] = useState("all");
  const [fSite, setFSite] = useState("all");
  const [fRev, setFRev] = useState("all");
  const [open, setOpen] = useState<string | null>(null);

  const load = async () => {
    const [a, s] = await Promise.all([api<any>("/api/alerts"), api<any>("/api/sites")]);
    setAlerts(a.alerts); setSites(s.sites);
  };
  useEffect(() => { load(); }, []);
  const siteName = (id: string) => sites.find((s) => s.id === id)?.name || id;
  const siteGeom = (id: string) => sites.find((s) => s.id === id)?.geometry;
  const list = alerts.filter((a) =>
    (fPri === "all" || a.level === fPri) &&
    (fSite === "all" || a.site_id === fSite) &&
    (fRev === "all" || (a.review_status || "UNVERIFIED") === fRev));

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Alerts</h2>
      <p className="text-sm text-neutral-600">Algorithm priority and human review status are separate. Nothing here names a person or building as unlawful.</p>
      <div className="card grid grid-cols-2 md:grid-cols-3 gap-2">
        <label className="text-sm">Priority<select className="input" value={fPri} onChange={(e) => setFPri(e.target.value)}>
          <option value="all">All priorities</option><option value="RED">High priority</option><option value="AMBER">Possible disturbance</option><option value="GREEN">No change</option><option value="GRAY">Insufficient data</option></select></label>
        <label className="text-sm">Site<select className="input" value={fSite} onChange={(e) => setFSite(e.target.value)}>
          <option value="all">All sites</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="text-sm">Review<select className="input" value={fRev} onChange={(e) => setFRev(e.target.value)}>
          <option value="all">All statuses</option><option value="UNVERIFIED">Unverified</option><option value="UNDER_REVIEW">Under review</option><option value="CONFIRMED_DISTURBANCE">Confirmed disturbance</option><option value="DISMISSED">Dismissed</option><option value="REQUIRES_FIELD_INSPECTION">Requires field inspection</option></select></label>
      </div>
      <div className="card divide-y">
        <div className="hidden md:grid grid-cols-[130px_1fr_90px_200px_100px] gap-3 px-2 py-1 text-xs uppercase text-neutral-500"><span>Priority</span><span>Site</span><span>Area</span><span>Review</span><span>Created</span></div>
        {list.map((a) => {
          const c = siteCenter(siteGeom(a.site_id));
          return (
            <div key={a.id} className="border-b">
              <button className="w-full text-left grid md:grid-cols-[130px_1fr_90px_200px_100px] gap-1 md:gap-3 px-2 py-2 hover:bg-neutral-50 text-sm" onClick={() => setOpen(a.id)}>
                <span className={levelBadge(a.level)}>{a.level}</span>
                <span><b>{siteName(a.site_id)}</b> <span className="text-neutral-500 font-mono text-xs">{a.id}{a.synthetic ? " · synthetic" : " · real"}</span></span>
                <span className="font-mono">{a.total_ha != null ? `${Number(a.total_ha).toFixed(1)} ha` : "—"}</span>
                <span className="badge-gray">{a.review_status}</span>
                <span className="text-neutral-500 text-xs">{a.created_at?.slice(0, 10)}</span>
              </button>
              {c && <div className="px-2 pb-2"><OpenInMaps lat={c.lat} lon={c.lon} /></div>}
            </div>
          );
        })}
        {list.length === 0 && <p className="text-sm text-neutral-500 p-2">No alerts match these filters.</p>}
      </div>
      <AlertDrawer alertId={open} onClose={() => setOpen(null)} onChanged={load} />
    </div>
  );
}
