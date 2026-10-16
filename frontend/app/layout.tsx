import "./globals.css";
import Link from "next/link";
import ThemeRole from "@/components/ThemeRole";
import { STATIC_MODE } from "@/lib/api";

export const metadata = { title: "Project Argus", description: "Satellite screening for protected land — brain VRX-1" };

const NAV_ALL = [
  ["Overview", "/"],
  ["Protected Areas", "/protected-areas"],
  ["Manual Inspection", "/inspect"],
  ["Alerts", "/alerts"],
  ["Analysis History", "/history"],
  ["Data Sources", "/data-sources"],
  ["Settings", "/settings"],
];
// Static mirror rule: same pages minus Manual Inspection (it takes input).
const NAV = STATIC_MODE ? NAV_ALL.filter(([_, href]) => href !== "/inspect") : NAV_ALL;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen">
          <aside className="w-56 shrink-0 bg-neutral-900 text-neutral-100 p-4 space-y-1 hidden md:block">
            <h1 className="text-lg font-bold">◉ Project Argus</h1>
            <p className="text-xs text-neutral-400">Brain: VRX-1 · Bangladesh</p>
            <nav className="pt-4 space-y-1">
              {NAV.map(([label, href]) => (
                <Link key={href} href={href} className="block px-3 py-2 rounded hover:bg-neutral-800 text-sm">{label}</Link>
              ))}
            </nav>
            <ThemeRole />
            <p className="text-[11px] text-neutral-500 pt-4">Demo boundaries only — not legal cadastre. Green ≠ legal clearance.{STATIC_MODE ? " Snapshot mirror: read-only." : ""}</p>
          </aside>
          <main className="flex-1 p-4 md:p-6 max-w-6xl w-full mx-auto">
            <div className="md:hidden flex gap-2 flex-wrap mb-4">
              {NAV.map(([label, href]) => (
                <Link key={href} href={href} className="text-xs border rounded px-2 py-1 bg-white">{label}</Link>
              ))}
            </div>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
