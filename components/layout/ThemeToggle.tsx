"use client";

import { useTheme } from "@/components/providers/ThemeProvider";

export function ThemeToggle() {
  const { themeId, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      className="nexus-btn nexus-btn-ghost nexus-theme-toggle"
      onClick={toggleTheme}
      aria-label={`Switch to ${themeId === "dark" ? "light" : "dark"} theme`}
    >
      {themeId === "dark" ? "Light theme" : "Dark theme"}
    </button>
  );
}
