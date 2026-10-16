"use client";
import { useEffect, useState } from "react";
import { api, levelBadge } from "@/lib/api";

export default function Alerts() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [filter, setFilter] = useState("");
  const load = async () => setAlerts((await api<any>(`/api/alerts${filter ? `?level=${filter}` : ""}`)).alerts);
  useEffect(() => { load(); }, []);
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Alerts</h2>
      <div className="card flex gap-2 items-center">
        <select className="input max-w-xs" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All levels</option><option value="RED">RED</option><option value="AMBER">AMBER</option><option value="GREEN">GREEN</option><option value="GRAY">GRAY</option>
        </select>
        <button className="btn" onClick={load}>Filter</button>
      </div>
      {alerts.map((a) => (
        <div key={a.id} className="card text-sm space-y-1">
          <p><b>{a.id}</b> <span className={levelBadge(a.level)}>{a.level}</span> <span className="badge-gray">{a.review_status}</span> {a.synthetic && <span className="badge-gray">synthetic</span>}</p>
          <p>{a.explanation}</p>
          <p className="text-neutral-500">{a.total_ha?.toFixed?.(3)} ha · {a.provider} · analysis {a.analysis_id}</p>
          <div className="flex gap-2">
            {["UNDER_REVIEW", "CONFIRMED_DISTURBANCE", "DISMISSED", "REQUIRES_FIELD_INSPECTION"].map((s) => (
              <button key={s} className="text-xs border rounded px-2 py-1" onClick={async () => { await api(`/api/alerts/${a.id}/review`, { method: "PATCH", body: JSON.stringify({ status: s, note: "reviewed from UI" }) }); load(); }}>{s}</button>
            ))}
          </div>
        </div>
      ))}
      {alerts.length === 0 && <p className="text-sm text-neutral-500">No alerts.</p>}
    </div>
  );
}
