import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NexusChatWorkspace } from "@/components/chat/NexusChatWorkspace";
import { NEXUS_TOOL_REGISTRY, toolByHref, toolsForNavigation } from "@/lib/navigation/toolRegistry";
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

  it("renders Nexus Chat heading, welcome, composer; no duplicate answer panel", () => {
    render(
      <ThemeProvider>
        <NexusChatWorkspace />
      </ThemeProvider>,
    );
    expect(screen.getByRole("heading", { name: "Nexus Chat" })).toBeInTheDocument();
    expect(screen.getByText("Welcome")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Answer" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Diagnostics/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Message Nexus/i)).toBeDisabled();
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
    ];
    for (const file of files) {
      const src = readFileSync(path.join(portDir, file), "utf8");
      expect(src).not.toContain("/api/");
      expect(src).not.toContain("fetch(");
    }
  });

  it("Documents workspace uploads via Convex storage, not legacy FastAPI", () => {
    const src = readFileSync(
      path.join(ROOT, "components/workspace/port/DocumentsWorkspace.tsx"),
      "utf8",
    );
    expect(src).not.toContain("/api/documents");
    expect(src).toContain("finalizeUpload");
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
      const adapterSrc = readFileSync(path.join(ROOT, file), "utf8");
      if (file.includes("documents/adapter") || file.includes("calendar/adapter") || file.includes("notes/adapter")) {
        expect(adapterSrc).toContain("available");
      } else {
        expect(adapterSrc).toContain("connector_required");
      }
    }
  });

  it("Operations is hidden from sidebar navigation but remains registered", () => {
    const nav = toolsForNavigation({ isAdmin: true });
    expect(nav.find((t) => t.id === "operations")).toBeUndefined();
    expect(nav.find((t) => t.id === "settings")).toBeDefined();
    expect(nav.find((t) => t.id === "status")).toBeDefined();
    expect(toolByHref("/operations")?.id).toBe("operations");
    expect(NEXUS_TOOL_REGISTRY.find((t) => t.id === "operations")?.hiddenFromNavigation).toBe(
      true,
    );
  });

  it("Gallery and Cookbook are hidden from sidebar navigation but remain registered", () => {
    const nav = toolsForNavigation({ isAdmin: true });
    expect(nav.find((t) => t.id === "gallery")).toBeUndefined();
    expect(nav.find((t) => t.id === "knowledge")).toBeUndefined();
    expect(nav.find((t) => t.id === "calendar")).toBeDefined();
    expect(nav.find((t) => t.id === "skills")).toBeDefined();
    expect(toolByHref("/gallery")?.id).toBe("gallery");
    expect(toolByHref("/knowledge")?.id).toBe("knowledge");
    expect(NEXUS_TOOL_REGISTRY.find((t) => t.id === "gallery")?.hiddenFromNavigation).toBe(true);
    expect(NEXUS_TOOL_REGISTRY.find((t) => t.id === "knowledge")?.hiddenFromNavigation).toBe(true);
    expect(readFileSync(path.join(ROOT, "app/gallery/page.tsx"), "utf8")).toContain("GalleryWorkspace");
    expect(readFileSync(path.join(ROOT, "app/knowledge/page.tsx"), "utf8")).toContain("KnowledgeWorkspace");
  });

  it("sidebar keeps global navigation only (chat history moved to Nexus Chat)", () => {
    const src = readFileSync(path.join(ROOT, "components/layout/Sidebar.tsx"), "utf8");
    expect(src).not.toContain("TaskHistorySection");
    expect(src).not.toContain("ClaudiaPresenceLive");
    expect(src).not.toContain("New request");
    expect(src).toContain("ToolNavigation");
    const chatSrc = readFileSync(path.join(ROOT, "components/chat/NexusChatWorkspace.tsx"), "utf8");
    expect(chatSrc).toContain("ChatHistoryPanel");
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
