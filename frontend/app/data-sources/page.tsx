"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
export default function Sources() {
  const [s, setS] = useState<any>(null);
  useEffect(() => { api<any>("/api/data-sources/status").then(setS).catch(() => {}); }, []);
  const src = s?.sources || [];
  return (
    <div className="space-y-4"><h2 className="text-2xl font-bold">Data Sources</h2>
      <p className="text-sm text-neutral-600">Imagery providers and boundary sources, with limits. Status below is live.</p>
      <div className="grid md:grid-cols-2 gap-3">
        {src.map((p: any) => (
          <div key={p.provider} className="card"><div className="flex justify-between"><b>{p.provider}</b><span className={p.ok ? "badge-green" : "badge-red"}>{p.ok ? "Reachable" : "Down"}</span></div>
            <p className="text-sm text-neutral-600">{p.synthetic ? "Synthetic demo math — never presented as satellite truth." : p.title || "Sentinel-2 L2A · anonymous STAC search, auto-SAS blob reads."}</p>
            <p className="text-xs text-neutral-500">Native resolution: 10 m / 20 m</p></div>
        ))}
      </div>
      <div className="card"><h3 className="font-semibold mb-2">Boundary and licence register</h3>
        <table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase text-neutral-500"><th className="p-2">Source</th><th className="p-2">Used for</th><th className="p-2">Limitation</th><th className="p-2">Role</th></tr></thead><tbody>
          {[["Bangladesh Forest Dept", "Parks, sanctuaries, reserves", "Manual import of official files; confirm gazette", "Preferred"], ["Water Development Board", "River corridors, demarcation", "A visible river edge is not a legal boundary", "Preferred for rivers"], ["Protected Planet", "Reference boundaries", "Non-commercial; check release date/coverage", "Reference only"], ["OpenStreetMap", "Roads, settlements, waterways", "Not a legal/ownership source (ODbL)", "Context"], ["Copernicus Sentinel data", "Optical imagery", "Free/open; revisit ≠ cloud-free scene", "Imagery"]].map((r) => (
            <tr key={r[0]} className="border-t"><td className="p-2 font-semibold">{r[0]}</td><td className="p-2">{r[1]}</td><td className="p-2">{r[2]}</td><td className="p-2"><span className="badge-gray">{r[3]}</span></td></tr>
          ))}</tbody></table></div>
      <div className="card"><h3 className="font-semibold mb-1">What 10 m pixels can and cannot show</h3>
        <p className="text-sm">One pixel ≈ 100 m². Clearings and larger structures can appear; single houses, individual trees and narrow strips often will not. Argus reports the scale of every change and never claims to find every violation.</p></div>
    </div>
  );
}
