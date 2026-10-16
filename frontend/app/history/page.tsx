"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
export default function History() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { api<any>("/api/analysis-history").then((r) => setRows(r.analyses)).catch(() => {}); }, []);
  return (
    <div className="space-y-4"><h2 className="text-2xl font-bold">Analysis History</h2>
      {rows.map((a) => <div key={a.id} className="card text-sm"><b>{a.id}</b> · {a.status} · site {a.site_id || "manual"} · {a.created_at}</div>)}
      {rows.length === 0 && <p className="text-sm text-neutral-500">Empty.</p>}
    </div>
  );
}
