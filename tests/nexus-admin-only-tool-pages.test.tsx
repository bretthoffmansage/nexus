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

/** The seven areas restricted to active nexus_admin in this package. */
const ADMIN_ONLY = [
  { id: "email", href: "/email", page: "app/email/page.tsx" },
  { id: "calendar", href: "/calendar", page: "app/calendar/page.tsx" },
  { id: "research", href: "/research", page: "app/research/page.tsx" },
  { id: "documents", href: "/documents", page: "app/documents/page.tsx" },
  { id: "skills", href: "/skills", page: "app/skills/page.tsx" },
  { id: "settings", href: "/settings", page: "app/settings/page.tsx" },
  { id: "admin-access", href: "/admin/access", page: "app/admin/access/page.tsx" },
] as const;

/** Pages that must remain reachable for an ordinary knowledge_reader. */
const UNAFFECTED = ["nexus-chat", "memory", "notes", "tasks", "status"] as const;

describe("admin-only tool pages — sidebar visibility", () => {
  it("active admin sees Email, Calendar, Deep Research, Vault Library, Skills, Settings, Admin", () => {
    const nav = toolsForNavigation({ isAdmin: true });
    for (const { id } of ADMIN_ONLY) {
      expect(nav.find((t) => t.id === id)).toBeDefined();
    }
  });

  it("knowledge_reader without admin sees none of the seven admin-only items", () => {
    const nav = toolsForNavigation({ isAdmin: false });
    for (const { id } of ADMIN_ONLY) {
      expect(nav.find((t) => t.id === id)).toBeUndefined();
    }
  });

  it("fails closed while admin status is unresolved (undefined isAdmin hides admin items)", () => {
    const navUndefined = toolsForNavigation();
    const navEmpty = toolsForNavigation({});
    for (const { id } of ADMIN_ONLY) {
      expect(navUndefined.find((t) => t.id === id)).toBeUndefined();
      expect(navEmpty.find((t) => t.id === id)).toBeUndefined();
    }
  });

  it("keeps Chat, Notes, Tasks, and Status visible for a knowledge_reader", () => {
    const nav = toolsForNavigation({ isAdmin: false });
    for (const id of UNAFFECTED) {
      // Brain (memory) stays hidden from nav by its own flag; the rest are visible.
      if (id === "memory") continue;
      expect(nav.find((t) => t.id === id)).toBeDefined();
    }
  });

  it("keeps every admin-only route registered (route entry restorable)", () => {
    for (const { id, href } of ADMIN_ONLY) {
      expect(toolByHref(href)?.id).toBe(id);
      expect(NEXUS_TOOL_REGISTRY.find((t) => t.id === id)?.requiredRole).toBe("nexus_admin");
    }
  });

  it("does not mark Chat, Brain, Notes, Tasks, or Status as admin-only", () => {
    for (const id of UNAFFECTED) {
      expect(NEXUS_TOOL_REGISTRY.find((t) => t.id === id)?.requiredRole).toBeUndefined();
    }
  });
});

describe("admin-only tool pages — empty section headings", () => {
  it("removes the Communication heading for a knowledge_reader (Email was its only item)", () => {
    const { unmount } = render(<ToolNavigation isAdmin={false} />);
    expect(screen.queryByText("Communication")).toBeNull();
    // Tools + System remain because Notes/Tasks and Status are still visible.
    expect(screen.getByText("Tools")).toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();
    expect(screen.queryByText("Admin")).toBeNull();
    unmount();
  });

  it("shows Communication and Admin headings for an active admin", () => {
    const { container } = render(<ToolNavigation isAdmin={true} />);
    const headings = Array.from(
      container.querySelectorAll(".nexus-nav-group-label"),
    ).map((el) => el.textContent);
    expect(headings).toContain("Communication");
    expect(headings).toContain("Admin");
    expect(headings).toContain("Tools");
    expect(headings).toContain("System");
  });
});

describe("admin-only tool pages — direct route protection", () => {
  it("routes each admin-only page through ToolPageFrame requiredRole=nexus_admin", () => {
    for (const { page } of ADMIN_ONLY) {
      const src = readFileSync(path.join(ROOT, page), "utf8");
      expect(src).toContain('requiredRole="nexus_admin"');
    }
  });

  it("enforces the role server-side and redirects non-admins to a bounded fallback (not /admin)", () => {
    const guard = readFileSync(
      path.join(ROOT, "lib/workspace/requireWorkspaceAccess.ts"),
      "utf8",
    );
    expect(guard).toContain('requiredRole === "nexus_admin"');
    expect(guard).toContain('access.roles?.includes("nexus_admin")');
    expect(guard).toContain('redirect("/")');
    // Never bounce a denied user into the admin area.
    expect(guard).not.toContain('redirect("/admin")');
    const frame = readFileSync(path.join(ROOT, "lib/workspace/ToolPageFrame.tsx"), "utf8");
    expect(frame).toContain("requiredRole");
  });

  it("does not add requiredRole to the unaffected pages", () => {
    for (const page of [
      "app/page.tsx",
      "app/notes/page.tsx",
      "app/tasks/page.tsx",
      "app/status/page.tsx",
      "app/memory/page.tsx",
    ]) {
      const src = readFileSync(path.join(ROOT, page), "utf8");
      expect(src).not.toContain('requiredRole="nexus_admin"');
    }
  });
});
