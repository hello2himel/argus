"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { getRole, canAdmin } from "@/lib/role";
export default function Settings() {
  const [t, setT] = useState<any>(null);
  const [admin, setAdmin] = useState(false);
  useEffect(() => { setAdmin(canAdmin(getRole())); api<any>("/api/thresholds").then(setT).catch(() => {}); }, []);
  return (
    <div className="space-y-4"><h2 className="text-2xl font-bold">Settings</h2>
      <p className="text-sm text-neutral-600">Detection thresholds by site type — starting values, tune against reviewed examples. {t?.algo && <span className="font-mono">Algo: {t.algo}</span>}</p>
      <div className="card"><h3 className="font-semibold mb-2">Detection thresholds {admin ? "" : "(Administrator role required to edit)"}</h3>
        <table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase text-neutral-500"><th className="p-2">Site type</th><th className="p-2">NDVI drop</th><th className="p-2">Min patch (ha)</th><th className="p-2">Min scenes</th><th className="p-2">Max cloud %</th></tr></thead><tbody>
          {(t?.by_site_type || []).map((r: any) => (
            <tr key={r.site_type} className="border-t"><td className="p-2">{r.site_type}</td>
              {[r.ndvi_drop, r.min_patch_ha, r.min_scenes, r.max_cloud].map((v, i) => <td key={i} className="p-2"><input className="input" defaultValue={v} disabled={!admin} /></td>)}</tr>
          ))}</tbody></table></div>
      <div className="card"><h3 className="font-semibold mb-2">Roles</h3>
        <table className="w-full text-sm"><tbody>
          {[["View sites, alerts and evidence", "Yes", "Yes", "Yes"], ["Run manual inspections", "Yes", "Yes", "Yes"], ["Change review status + notes", "No", "Yes", "Yes"], ["Register/edit boundaries", "No", "No", "Yes"], ["Change thresholds", "No", "No", "Yes"]].map((r) => (
            <tr key={r[0]} className="border-t"><td className="p-2">{r[0]}</td><td className="p-2">{r[1]}</td><td className="p-2">{r[2]}</td><td className="p-2">{r[3]}</td></tr>
          ))}</tbody></table></div>
      <div className="card"><h3 className="font-semibold mb-1">Safeguards</h3>
        <p className="text-sm">Priority labels are rule-based — no illegality probability is calculated. Review states are controlled by authorised users and stored apart from algorithm output. The role switch is a demo stand-in, not authentication.</p></div>
    </div>
  );
}
