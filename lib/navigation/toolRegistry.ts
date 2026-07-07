import type { ToolAvailability } from "@/lib/adapters/types";

export type NexusToolGroup = "chat" | "communication" | "tools" | "system" | "admin";

export type NexusToolDefinition = {
  id: string;
  label: string;
  href: string;
  group: NexusToolGroup;
  legacyButtonId?: string;
  legacyModules: string[];
  availability: ToolAvailability;
  requiredRole?: "nexus_admin";
  showInChatHistoryRegion?: boolean;
  /** Omit from sidebar navigation while keeping route/registry entry restorable. */
  hiddenFromNavigation?: boolean;
};

export const NEXUS_CHAT_TOOL: NexusToolDefinition = {
  id: "nexus-chat",
  label: "Chat",
  href: "/",
  group: "chat",
  legacyButtonId: "sidebar-new-chat-btn",
  legacyModules: ["static/js/chat.js", "static/js/chatRenderer.js", "static/js/sessions.js"],
  availability: "partially_available",
  showInChatHistoryRegion: true,
};

export const NEXUS_TOOL_REGISTRY: NexusToolDefinition[] = [
  NEXUS_CHAT_TOOL,
  {
    id: "email",
    label: "Email",
    href: "/email",
    group: "communication",
    legacyButtonId: "email-section-title",
    legacyModules: [
      "static/js/emailInbox.js",
      "static/js/emailLibrary.js",
      "static/js/emailLibrary/state.js",
    ],
    availability: "connector_required",
    requiredRole: "nexus_admin",
  },
  {
    id: "memory",
    label: "Brain",
    href: "/memory",
    group: "tools",
    legacyButtonId: "tool-memory-btn",
    legacyModules: ["static/js/memory.js"],
    availability: "connector_required",
    hiddenFromNavigation: true,
  },
  {
    id: "calendar",
    label: "Calendar",
    href: "/calendar",
    group: "tools",
    legacyButtonId: "tool-calendar-btn",
    legacyModules: ["static/js/calendar.js", "static/js/calendar/"],
    availability: "available",
    requiredRole: "nexus_admin",
  },
  {
    id: "research",
    label: "Deep Research",
    href: "/research",
    group: "tools",
    legacyButtonId: "tool-research-btn",
    legacyModules: ["static/js/research/panel.js", "static/js/research/jobs.js"],
    availability: "available",
    requiredRole: "nexus_admin",
  },
  {
    id: "gallery",
    label: "Gallery",
    href: "/gallery",
    group: "tools",
    legacyButtonId: "tool-gallery-btn",
    legacyModules: ["static/js/gallery.js"],
    availability: "connector_required",
    hiddenFromNavigation: true,
  },
  {
    id: "documents",
    label: "Vault Library",
    href: "/documents",
    group: "tools",
    legacyButtonId: "tool-library-btn",
    legacyModules: ["static/js/documentLibrary.js", "static/js/document.js"],
    availability: "available",
    requiredRole: "nexus_admin",
  },
  {
    id: "notes",
    label: "Notes",
    href: "/notes",
    group: "tools",
    legacyButtonId: "tool-notes-btn",
    legacyModules: ["static/js/notes.js"],
    availability: "available",
  },
  {
    id: "tasks",
    label: "Tasks",
    href: "/tasks",
    group: "tools",
    legacyButtonId: "tool-tasks-btn",
    legacyModules: ["static/js/tasks.js"],
    availability: "available",
  },
  {
    id: "knowledge",
    label: "Cookbook",
    href: "/knowledge",
    group: "tools",
    legacyButtonId: "tool-cookbook-btn",
    legacyModules: ["static/js/cookbook.js", "static/js/cookbookServe.js"],
    availability: "local_only",
    hiddenFromNavigation: true,
  },
  {
    id: "skills",
    label: "Skills",
    href: "/skills",
    group: "tools",
    legacyModules: ["static/js/skills.js"],
    availability: "available",
    requiredRole: "nexus_admin",
  },
  {
    id: "settings",
    label: "Settings",
    href: "/settings",
    group: "system",
    legacyModules: ["static/js/settings.js"],
    availability: "partially_available",
    requiredRole: "nexus_admin",
  },
  {
    id: "status",
    label: "Status",
    href: "/status",
    group: "system",
    legacyButtonId: "tool-claudia-dashboard-btn",
    legacyModules: ["static/js/claudiaDashboard.js"],
    availability: "partially_available",
  },
  {
    id: "operations",
    label: "Operations",
    href: "/operations",
    group: "system",
    legacyModules: ["operations-terminal-legacy"],
    availability: "deferred",
    hiddenFromNavigation: true,
  },
  {
    id: "admin-access",
    label: "Admin",
    href: "/admin/access",
    group: "admin",
    legacyModules: [],
    availability: "available",
    requiredRole: "nexus_admin",
  },
];

export function toolsForNavigation(options?: { isAdmin?: boolean }): NexusToolDefinition[] {
  return NEXUS_TOOL_REGISTRY.filter((tool) => {
    if (tool.hiddenFromNavigation) return false;
    if (tool.requiredRole === "nexus_admin" && !options?.isAdmin) return false;
    return true;
  });
}

export function toolByHref(href: string): NexusToolDefinition | undefined {
  return NEXUS_TOOL_REGISTRY.find((tool) => tool.href === href);
}
