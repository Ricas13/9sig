"use client";

import { Moon, Sun } from "lucide-react";

type Theme = "dark" | "light";

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function ThemeToggle() {
  function toggleTheme() {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    window.localStorage.setItem("wealtharr-theme", next);
  }

  return <button
    type="button"
    className="theme-toggle"
    onClick={toggleTheme}
    aria-label="Toggle light or dark theme"
    title="Toggle light or dark theme"
  >
    <span className="theme-toggle-icon theme-icon-light" aria-hidden="true"><Sun size={15}/></span>
    <span className="theme-toggle-icon theme-icon-dark" aria-hidden="true"><Moon size={15}/></span>
    <span className="theme-toggle-label theme-label-light">Light</span>
    <span className="theme-toggle-label theme-label-dark">Dark</span>
  </button>;
}
