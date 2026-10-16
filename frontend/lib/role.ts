// Role is a demo switch (not auth). Reviewer+ can review; admin can register sites / edit thresholds.
// In the static snapshot mirror the role is fixed to viewer: zero inputs.
import { STATIC_MODE } from "@/lib/api";

export type Role = "viewer" | "reviewer" | "admin";

export function getRole(): Role {
  if (STATIC_MODE) return "viewer";
  if (typeof window === "undefined") return "reviewer";
  const r = window.localStorage.getItem("argus-role");
  return r === "admin" || r === "viewer" || r === "reviewer" ? r : "reviewer";
}

export function setRole(r: Role) {
  window.localStorage.setItem("argus-role", r);
}

export const canReview = (r: Role) => r === "reviewer" || r === "admin";
export const canAdmin = (r: Role) => r === "admin";

export type Theme = "system" | "light" | "dark";
export function getTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const t = window.localStorage.getItem("argus-theme");
  return t === "light" || t === "dark" ? t : "system";
}
export function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", t);
  window.localStorage.setItem("argus-theme", t);
}
