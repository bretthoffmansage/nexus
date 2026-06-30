/**
 * Theme token maps — derived from legacy static/js/theme.js dark preset
 * and static/style.css :root variables.
 */

export type NexusThemeId = "dark" | "light";

export type NexusThemeTokens = {
  bg: string;
  fg: string;
  panel: string;
  border: string;
  accent: string;
  sidebarBg: string;
  inputBg: string;
  userBubbleBg: string;
  aiBubbleBg: string;
};

export const NEXUS_THEMES: Record<NexusThemeId, NexusThemeTokens> = {
  dark: {
    bg: "#282c34",
    fg: "#9cdef2",
    panel: "#111111",
    border: "#355a66",
    accent: "#e06c75",
    sidebarBg: "#111111",
    inputBg: "#1a1f26",
    userBubbleBg: "#2a313c",
    aiBubbleBg: "#151a20",
  },
  light: {
    bg: "#f0ebe3",
    fg: "#5a5248",
    panel: "#faf6f0",
    border: "#d4cdc2",
    accent: "#c47d5a",
    sidebarBg: "#faf6f0",
    inputBg: "#ffffff",
    userBubbleBg: "#e8e2d8",
    aiBubbleBg: "#ffffff",
  },
};

export const THEME_STORAGE_KEY = "nexus-theme-mode";
