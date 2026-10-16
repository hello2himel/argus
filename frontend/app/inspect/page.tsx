"use client";
import { useState } from "react";
import { api, levelBadge, STATIC_MODE } from "@/lib/api";
import BeforeAfter from "@/components/BeforeAfter";

const STEPS = ["Searching STAC catalog for baseline + recent scenes", "Filtering for cloud, shadow and nodata", "Reading 10 m COG pixels, aligning grids", "Calculating NDVI change, grouping patches", "Writing the evidence record"];

export default function Inspect() {
  const [lon, setLon] = useState("90.345");
  const [lat, setLat] = useState("23.83");
  const [radius, setRadius] = useState("1500");
  const [cloud, setCloud] = useState("30");
  const [sens, setSens] = useState("standard");
  const [area, setArea] = useState("0.5");
  const [demo, setDemo] = useState(false);
  const [out, setOut] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");

  const la = parseFloat(lat), lo = parseFloat(lon);
  const outside = isFinite(la) && isFinite(lo) && (la < 20.5 || la > 26.7 || lo < 88 || lo > 92.8);

  if (STATIC_MODE) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Manual Inspection</h2>
        <div className="card"><p className="text-sm">Disabled in the read-only snapshot mirror — running a new analysis takes input. Use the full app to inspect a location.</p></div>
      </div>
    );
  }

  const run = async () => {
    const e: Record<string, string> = {};
    if (!isFinite(la) || la < -90 || la > 90) e.lat = "Enter a latitude between −90 and 90.";
    if (!isFinite(lo) || lo < -180 || lo > 180) e.lon = "Enter a longitude between −180 and 180.";
    const rad = parseFloat(radius);
    if (!isFinite(rad) || rad < 10 || rad > 20000) e.radius = "Radius must be 10–20000 m.";
    const a = parseFloat(area);
    if (!isFinite(a) || a < 0.01 || a > 100) e.area = "Min area 0.01–100 ha (one 10 m pixel = 0.01 ha).";
    setErrs(e); if (Object.keys(e).length) return;
    setBusy(true); setErr(""); setOut(null); setStep(0);
    const tick = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 4000);
    try {
      const r = await api<any>(`/api/analysis?demo=${demo ? "true" : "false"}`, {
        method: "POST",
        body: JSON.stringify({ lon: lo, lat: la, radius_m: rad, max_cloud: parseFloat(cloud), min_change_m2: a * 10000, sensitivity: sens }),
      });
      setOut(r);
    } catch (e: any) { setErr(e.message); }
    clearInterval(tick); setBusy(false);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Manual Inspection</h2>
      <p className="text-sm text-neutral-600">Check one location without registering a site. The search area stays where you put it, even if imagery is missing.</p>
      <div className="card grid md:grid-cols-2 gap-3">
        <label className="text-sm">Latitude <span className="text-neutral-500">(decimal, −90..90)</span><input className="input" value={lat} onChange={(e) => setLat(e.target.value)} />{errs.lat && <span className="text-red-700 text-xs">{errs.lat}</span>}</label>
        <label className="text-sm">Longitude <span className="text-neutral-500">(decimal, −180..180)</span><input className="input" value={lon} onChange={(e) => setLon(e.target.value)} />{errs.lon && <span className="text-red-700 text-xs">{errs.lon}</span>}</label>
        <label className="text-sm">Search radius (m)<input className="input" value={radius} onChange={(e) => setRadius(e.target.value)} />{errs.radius && <span className="text-red-700 text-xs">{errs.radius}</span>}</label>
        <label className="text-sm">Minimum change area (ha)<input className="input" value={area} onChange={(e) => setArea(e.target.value)} />{errs.area && <span className="text-red-700 text-xs">{errs.area}</span>}</label>
        <label className="text-sm">Detection sensitivity<select className="input" value={sens} onChange={(e) => setSens(e.target.value)}><option value="low">Low</option><option value="standard">Standard</option><option value="high">High</option></select></label>
        <label className="text-sm">Max cloud per scene: <b className="font-mono">{cloud}%</b><input type="range" min={5} max={60} step={5} value={cloud} onChange={(e) => setCloud(e.target.value)} className="w-full" /></label>
        <label className="text-sm flex items-center gap-2 md:col-span-2"><input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} /> offline demo math (synthetic — for no-internet fallback only)</label>
        {outside && <p className="text-xs text-amber-700 md:col-span-2">This point is outside the Bangladesh monitoring extent. It will still be analysed if imagery exists.</p>}
        <button className="btn md:col-span-2" disabled={busy} onClick={run}>{busy ? "Analyzing real pixels… (1–3 min)" : "Analyze"}</button>
      </div>
      {busy && <div className="card text-sm space-y-1">{STEPS.map((s, i) => <p key={s} className={i <= step ? "font-semibold" : "text-neutral-400"}>{i < step ? "✓" : "○"} {s}</p>)}</div>}
      {err && <div className="card text-red-700 text-sm">{err}</div>}
      {out && (
        <div className="card space-y-2">
          <p>Level: <span className={levelBadge(out.level)}>{out.level}</span> · alert {out.alert_id} · {out.result?.synthetic ? "synthetic" : "real pixels"}</p>
          {(() => {
            const used: any[] = out.result?.scenes_used || [];
            const b = (used.find((s: any) => s.epoch === "baseline")?.acquired || "").slice(0, 10);
            const r = (used.find((s: any) => s.epoch === "recent")?.acquired || "").slice(0, 10);
            return <BeforeAfter analysisId={out.analysis_id} baseline={b} recent={r} />;
          })()}
          <p className="text-sm">{out.result?.explanation}</p>
          <pre className="text-xs bg-neutral-100 p-2 rounded overflow-auto">{JSON.stringify({ provider: out.result?.provider, total_ha: out.result?.total_ha, signals: out.result?.signals, scenes_used: out.result?.scenes_used }, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
