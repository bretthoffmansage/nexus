"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  NEXUS_THEMES,
  THEME_STORAGE_KEY,
  type NexusThemeId,
  type NexusThemeTokens,
} from "@/lib/theme/tokens";

type ThemeContextValue = {
  themeId: NexusThemeId;
  tokens: NexusThemeTokens;
  setThemeId: (id: NexusThemeId) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyThemeTokens(tokens: NexusThemeTokens) {
  const root = document.documentElement;
  root.style.setProperty("--nexus-bg", tokens.bg);
  root.style.setProperty("--nexus-fg", tokens.fg);
  root.style.setProperty("--nexus-panel", tokens.panel);
  root.style.setProperty("--nexus-border", tokens.border);
  root.style.setProperty("--nexus-accent", tokens.accent);
  root.style.setProperty("--nexus-sidebar-bg", tokens.sidebarBg);
  root.style.setProperty("--nexus-input-bg", tokens.inputBg);
  root.style.setProperty("--nexus-user-bubble-bg", tokens.userBubbleBg);
  root.style.setProperty("--nexus-ai-bubble-bg", tokens.aiBubbleBg);
  root.dataset.nexusTheme = tokens === NEXUS_THEMES.light ? "light" : "dark";
}

function readStoredTheme(): NexusThemeId {
  if (typeof window === "undefined") return "dark";
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return raw === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<NexusThemeId>(() =>
    typeof window === "undefined" ? "dark" : readStoredTheme(),
  );

  const tokens = NEXUS_THEMES[themeId];

  useEffect(() => {
    applyThemeTokens(tokens);
  }, [tokens]);

  const setThemeId = useCallback((id: NexusThemeId) => {
    setThemeIdState(id);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, id);
    } catch {
      /* ignore quota errors */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeId(themeId === "dark" ? "light" : "dark");
  }, [setThemeId, themeId]);

  const value = useMemo(
    () => ({ themeId, tokens, setThemeId, toggleTheme }),
    [themeId, tokens, setThemeId, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
