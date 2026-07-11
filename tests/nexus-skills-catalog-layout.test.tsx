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

const ROOT = path.resolve(import.meta.dirname, "..");

const EXPECTED_ROW_HEADINGS = [
  "Knowledge & Research",
  "Scheduled Maintenance",
  "Library & Documents",
];

beforeEach(() => {
  authState.isLoading = false;
  authState.isAuthenticated = true;
});

describe("Nexus Skills catalog row layout", () => {
  it("renders all six skill cards exactly once", () => {
    const { container } = render(<SkillsWorkspace />);
    const cards = container.querySelectorAll(".skills-catalog-card");
    expect(cards.length).toBe(6);
    const titles = Array.from(cards).map(
      (card) => card.querySelector(".skills-catalog-card-title")?.textContent,
    );
    expect(new Set(titles).size).toBe(6);
  });

  it("renders exactly three category headings with no Deep Research heading", () => {
    render(<SkillsWorkspace />);
    const headings = screen.getAllByRole("heading", { level: 2 }).map((el) => el.textContent);
    expect(headings).toEqual(EXPECTED_ROW_HEADINGS);
    expect(headings).not.toContain("Deep Research");
  });

  it("groups cards into three two-card rows", () => {
    const { container } = render(<SkillsWorkspace />);
    const rows = container.querySelectorAll(".skills-catalog-row");
    expect(rows.length).toBe(3);

    const rowCards = Array.from(rows).map((row) =>
      Array.from(row.querySelectorAll(".skills-catalog-card-title")).map((el) => el.textContent),
    );

    expect(rowCards[0]).toEqual(["Vault", "Transcript retrieval"]);
    expect(rowCards[1]).toEqual(["Membership.io Full Sync", "Vault Expansion Pass"]);
    expect(rowCards[2]).toEqual(["Library Dropzone Processing", "Deep Research"]);
  });

  it("shows one heading above each row grid, not per card column", () => {
    const { container } = render(<SkillsWorkspace />);
    const rows = container.querySelectorAll(".skills-catalog-row");
    for (const row of rows) {
      expect(row.querySelectorAll(".skills-catalog-row-title").length).toBe(1);
      expect(row.querySelectorAll(".skills-catalog-grid").length).toBe(1);
    }
  });

  it("aligns availability badges with the final input value row", () => {
    const { container } = render(<SkillsWorkspace />);
    const cards = container.querySelectorAll(".skills-catalog-card");
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.querySelector(".skills-catalog-card-header")).toBeNull();
      expect(card.querySelector(".skills-catalog-card-footer")).toBeNull();
      const inputRow = card.querySelector(".skills-catalog-card-input-row");
      expect(inputRow).not.toBeNull();
      expect(inputRow?.querySelector(".skills-catalog-card-input-value")).not.toBeNull();
      expect(
        within(inputRow as HTMLElement).getByText(/Checking availability|Connector required/i),
      ).toBeTruthy();
    }
  });

  it("uses compact input-row status layout in CSS", () => {
    const css = readFileSync(path.join(ROOT, "styles/legacy-port.css"), "utf8");
    expect(css).toContain(".skills-catalog-rows");
    expect(css).toMatch(/\.skills-catalog-rows[\s\S]*flex-direction:\s*column/);
    expect(css).toContain(".skills-catalog-row");
    expect(css).toMatch(/\.skills-catalog-grid[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*\.skills-catalog-grid[\s\S]*grid-template-columns:\s*1fr/);
    expect(css).toContain(".skills-catalog-card-input-row");
    expect(css).toMatch(/\.skills-catalog-card-input-row[\s\S]*display:\s*flex/);
    expect(css).toMatch(/\.skills-catalog-card-input-row \.skills-catalog-status[\s\S]*flex:\s*0 0 auto/);
    expect(css).not.toContain(".skills-catalog-card-footer");
    expect(css).not.toContain("min-height: 11.5rem");
    expect(css).not.toContain(".skills-catalog-card-header");
    expect(css).not.toContain(".skills-catalog-section--span-wide");
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
