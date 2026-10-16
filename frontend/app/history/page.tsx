"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
export default function History() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { api<any>("/api/analysis-history?limit=50").then((r) => setRows(r.analyses)).catch(() => {}); }, []);
  return (
    <div className="space-y-4"><h2 className="text-2xl font-bold">Analysis History</h2>
      <p className="text-sm text-neutral-600">Every run with provider, scene counts and outcome. Failed and insufficient-data runs are kept so gaps stay visible.</p>
      <div className="card overflow-auto"><table className="w-full text-sm">
        <thead><tr className="text-left text-xs uppercase text-neutral-500"><th className="p-2">Run</th><th className="p-2">Location</th><th className="p-2">Provider</th><th className="p-2">Scenes b/r</th><th className="p-2">Outcome</th><th className="p-2">Error</th></tr></thead>
        <tbody>{rows.map((r: any) => (
          <tr key={r.id} className="border-t"><td className="p-2 font-mono">{r.id}</td><td className="p-2">{r.site_id || "manual"}</td>
            <td className="p-2">{r.result?.provider || "—"}</td><td className="p-2 font-mono">{r.result ? `${r.result.n_baseline_scenes ?? "?"} / ${r.result.n_recent_scenes ?? "?"}` : "—"}</td>
            <td className="p-2">{r.result?.level || r.status}{r.result?.synthetic ? " · synthetic" : " · real"}</td>
            <td className="p-2 text-xs text-neutral-500">{r.error || r.result?.explanation?.slice(0, 120) || ""}</td></tr>
        ))}</tbody></table>
        {rows.length === 0 && <p className="text-sm text-neutral-500 p-2">Empty.</p>}</div>
    </div>
  );
}
