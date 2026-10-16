"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { canReview } from "@/lib/role";
import { siteCenter } from "@/lib/maps";
import { STATIC_MODE } from "@/lib/api";
import OpenInMaps from "@/components/OpenInMaps";
import BeforeAfter from "@/components/BeforeAfter";

const NEXT_ALLOWED: Record<string, string[]> = {
  UNVERIFIED: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["CONFIRMED_DISTURBANCE", "DISMISSED", "REQUIRES_FIELD_INSPECTION"],
  REQUIRES_FIELD_INSPECTION: ["UNDER_REVIEW", "CONFIRMED_DISTURBANCE", "DISMISSED"],
  CONFIRMED_DISTURBANCE: ["UNDER_REVIEW"],
  DISMISSED: ["UNDER_REVIEW"],
};

export default function AlertDrawer({ alertId, onClose, onChanged }: { alertId: string | null; onClose: () => void; onChanged: () => void }) {
  const [alert, setAlert] = useState<any>(null);
  const [site, setSite] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [status, setStatus] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!alertId) return;
    setAlert(null); setDetail(null); setErr(""); setStatus(""); setNote("");
    (async () => {
      const a = await api<any>(`/api/alerts/${alertId}`);
      setAlert(a);
      try { setSite(await api<any>(`/api/sites/${a.site_id}`)); } catch { setSite(null); }
      try {
        const d = await api<any>(`/api/analysis/${a.analysis_id}/results`);
        setDetail(d.result);
      } catch { /* GRAY alerts may lack detail */ }
      try {
        const h = await api<any>(`/api/alerts/${alertId}/history`);
        setHistory(h.events);
      } catch { setHistory([]); }
    })().catch((e) => setErr(e.message));
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [alertId]);

  if (!alertId) return null;
  const allowed = NEXT_ALLOWED[alert?.review_status || "UNVERIFIED"] || [];
  const sig = detail?.signals || {};
  const scenes: any[] = detail?.scenes || [];
  const base = scenes.filter((s) => !s.synthetic && String(s.acquired || "").length > 0);
  const used: any[] = detail?.scenes_used || [];

  const save = async () => {
    setErr("");
    if (!status) { setErr("Choose a new status."); return; }
    if (!note.trim()) { setErr("Add a note. Every status change is kept in the audit history."); return; }
    try {
      await api(`/api/alerts/${alertId}/review`, { method: "PATCH", body: JSON.stringify({ status, note: note.trim() }) });
      const h = await api<any>(`/api/alerts/${alertId}/history`);
      setHistory(h.events);
      const a = await api<any>(`/api/alerts/${alertId}`);
      setAlert(a); setStatus(""); setNote(""); onChanged();
      setToast("Review saved.");
      setTimeout(() => setToast(""), 2500);
    } catch (e: any) { setErr(e.message); }
  };

  const copy = async () => {
    const txt = [
      `Argus alert ${alert?.id}`, `Priority: ${alert?.level} · Review: ${alert?.review_status}`,
      alert?.total_ha != null ? `Estimated change: ${Number(alert.total_ha).toFixed(1)} ha` : "No assessable change",
      detail?.scenes_used ? `Scenes: ${detail.scenes_used.map((s: any) => s.product_id).join(", ")}` : "",
      `Provider: ${detail?.provider || alert?.provider || "?"} · synthetic=${String(detail?.synthetic ?? alert?.synthetic)}`,
      "Spectral change is not proof of unlawful activity.",
    ].join("\n");
    try { await navigator.clipboard.writeText(txt); setToast("Evidence summary copied."); setTimeout(() => setToast(""), 2500); }
    catch { setToast("Copy blocked by browser."); setTimeout(() => setToast(""), 2500); }
  };

  return (
    <div className="drawer-wrap">
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={`Alert ${alertId}`}>
        <div className="drawer-h">
          <div>
            <p className="text-xs text-neutral-500 font-mono">{alert?.id} · {alert?.created_at?.slice(0, 10)}</p>
            <h2 className="text-lg font-semibold">{alert?.site_id}</h2>
            <p><span className={`badge-${(alert?.level || "gray").toLowerCase()}`}>{alert?.level}</span> <span className="badge-gray">{alert?.review_status}</span> {(detail?.synthetic ?? alert?.synthetic) ? <span className="badge-gray">synthetic demo</span> : <span className="badge-green">real pixels</span>}</p>
            {(() => { const c = site?.geometry ? siteCenter(site.geometry) : null; return c ? <p className="mt-1"><OpenInMaps lat={c.lat} lon={c.lon} /></p> : null; })()}
          </div>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
        <div className="drawer-b">
          {err && <p className="text-sm text-red-700">{err}</p>}
          {!alert && <p className="text-sm text-neutral-500">Loading evidence…</p>}
          {alert && (
            <>
              <section><h3 className="font-semibold text-sm mb-1">Before / after — real pixels</h3>
                {!(detail?.synthetic ?? alert?.synthetic) ? (
                  <BeforeAfter analysisId={alert.analysis_id}
                    baseline={String((detail?.scenes_used?.find((s: any) => s.epoch === "baseline")?.acquired) || "").slice(0, 10)}
                    recent={String((detail?.scenes_used?.find((s: any) => s.epoch === "recent")?.acquired) || "").slice(0, 10)} />
                ) : (
                  <p className="card text-sm text-neutral-500">Synthetic demo analysis — no satellite preview. Written data below is the full record.</p>
                )}
              </section>
              <section><h3 className="font-semibold text-sm mb-1">Measurements</h3>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  {[["Change", alert.total_ha != null ? `${Number(alert.total_ha).toFixed(1)} ha` : "—"], ["Events", detail?.n_events ?? "—"], ["Valid pixels", detail?.valid_fraction != null ? `${Math.round(detail.valid_fraction * 100)}%` : "—"], ["Mean ΔNDVI", sig.mean_d_ndvi != null ? Number(sig.mean_d_ndvi).toFixed(3) : "—"], ["Veg-loss px", sig.veg_loss_px ?? "—"], ["Scenes (catalog)", detail ? `${detail.n_baseline_scenes ?? "?"} / ${detail.n_recent_scenes ?? "?"}` : "—"]].map(([k, v]) => (
                    <div key={k} className="card"><p className="text-xs text-neutral-500">{k}</p><p className="font-mono font-semibold">{v}</p></div>
                  ))}
                </div>
                <p className="text-xs text-neutral-500 mt-1">{alert.explanation}</p>
              </section>
              <section><h3 className="font-semibold text-sm mb-1">Signals</h3>
                <div className="card text-sm divide-y">
                  {Object.entries(sig).filter(([k]) => !["grid_shape"].includes(k)).map(([k, v]) => (
                    <div key={k} className="flex justify-between py-1"><span>{k}</span><b className="font-mono">{typeof v === "number" ? (Math.abs(v) < 1 ? v.toFixed(3) : v.toLocaleString()) : String(v ?? "—")}</b></div>
                  ))}
                </div>
              </section>
              <section><h3 className="font-semibold text-sm mb-1">Source observations ({used.length || base.length})</h3>
                <div className="card text-xs overflow-auto">
                  {(used.length ? used.map((s: any) => ({ role: s.epoch, date: s.acquired, product: s.product_id, cloud: s.cloud_cover })) : base.slice(0, 8).map((s: any) => ({ role: "catalog", date: s.acquired, product: s.product_id, cloud: s.cloud_cover }))).map((r: any, i: number) => (
                    <div key={i} className="flex justify-between gap-2 border-b py-1 font-mono"><span>{r.role}</span><span>{String(r.date).slice(0, 10)}</span><span className="truncate">{r.product}</span><span>{r.cloud != null ? `${r.cloud}%` : ""}</span></div>
                  ))}
                  {(used.length === 0 && base.length === 0) && <p className="text-neutral-500">No scene list attached.</p>}
                </div>
                <p className="text-xs text-neutral-500">Provider: {detail?.provider || alert.provider} · Sentinel-2 L2A · 10 m native. Product IDs are the audit trail — look them up in Planetary Computer.</p>
              </section>
              <section><h3 className="font-semibold text-sm mb-1">Why this priority</h3>
                <p className="card text-sm">{detail?.explanation || alert.explanation} No confidence percentage is calculated; priority comes from fixed area/persistence rules (see Settings).</p>
              </section>
              {!STATIC_MODE ? (
              <section><h3 className="font-semibold text-sm mb-1">Human review</h3>
                <div className="card space-y-2">
                  <label className="text-sm">New status
                    <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                      <option value="">Choose status</option>
                      {allowed.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </label>
                  <label className="text-sm">Reviewer note<textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you check and why does the status change?" /></label>
                  <div className="flex gap-2">
                    <button className="btn" onClick={save}>Save review</button>
                    <button className="btn" onClick={copy}>Copy evidence summary</button>
                  </div>
                </div>
              </section>
              ) : (
              <section><h3 className="font-semibold text-sm mb-1">Human review</h3>
                <div className="card space-y-2">
                  <p className="text-sm text-neutral-500">Read-only snapshot — reviews change in the full app.</p>
                  <button className="btn" onClick={copy}>Copy evidence summary</button>
                </div>
              </section>
              )}
              <section><h3 className="font-semibold text-sm mb-1">Audit history ({history.length})</h3>
                {history.length === 0 && <p className="text-sm text-neutral-500">No review events yet.</p>}
                {history.slice().reverse().map((e: any, i: number) => (
                  <div key={i} className="card text-sm mb-1"><b>{e.status}</b> · {e.at?.slice(0, 10)}<p className="text-neutral-600">{e.note}</p></div>
                ))}
              </section>
            </>
          )}
        </div>
        {toast && <div className="toast">{toast}</div>}
      </aside>
    </div>
  );
}
