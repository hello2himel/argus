export default function Settings() {
  return (
    <div className="space-y-4"><h2 className="text-2xl font-bold">Settings</h2>
      <div className="card text-sm space-y-1">
        <p>API base: <code>{process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}</code> (set NEXT_PUBLIC_API_URL).</p>
        <p>VRX-1 thresholds are per-analysis params (ndvi_drop 0.15, min_region 0.5 ha, red ≥5 ha). Tune per site type; see docs/DETECTION.md.</p>
        <p>Secrets: never commit .env. Copy .env.example → .env.</p>
      </div>
    </div>
  );
}
