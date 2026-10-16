export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
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
