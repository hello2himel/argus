import "./globals.css";
import "remixicon/fonts/remixicon.css";
import Link from "next/link";
import ThemeRole from "@/components/ThemeRole";
import { STATIC_MODE } from "@/lib/api";

export const metadata = {
  title: "Project Argus",
  description: "Satellite screening for protected land — brain VRX-1",
  icons: { icon: "/logo.svg" },
};

const NAV_ALL: [string, string, string][] = [
  ["Overview", "/", "ri-dashboard-line"],
  ["Protected Areas", "/protected-areas", "ri-tree-line"],
  ["Manual Inspection", "/inspect", "ri-crosshair-line"],
  ["Alerts", "/alerts", "ri-alarm-warning-line"],
  ["Analysis History", "/history", "ri-history-line"],
  ["Data Sources", "/data-sources", "ri-database-2-line"],
  ["Settings", "/settings", "ri-settings-3-line"],
];
// Static mirror rule: same pages minus Manual Inspection (it takes input).
const NAV = STATIC_MODE ? NAV_ALL.filter(([_, href]) => href !== "/inspect") : NAV_ALL;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen">
          <aside className="w-56 shrink-0 bg-neutral-900 text-neutral-100 p-4 space-y-1 hidden md:block">
            <h1 className="text-lg font-bold flex items-center gap-2"><span className="grid place-items-center w-7 h-7 rounded-md bg-emerald-700 text-white"><img src="/logo.svg" alt="Argus logo" className="w-[18px] h-[18px]" /></span>Project Argus</h1>
            <p className="text-xs text-neutral-400">Brain: VRX-1 · Bangladesh</p>
            <nav className="pt-4 space-y-1">
              {NAV.map(([label, href, icon]) => (
                <Link key={href} href={href} className="flex items-center gap-2 px-3 py-2 rounded hover:bg-neutral-800 text-sm"><i aria-hidden className={`${icon} text-base leading-none`}></i>{label}</Link>
              ))}
            </nav>
            <ThemeRole />
            <p className="text-[11px] text-neutral-500 pt-4">Demo boundaries only — not legal cadastre. Green ≠ legal clearance.{STATIC_MODE ? " Snapshot mirror: read-only." : ""}</p>
          </aside>
          <main className="flex-1 p-4 md:p-6 max-w-6xl w-full mx-auto">
            <div className="md:hidden flex gap-2 flex-wrap mb-4">
              {NAV.map(([label, href, icon]) => (
                <Link key={href} href={href} className="text-xs border rounded px-2 py-1 bg-white flex items-center gap-1"><i aria-hidden className={icon}></i>{label}</Link>
              ))}
            </div>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
