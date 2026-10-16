"use client";
import { useEffect, useState } from "react";
import { getRole, setRole, getTheme, applyTheme, type Role } from "@/lib/role";
import { STATIC_MODE } from "@/lib/api";

export default function ThemeRole() {
  const [role, setR] = useState<Role>("reviewer");
  useEffect(() => { setR(getRole()); applyTheme(getTheme()); }, []);
  if (STATIC_MODE) return null;
  return (
    <div className="pt-4 space-y-2 text-sm">
      <label className="block text-xs text-neutral-400">Signed in as (demo switch)
        <select className="input mt-1 text-neutral-900" value={role} onChange={(e) => { setR(e.target.value as Role); setRole(e.target.value as Role); }}>
          <option value="viewer">Viewer</option><option value="reviewer">Reviewer</option><option value="admin">Administrator</option>
        </select>
      </label>
    </div>
  );
}
