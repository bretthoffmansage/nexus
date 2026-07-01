import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NexusChatWorkspace } from "@/components/chat/NexusChatWorkspace";
import { NEXUS_TOOL_REGISTRY } from "@/lib/navigation/toolRegistry";
import { ThemeProvider } from "@/components/providers/ThemeProvider";

// The chat workspace now uses Convex hooks; override just those two so the
// render test does not require a live ConvexProvider (the real app has one).
vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex/react")>()),
  useQuery: () => undefined,
  useMutation: () => async () => undefined,
}));

const ROOT = path.resolve(__dirname, "..");

describe("Nexus P4.4 legacy workspace port", () => {
  it("preserves Nexus Chat workspace at root contract", () => {
    const pageSrc = readFileSync(path.join(ROOT, "app/page.tsx"), "utf8");
    expect(pageSrc).toContain("NexusShell");
    const shellSrc = readFileSync(path.join(ROOT, "components/shell/NexusShell.tsx"), "utf8");
    expect(shellSrc).toContain("NexusChatWorkspace");
  });

  it("renders Nexus Chat heading, welcome, answer, sources, composer, diagnostics", () => {
    render(
      <ThemeProvider>
        <NexusChatWorkspace />
      </ThemeProvider>,
    );
    expect(screen.getByRole("heading", { name: "Nexus Chat" })).toBeInTheDocument();
    expect(screen.getByText("Welcome")).toBeInTheDocument();
    expect(screen.getByText("Answer")).toBeInTheDocument();
    expect(screen.getByText("Sources")).toBeInTheDocument();
    expect(screen.getByLabelText(/Message Nexus/i)).toBeDisabled();
    expect(screen.getByText(/Diagnostics/i)).toBeInTheDocument();
  });

  it("centralizes navigation in tool registry", () => {
    expect(NEXUS_TOOL_REGISTRY.length).toBeGreaterThan(10);
    const chat = NEXUS_TOOL_REGISTRY.find((t) => t.href === "/");
    expect(chat?.label).toBe("Nexus Chat");
  });

  it("defines legacy-derived tool routes", () => {
    const hrefs = NEXUS_TOOL_REGISTRY.map((t) => t.href);
    for (const href of [
      "/calendar",
      "/notes",
      "/documents",
      "/email",
      "/research",
      "/memory",
      "/gallery",
      "/tasks",
      "/settings",
      "/admin/access",
    ]) {
      expect(hrefs).toContain(href);
    }
  });

  it("calendar route uses ported calendar workspace", () => {
    const src = readFileSync(path.join(ROOT, "app/calendar/page.tsx"), "utf8");
    expect(src).toContain("CalendarWorkspace");
    expect(src).not.toMatch(/Coming soon/i);
  });

  it("notes route uses ported notes workspace", () => {
    const src = readFileSync(path.join(ROOT, "app/notes/page.tsx"), "utf8");
    expect(src).toContain("NotesWorkspace");
  });

  it("documents route uses ported documents workspace", () => {
    const src = readFileSync(path.join(ROOT, "app/documents/page.tsx"), "utf8");
    expect(src).toContain("DocumentsWorkspace");
  });

  it("email route uses ported email workspace", () => {
    const src = readFileSync(path.join(ROOT, "app/email/page.tsx"), "utf8");
    expect(src).toContain("EmailWorkspace");
  });

  it("research route uses ported research workspace", () => {
    const src = readFileSync(path.join(ROOT, "app/research/page.tsx"), "utf8");
    expect(src).toContain("ResearchWorkspace");
  });

  it("memory route uses ported memory workspace", () => {
    const src = readFileSync(path.join(ROOT, "app/memory/page.tsx"), "utf8");
    expect(src).toContain("MemoryWorkspace");
  });

  it("gallery route uses ported gallery workspace", () => {
    const src = readFileSync(path.join(ROOT, "app/gallery/page.tsx"), "utf8");
    expect(src).toContain("GalleryWorkspace");
  });

  it("ported components do not call legacy FastAPI endpoints", () => {
    const portDir = path.join(ROOT, "components/workspace/port");
    const files = [
      "CalendarWorkspace.tsx",
      "NotesWorkspace.tsx",
      "EmailWorkspace.tsx",
      "DocumentsWorkspace.tsx",
    ];
    for (const file of files) {
      const src = readFileSync(path.join(portDir, file), "utf8");
      expect(src).not.toContain("/api/");
      expect(src).not.toContain("fetch(");
    }
  });

  it("adapter boundaries exist for migrated tools", () => {
    const adapters = [
      "lib/adapters/calendar/adapter.ts",
      "lib/adapters/notes/adapter.ts",
      "lib/adapters/documents/adapter.ts",
      "lib/adapters/email/adapter.ts",
      "lib/adapters/research/adapter.ts",
      "lib/adapters/memory/adapter.ts",
      "lib/adapters/gallery/adapter.ts",
      "lib/adapters/tasks/adapter.ts",
    ];
    for (const file of adapters) {
      expect(readFileSync(path.join(ROOT, file), "utf8")).toContain("connector_required");
    }
  });

  it("sidebar preserves chat history region on home only", () => {
    const src = readFileSync(path.join(ROOT, "components/layout/Sidebar.tsx"), "utf8");
    expect(src).toContain("TaskHistorySection");
    expect(src).toContain('pathname === "/"');
    expect(src).toContain("ToolNavigation");
  });

  it("admin route remains nexus_admin protected", () => {
    const src = readFileSync(path.join(ROOT, "lib/workspace/ToolPageFrame.tsx"), "utf8");
    expect(src).toContain("requiredRole");
    const admin = readFileSync(path.join(ROOT, "app/admin/access/page.tsx"), "utf8");
    expect(admin).toContain('requiredRole="nexus_admin"');
  });

  it("mobile navigation styles remain defined", () => {
    const css = readFileSync(path.join(ROOT, "styles/shell.css"), "utf8");
    expect(css).toMatch(/@media/);
    const legacyCss = readFileSync(path.join(ROOT, "styles/legacy-port.css"), "utf8");
    expect(legacyCss).toMatch(/@media/);
  });

  it("does not import legacy JS into hosted components", () => {
    const src = readFileSync(path.join(ROOT, "components/workspace/port/CalendarWorkspace.tsx"), "utf8");
    expect(src).not.toMatch(/from ['"].*legacy_local_console/);
    expect(src).not.toMatch(/import\(.*\.js/);
  });
});
