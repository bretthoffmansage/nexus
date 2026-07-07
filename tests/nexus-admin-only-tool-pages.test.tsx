// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  NEXUS_TOOL_REGISTRY,
  toolByHref,
  toolsForNavigation,
} from "@/lib/navigation/toolRegistry";
import { ToolNavigation } from "@/components/layout/ToolNavigation";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

const ROOT = path.resolve(__dirname, "..");

/** Pages gated strictly on an active nexus_admin role. */
const ADMIN_ROLE_ONLY = [
  { id: "email", href: "/email", page: "app/email/page.tsx" },
  { id: "calendar", href: "/calendar", page: "app/calendar/page.tsx" },
  { id: "documents", href: "/documents", page: "app/documents/page.tsx" },
  { id: "skills", href: "/skills", page: "app/skills/page.tsx" },
  { id: "settings", href: "/settings", page: "app/settings/page.tsx" },
  { id: "admin-access", href: "/admin/access", page: "app/admin/access/page.tsx" },
] as const;

/** Deep Research is gated on the deep-research access predicate, not admin-only. */
const DEEP_RESEARCH = {
  id: "research",
  href: "/research",
  page: "app/research/page.tsx",
} as const;

/** Pages that must remain reachable for an ordinary knowledge_reader. */
const UNAFFECTED = ["nexus-chat", "memory", "notes", "tasks", "status"] as const;

describe("privileged tool pages — sidebar visibility", () => {
  it("active admin (with deep-research access) sees all privileged items including Deep Research", () => {
    const nav = toolsForNavigation({ isAdmin: true, canAccessDeepResearch: true });
    for (const { id } of ADMIN_ROLE_ONLY) {
      expect(nav.find((t) => t.id === id)).toBeDefined();
    }
    expect(nav.find((t) => t.id === DEEP_RESEARCH.id)).toBeDefined();
  });

  it("knowledge_reader without admin or deep-research access sees none of the privileged items", () => {
    const nav = toolsForNavigation({ isAdmin: false, canAccessDeepResearch: false });
    for (const { id } of ADMIN_ROLE_ONLY) {
      expect(nav.find((t) => t.id === id)).toBeUndefined();
    }
    expect(nav.find((t) => t.id === DEEP_RESEARCH.id)).toBeUndefined();
  });

  it("knowledge_reader + deep_researcher sees Deep Research but no admin-only pages", () => {
    const nav = toolsForNavigation({ isAdmin: false, canAccessDeepResearch: true });
    expect(nav.find((t) => t.id === DEEP_RESEARCH.id)).toBeDefined();
    for (const { id } of ADMIN_ROLE_ONLY) {
      expect(nav.find((t) => t.id === id)).toBeUndefined();
    }
  });

  it("fails closed while access is unresolved (undefined options hide everything privileged)", () => {
    for (const nav of [toolsForNavigation(), toolsForNavigation({})]) {
      for (const { id } of ADMIN_ROLE_ONLY) {
        expect(nav.find((t) => t.id === id)).toBeUndefined();
      }
      expect(nav.find((t) => t.id === DEEP_RESEARCH.id)).toBeUndefined();
    }
  });

  it("keeps Chat, Notes, Tasks, and Status visible for a knowledge_reader", () => {
    const nav = toolsForNavigation({ isAdmin: false });
    for (const id of UNAFFECTED) {
      if (id === "memory") continue; // Brain stays hidden by its own flag.
      expect(nav.find((t) => t.id === id)).toBeDefined();
    }
  });

  it("keeps every privileged route registered with the correct gate", () => {
    for (const { id, href } of ADMIN_ROLE_ONLY) {
      expect(toolByHref(href)?.id).toBe(id);
      expect(NEXUS_TOOL_REGISTRY.find((t) => t.id === id)?.requiredRole).toBe("nexus_admin");
    }
    const research = NEXUS_TOOL_REGISTRY.find((t) => t.id === DEEP_RESEARCH.id);
    expect(toolByHref(DEEP_RESEARCH.href)?.id).toBe(DEEP_RESEARCH.id);
    expect(research?.requiredAccess).toBe("deep_research");
    expect(research?.requiredRole).toBeUndefined();
  });

  it("does not mark Chat, Brain, Notes, Tasks, or Status as privileged", () => {
    for (const id of UNAFFECTED) {
      const tool = NEXUS_TOOL_REGISTRY.find((t) => t.id === id);
      expect(tool?.requiredRole).toBeUndefined();
      expect(tool?.requiredAccess).toBeUndefined();
    }
  });
});

describe("privileged tool pages — empty section headings", () => {
  it("removes the Communication heading for a knowledge_reader (Email was its only item)", () => {
    const { unmount } = render(<ToolNavigation isAdmin={false} />);
    expect(screen.queryByText("Communication")).toBeNull();
    expect(screen.getByText("Tools")).toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();
    expect(screen.queryByText("Admin")).toBeNull();
    unmount();
  });

  it("shows Communication and Admin headings for an active admin", () => {
    const { container } = render(
      <ToolNavigation isAdmin={true} canAccessDeepResearch={true} />,
    );
    const headings = Array.from(
      container.querySelectorAll(".nexus-nav-group-label"),
    ).map((el) => el.textContent);
    expect(headings).toContain("Communication");
    expect(headings).toContain("Admin");
    expect(headings).toContain("Tools");
    expect(headings).toContain("System");
  });
});

describe("privileged tool pages — direct route protection", () => {
  it("routes each admin-only page through ToolPageFrame requiredRole=nexus_admin", () => {
    for (const { page } of ADMIN_ROLE_ONLY) {
      const src = readFileSync(path.join(ROOT, page), "utf8");
      expect(src).toContain('requiredRole="nexus_admin"');
    }
  });

  it("routes the Deep Research page through ToolPageFrame requiredAccess=deep_research", () => {
    const src = readFileSync(path.join(ROOT, DEEP_RESEARCH.page), "utf8");
    expect(src).toContain('requiredAccess="deep_research"');
    expect(src).not.toContain('requiredRole="nexus_admin"');
  });

  it("enforces both gates server-side and redirects denied users to a bounded fallback (not /admin)", () => {
    const guard = readFileSync(
      path.join(ROOT, "lib/workspace/requireWorkspaceAccess.ts"),
      "utf8",
    );
    expect(guard).toContain('requiredRole === "nexus_admin"');
    expect(guard).toContain('access.roles?.includes("nexus_admin")');
    expect(guard).toContain('requiredAccess === "deep_research"');
    expect(guard).toContain("hasDeepResearchAccess");
    expect(guard).toContain('redirect("/")');
    expect(guard).not.toContain('redirect("/admin")');
    const frame = readFileSync(path.join(ROOT, "lib/workspace/ToolPageFrame.tsx"), "utf8");
    expect(frame).toContain("requiredRole");
    expect(frame).toContain("requiredAccess");
  });

  it("does not add a role/access gate to the unaffected pages", () => {
    for (const page of [
      "app/page.tsx",
      "app/notes/page.tsx",
      "app/tasks/page.tsx",
      "app/status/page.tsx",
      "app/memory/page.tsx",
    ]) {
      const src = readFileSync(path.join(ROOT, page), "utf8");
      expect(src).not.toContain('requiredRole="nexus_admin"');
      expect(src).not.toContain('requiredAccess="deep_research"');
    }
  });
});
