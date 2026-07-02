// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ToolAvailabilityBanner } from "@/components/workspace/ToolAvailabilityBanner";
import { SkillsWorkspace } from "@/components/workspace/port/SkillsWorkspace";

vi.mock("convex/react", () => ({
  useQuery: () => undefined,
}));

vi.mock("@/lib/nexus/useNexusAuthReadiness", () => ({
  useNexusAuthReadiness: () => ({
    isLoading: false,
    isAuthenticated: true,
    readyForPrivateQueries: true,
  }),
}));

const ROOT = path.resolve(import.meta.dirname, "..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("Nexus cross-app copy alignment", () => {
  it("updates Deep Research subtitle exactly", () => {
    const src = read("components/workspace/port/ResearchWorkspace.tsx");
    expect(src).toContain("Hermes agent + Web, Transcript, Knowledge Vault runtime");
    expect(src).not.toContain("Web, Transcript, + Knowledge vault runtime");
  });

  it("updates Vault Library subtitle exactly", () => {
    const src = read("components/workspace/port/DocumentsWorkspace.tsx");
    expect(src).toContain("Upload or Create documents to train the Knowledge Vault");
    expect(src).not.toContain("Upload documents, keep immutable originals");
  });

  it("updates Tasks persistence notice without the old heading", () => {
    render(<ToolAvailabilityBanner availability="persistence_available" />);
    expect(screen.queryByText(/Saved · execution pending/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Your requests are saved and queued privately in Nexus. Execution waits for the Connector",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Claudia Connector, which is not configured yet/i),
    ).not.toBeInTheDocument();
  });

  it("replaces Skills intro with one line", () => {
    render(<SkillsWorkspace />);
    expect(
      screen.getByText(
        "Tools and capabilities available to Nexus to use through Chat, Calendar, Library, or the Connector.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Tools and capabilities available to Nexus", { exact: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Skills are the approved system tools/i),
    ).not.toBeInTheDocument();
  });
});
