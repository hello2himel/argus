"use client";
import { useEffect, useState } from "react";
import { getRole, setRole, getTheme, applyTheme, type Role, type Theme } from "@/lib/role";

export default function ThemeRole() {
  const [role, setR] = useState<Role>("reviewer");
  const [theme, setT] = useState<Theme>("system");
  useEffect(() => { setR(getRole()); const t = getTheme(); setT(t); applyTheme(t); }, []);
  return (
    <div className="pt-4 space-y-2 text-sm">
      <label className="block text-xs text-neutral-400">Signed in as (demo switch)
        <select className="input mt-1 text-neutral-900" value={role} onChange={(e) => { setR(e.target.value as Role); setRole(e.target.value as Role); }}>
          <option value="viewer">Viewer</option><option value="reviewer">Reviewer</option><option value="admin">Administrator</option>
        </select>
      </label>
      <label className="block text-xs text-neutral-400">Theme
        <select className="input mt-1 text-neutral-900" value={theme} onChange={(e) => { setT(e.target.value as Theme); applyTheme(e.target.value as Theme); }}>
          <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
        </select>
      </label>
    </div>
  );
}
