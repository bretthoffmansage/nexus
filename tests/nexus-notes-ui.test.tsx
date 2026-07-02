// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex/react")>()),
  useQuery: () => [],
  useMutation: () => vi.fn(),
  useConvexAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
    isRefreshing: false,
  }),
}));

import { NotesWorkspace } from "@/components/workspace/port/NotesWorkspace";
import { NEXUS_TOOL_REGISTRY } from "@/lib/navigation/toolRegistry";

const ROOT = path.resolve(import.meta.dirname, "..");

function read(relPath: string): string {
  return readFileSync(path.join(ROOT, relPath), "utf8");
}

describe("Nexus Notes UI activation", () => {
  it("removes Connector banner and legacy sync copy from Notes workspace", () => {
    const src = read("components/workspace/port/NotesWorkspace.tsx");
    expect(src).not.toContain("ToolAvailabilityBanner");
    expect(src).not.toContain("Connector required");
    expect(src).not.toContain("sync through the Connector");
    expect(src).toContain("Search notes");
    expect(src).toContain("Select");
    expect(src).toContain("Grid");
    expect(src).toContain("List");
    expect(src).not.toContain("Toggle");
    expect(src).not.toContain("/api/notes");
    expect(src).not.toContain("nexusTasks");
  });

  it("wires editor, bulk actions, and Convex client", () => {
    const src = read("components/workspace/port/NotesWorkspace.tsx");
    expect(src).toContain("nexusNotes.listMyNotes");
    expect(src).toContain("setMyNotesArchived");
    expect(src).toContain("deleteMyNotes");
    expect(src).toContain("NoteEditorDialog");
    expect(src).toContain("LibraryConfirmDialog");
    expect(src).toContain("const [editorOpen, setEditorOpen] = useState(false)");
  });

  it("removes Notes sidebar Connector badge metadata", () => {
    const notes = NEXUS_TOOL_REGISTRY.find((tool) => tool.id === "notes");
    expect(notes?.availability).toBe("available");
    expect(notes?.href).toBe("/notes");
  });

  it("uses Convex adapter authority", () => {
    const adapter = read("lib/adapters/notes/adapter.ts");
    expect(adapter).toContain('availability: "available"');
    expect(adapter).toContain('authority: "convex"');
    expect(adapter).toContain("nexusNotes");
  });

  it("renders without editorOpen ReferenceError and opens the editor dialog", async () => {
    const user = userEvent.setup();
    render(<NotesWorkspace />);

    expect(screen.getByRole("heading", { name: "Notes" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "New note" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
