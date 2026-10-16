export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/** Static-snapshot mode (Netlify mirror): same UI, data from bundled
 *  snapshot.json, all mutations disabled. Enabled at build time via
 *  NEXT_PUBLIC_STATIC_MODE=true. */
export const STATIC_MODE = process.env.NEXT_PUBLIC_STATIC_MODE === "true";

let snapCache: any = null;
async function snap(): Promise<any> {
  if (!snapCache) {
    const r = await fetch("/data/snapshot.json", { cache: "no-store" });
    if (!r.ok) throw new Error(`snapshot HTTP ${r.status}`);
    snapCache = await r.json();
  }
  return snapCache;
}

const STATIC_THRESHOLDS = [
  { site_type: "Forest and national park", ndvi_drop: 0.2, min_patch_ha: 0.5, min_scenes: 2, max_cloud: 20 },
  { site_type: "Wetland and haor", ndvi_drop: 0.15, min_patch_ha: 1.0, min_scenes: 2, max_cloud: 25 },
  { site_type: "River protection zone", ndvi_drop: 0.15, min_patch_ha: 0.3, min_scenes: 2, max_cloud: 25 },
];

async function snapApi<T>(path: string, init?: RequestInit): Promise<T> {
  if (init && init.method && init.method !== "GET") {
    throw new Error("Disabled in the read-only snapshot mirror — use the full app to change data.");
  }
  const j = await snap();
  const seg = path.split("?")[0].split("/");
  const p1 = seg[2] || ""; // resource after /api/
  const p2 = seg[3] || "";
  const p3 = seg[4] || "";
  if (path === "/api/health") return { ok: true, service: "argus-static", algo: "vrx1-1.0.0", db: "snapshot", time: j.generated_at } as T;
  if (path === "/api/sites") return { sites: j.sites } as T;
  if (p1 === "sites" && p2) {
    const s = j.sites.find((x: any) => x.id === p2);
    if (!s) throw new Error("API 404 /api/sites/" + p2);
    return s as T;
  }
  if (path.startsWith("/api/alerts") && !p2) {
    let alerts = j.alerts;
    const q = new URLSearchParams(path.split("?")[1] || "");
    const lvl = q.get("level");
    if (lvl) alerts = alerts.filter((a: any) => a.level === lvl.toUpperCase());
    return { alerts } as T;
  }
  if (p1 === "alerts" && p2 && !p3) {
    const a = j.alerts.find((x: any) => x.id === p2);
    if (!a) throw new Error("API 404 " + path);
    return a as T;
  }
  if (p1 === "alerts" && p3 === "history") {
    return { alert_id: p2, events: (j.reviews || []).filter((e: any) => e.alert_id === p2) } as T;
  }
  if (path.startsWith("/api/analysis-history")) return { analyses: j.analyses } as T;
  if (p1 === "analysis" && p2 && !p3) {
    const a = j.analyses.find((x: any) => x.id === p2);
    if (!a) throw new Error("API 404 " + path);
    return a as T;
  }
  if (p1 === "analysis" && p3 === "results") {
    const a = j.analyses.find((x: any) => x.id === p2);
    if (!a) throw new Error("API 404 " + path);
    return { analysis_id: p2, result: a.result } as T;
  }
  if (p1 === "analysis" && p3 === "preview") {
    const a = j.analyses.find((x: any) => x.id === p2);
    const pv = a?.preview;
    if (!pv) throw new Error("API 422: no satellite preview in snapshot");
    const base = `/data/${pv.dir}`;
    return { ...pv, before_url: `${base}/${pv.before}`, after_url: `${base}/${pv.after}`, overlay_url: `${base}/${pv.overlay}` } as T;
  }
  if (path === "/api/data-sources/status") {
    return {
      sources: [
        { provider: "planetary-computer", ok: true, title: "Sentinel-2 Level-2A" },
        { provider: "demo-synthetic", ok: true, synthetic: true, note: "Fallback only; snapshot is real pixels." },
      ],
    } as T;
  }
  if (path === "/api/thresholds") {
    return { algo: "vrx1-1.0.0", by_site_type: STATIC_THRESHOLDS, note: "Starting values (snapshot copy)." } as T;
  }
  throw new Error("API 404 (static mirror): " + path);
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (STATIC_MODE) return snapApi<T>(path, init);
  const r = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`API ${r.status} ${path}: ${t.slice(0, 300)}`);
  }
  return r.json() as Promise<T>;
}

export function levelBadge(level: string) {
  const l = (level || "").toUpperCase();
  if (l === "RED") return "badge-red";
  if (l === "AMBER") return "badge-amber";
  if (l === "GREEN") return "badge-green";
  return "badge-gray";
}
