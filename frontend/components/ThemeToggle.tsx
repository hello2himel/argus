"use client";
import { useEffect, useState } from "react";
import { getTheme, applyTheme, type Theme } from "@/lib/role";

const ORDER: Theme[] = ["system", "light", "dark"];
const ICON: Record<Theme, string> = { system: "ri-computer-line", light: "ri-sun-line", dark: "ri-moon-line" };
const LABEL: Record<Theme, string> = { system: "System", light: "Light", dark: "Dark" };

export default function ThemeToggle() {
  const [theme, setT] = useState<Theme>("system");
  useEffect(() => { const t = getTheme(); setT(t); applyTheme(t); }, []);
  const next = () => {
    const t = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setT(t); applyTheme(t);
  };
  return (
    <button className="btn" onClick={next} title={`Theme: ${LABEL[theme]} (click to change)`} aria-label="Toggle theme">
      <i aria-hidden className={ICON[theme]}></i> {LABEL[theme]}
    </button>
  );
}
