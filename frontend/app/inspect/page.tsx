"use client";
import { useState } from "react";
import { api, levelBadge } from "@/lib/api";

export default function Inspect() {
  const [lon, setLon] = useState("90.345");
  const [lat, setLat] = useState("23.83");
  const [radius, setRadius] = useState("1500");
  const [demo, setDemo] = useState(true);
  const [out, setOut] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const run = async () => {
    setBusy(true); setErr(""); setOut(null);
    try {
      const r = await api<any>(`/api/analysis?demo=${demo ? "true" : "false"}`, {
        method: "POST",
        body: JSON.stringify({ lon: parseFloat(lon), lat: parseFloat(lat), radius_m: parseFloat(radius) }),
      });
      setOut(r);
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Manual Inspection</h2>
      <div className="card grid md:grid-cols-4 gap-2">
        <label className="text-sm">Lon<input className="input" value={lon} onChange={(e) => setLon(e.target.value)} /></label>
        <label className="text-sm">Lat<input className="input" value={lat} onChange={(e) => setLat(e.target.value)} /></label>
        <label className="text-sm">Radius m<input className="input" value={radius} onChange={(e) => setRadius(e.target.value)} /></label>
        <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} /> offline demo math</label>
        <button className="btn md:col-span-4" disabled={busy} onClick={run}>{busy ? "Analyzing…" : "Analyze"}</button>
      </div>
      {err && <div className="card text-red-700 text-sm">{err}</div>}
      {out && (
        <div className="card space-y-2">
          <p>Level: <span className={levelBadge(out.level)}>{out.level}</span> · alert {out.alert_id}</p>
          <p className="text-sm">{out.result?.explanation}</p>
          <pre className="text-xs bg-neutral-100 p-2 rounded overflow-auto">{JSON.stringify({ provider: out.result?.provider, synthetic: out.result?.synthetic, total_ha: out.result?.total_ha, signals: out.result?.signals, scenes: out.result?.scenes?.slice(0, 4) }, null, 2)}</pre>
          <p className="text-xs text-neutral-500">Provenance: provider={out.result?.provider} · synthetic={String(out.result?.synthetic)} · algo=vrx1-1.0.0. Before/after COG viewer lands in Phase 6; demo math + real STAC scene lists ship now.</p>
        </div>
      )}
    </div>
  );
}
