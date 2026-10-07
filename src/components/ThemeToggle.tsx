"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "dark" | "light";

function currentTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    setTheme(currentTheme());
  }, []);

  function toggleTheme() {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    window.localStorage.setItem("strategyos-theme", next);
    setTheme(next);
  }

  const nextLabel = theme === "dark" ? "Use light theme" : "Use dark theme";

  return <button
    type="button"
    className="theme-toggle"
    onClick={toggleTheme}
    aria-label={nextLabel}
    title={nextLabel}
  >
    <span className="theme-toggle-icon" aria-hidden="true">
      {theme === "dark" ? <Sun size={15}/> : <Moon size={15}/>}
    </span>
    <span className="theme-toggle-label">{theme === "dark" ? "Light" : "Dark"}</span>
  </button>;
}
