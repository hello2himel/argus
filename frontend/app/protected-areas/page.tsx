"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { getRole, canAdmin } from "@/lib/role";

const DEMO = [
  { name: "Lawachara NP Edge (forest demo)", category: "national_park", lon: 91.784, lat: 24.32, note: "SYNTHETIC demo polygon, not legal boundary" },
  { name: "Chunati WS Corridor (forest demo)", category: "wildlife_sanctuary", lon: 92.03, lat: 21.97, note: "SYNTHETIC demo polygon" },
  { name: "Turag River Buffer Ashulia (river demo)", category: "river_buffer", lon: 90.345, lat: 23.83, note: "Writ 3503/2009 context; demo only" },
];

function box(lon: number, lat: number, d = 0.03) {
  return { type: "Polygon", coordinates: [[[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]]] };
}

export default function Sites() {
  const [sites, setSites] = useState<any[]>([]);
  const [name, setName] = useState("Lawachara NP Edge (demo)");
  const [msg, setMsg] = useState("");
  const [admin, setAdmin] = useState(false);
  const load = async () => setSites((await api<any>("/api/sites")).sites);
  useEffect(() => { setAdmin(canAdmin(getRole())); load().catch((e) => setMsg(e.message)); }, []);
  const add = async (preset?: any) => {
    const payload = preset ? { name: preset.name, category: preset.category, geometry: box(preset.lon, preset.lat), boundary_source: "synthetic demo — not legal", notes: preset.note }
      : { name, category: "protected", geometry: box(90.35, 23.83), boundary_source: "manual-demo (NOT legal cadastre)" };
    await api("/api/sites", { method: "POST", body: JSON.stringify(payload) });
    setMsg("Site added."); load();
  };
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Protected Areas</h2>
      <p className="text-sm text-neutral-600">Registered sites with boundary source and verification. Verified boundaries come first for any legal use.</p>
      {!admin && <p className="card text-sm">Registering or editing boundaries needs the Administrator role (left rail).</p>}
      <div className="card space-y-2">
        <p className="text-sm text-neutral-600">Register monitoring polygons. Authoritative BD boundaries (Forest Dept / BWDB) go here when available. All seeds are <b>demo-only</b>.</p>
        <div className="flex gap-2 flex-wrap">{DEMO.map((d) => <button key={d.name} className="btn text-sm" disabled={!admin} onClick={() => add(d)}>+ {d.name}</button>)}</div>
        <div className="flex gap-2"><input className="input" value={name} onChange={(e) => setName(e.target.value)} disabled={!admin} /><button className="btn" disabled={!admin} onClick={() => add()}>Add</button></div>
        {msg && <p className="text-xs">{msg}</p>}
      </div>
      {sites.map((s) => (
        <div key={s.id} className="card text-sm flex justify-between">
          <span><b>{s.name}</b> · {s.category} · {s.id}</span>
          <button className="text-red-600" onClick={async () => { await api(`/api/sites/${s.id}`, { method: "DELETE" }); load(); }}>delete</button>
        </div>
      ))}
    </div>
  );
}
