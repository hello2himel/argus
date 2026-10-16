"use client";
import { useEffect, useState } from "react";
import { api, API_BASE } from "@/lib/api";

// Real before/after swipe viewer with marked-changes overlay.
// Images come from GET /api/analysis/{id}/preview (real Sentinel-2 pixels).
export default function BeforeAfter({ analysisId, baseline, recent }: { analysisId: string; baseline: string; recent: string }) {
  const [pv, setPv] = useState<any>(null);
  const [pos, setPos] = useState(50);
  const [overlay, setOverlay] = useState(true);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let live = true;
    setState("loading");
    api<any>(`/api/analysis/${analysisId}/preview`)
      .then((p) => { if (live) { setPv(p); setState("ready"); } })
      .catch((e: any) => { if (live) { setMsg(e.message); setState("unavailable"); } });
    return () => { live = false; };
  }, [analysisId]);

  if (state === "loading") return <p className="text-sm text-neutral-500">Rendering real satellite preview… (first render downloads COGs, ~30–60 s)</p>;
  if (state === "unavailable") return <p className="text-sm text-neutral-500">No satellite preview. {msg}</p>;
  const abs = (u: string) => (u.startsWith("http") ? u : `${API_BASE}${u}`);

  return (
    <div>
      <div className="viewer">
        <img src={abs(pv.before_url)} alt="Baseline true colour" className="viewer-img" />
        <img src={abs(pv.after_url)} alt="Recent true colour" className="viewer-img viewer-after" style={{ clipPath: `inset(0 0 0 ${pos}%)` }} />
        {overlay && <img src={abs(pv.overlay_url)} alt="Marked vegetation-loss pixels" className="viewer-img viewer-after" style={{ clipPath: `inset(0 0 0 ${pos}%)` }} />}
        <div className="viewer-divider" style={{ left: `${pos}%` }} />
        <span className="viewer-cap-l">BEFORE · {baseline}</span>
        <span className="viewer-cap-r">AFTER · {recent}</span>
      </div>
      <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} className="w-full mt-2" aria-label="Comparison position" />
      <div className="flex justify-between items-center mt-1">
        <label className="text-sm text-neutral-600"><input type="checkbox" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} /> Marked changes ({pv.changed_px?.toLocaleString()} px)</label>
        <span className="text-xs text-neutral-500">True colour · 10 m native · red = vegetation-loss pixels</span>
      </div>
    </div>
  );
}
