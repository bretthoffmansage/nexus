import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  isLoading: false,
  isAuthenticated: true,
}));

vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex/react")>()),
  useQuery: () => undefined,
  useConvexAuth: () => ({ ...authState, isRefreshing: false }),
}));

import { SkillsWorkspace } from "@/components/workspace/port/SkillsWorkspace";
import { SKILLS_CATALOG_SECTIONS } from "@/convex/lib/nexusSkillsCatalog";

const ROOT = path.resolve(import.meta.dirname, "..");

beforeEach(() => {
  authState.isLoading = false;
  authState.isAuthenticated = true;
});

describe("Nexus Skills catalog layout normalization", () => {
  it("renders all six skill cards", () => {
    const { container } = render(<SkillsWorkspace />);
    const cards = container.querySelectorAll(".skills-catalog-card");
    expect(cards.length).toBe(6);
  });

  it("renders all categories in canonical order", () => {
    render(<SkillsWorkspace />);
    const headings = screen.getAllByRole("heading", { level: 2 }).map((el) => el.textContent);
    expect(headings).toEqual(SKILLS_CATALOG_SECTIONS.map((section) => section.label));
  });

  it("places availability badges in card footers, not beside titles", () => {
    const { container } = render(<SkillsWorkspace />);
    const cards = container.querySelectorAll(".skills-catalog-card");
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.querySelector(".skills-catalog-card-header")).toBeNull();
      const footer = card.querySelector(".skills-catalog-card-footer");
      expect(footer).not.toBeNull();
      expect(within(footer as HTMLElement).getByText(/Checking availability|Connector required/i)).toBeTruthy();
    }
  });

  it("pairs single-card categories side by side via section grid order", () => {
    const { container } = render(<SkillsWorkspace />);
    const sections = container.querySelectorAll(".skills-catalog-section");
    expect(sections.length).toBe(4);
    for (const section of sections) {
      expect(section.classList.contains("skills-catalog-section--span-wide")).toBe(false);
      expect(section.getAttribute("data-section-id")).toBeTruthy();
    }
    const library = container.querySelector(
      '.skills-catalog-section[data-section-id="library_documents"]',
    );
    const deepResearch = container.querySelector(
      '.skills-catalog-section[data-section-id="deep_research"]',
    );
    expect(library).not.toBeNull();
    expect(deepResearch).not.toBeNull();
    expect(library?.getAttribute("data-tool-count")).toBe("1");
    expect(deepResearch?.getAttribute("data-tool-count")).toBe("1");
  });

  it("uses two-column category grid with paired section order in CSS", () => {
    const css = readFileSync(path.join(ROOT, "styles/legacy-port.css"), "utf8");
    expect(css).toContain(".skills-catalog-sections");
    expect(css).toMatch(/\.skills-catalog-sections[\s\S]*display:\s*grid/);
    expect(css).toMatch(/\.skills-catalog-sections[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    expect(css).toContain('[data-section-id="knowledge_research"]');
    expect(css).toContain('[data-section-id="scheduled_maintenance"]');
    expect(css).toContain('[data-section-id="library_documents"]');
    expect(css).toContain('[data-section-id="deep_research"]');
    expect(css).not.toContain(".skills-catalog-section--span-wide");
    expect(css).toContain(".skills-catalog-card-footer");
    expect(css).toMatch(/\.skills-catalog-card-footer[\s\S]*margin-top:\s*auto/);
    expect(css).toMatch(/justify-content:\s*flex-end/);
    expect(css).not.toContain(".skills-catalog-card-header");
  });

  it("does not add execution controls", () => {
    const src = readFileSync(
      path.join(ROOT, "components/workspace/port/SkillsWorkspace.tsx"),
      "utf8",
    );
    expect(src).not.toContain("runTool");
    expect(src).not.toContain("submitRequest");
    expect(src).not.toMatch(/<button[^>]*>.*Run/i);
  });
});
