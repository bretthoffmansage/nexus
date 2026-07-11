import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  isLoading: true,
  isAuthenticated: false,
  isRefreshing: false,
}));

const queryCalls = vi.hoisted(() => [] as Array<{ fn: unknown; args: unknown }>);
const queryResults = vi.hoisted(() => new Map<unknown, unknown>());
const queryShouldThrow = vi.hoisted(() => ({ value: false }));

vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex/react")>()),
  useQuery: (fn: unknown, args: unknown) => {
    queryCalls.push({ fn, args });
    if (args === "skip") return undefined;
    if (queryShouldThrow.value) {
      throw new Error("unauthenticated");
    }
    return queryResults.get(fn);
  },
  useConvexAuth: () => ({ ...authState }),
}));

import {
  SKILLS_CATALOG_PENDING_AVAILABILITY_LABEL,
  SKILLS_CATALOG_QUERY_ERROR_MESSAGE,
  SkillsWorkspace,
} from "@/components/workspace/port/SkillsWorkspace";
import { nexusSkills } from "@/lib/nexus/skillsClient";
import { NEXUS_SKILLS_CATALOG_TOOL_IDS } from "@/convex/lib/nexusSkillsCatalog";

const ROOT = path.resolve(import.meta.dirname, "..");

function catalogQueryCalls() {
  return queryCalls.filter((c) => c.fn === nexusSkills.listCatalog);
}

beforeEach(() => {
  queryCalls.length = 0;
  queryResults.clear();
  queryShouldThrow.value = false;
  authState.isLoading = true;
  authState.isAuthenticated = false;
  authState.isRefreshing = false;
});

describe("Nexus Skills catalog auth readiness guard", () => {
  it("skips listSkillsCatalog while Convex auth is initializing", () => {
    authState.isLoading = true;
    authState.isAuthenticated = false;
    render(<SkillsWorkspace />);
    expect(catalogQueryCalls()).toHaveLength(0);
    expect(screen.getByText("Loading catalog…")).toBeInTheDocument();
    expect(screen.queryByText("Vault")).not.toBeInTheDocument();
  });

  it("does not invoke the private query while signed out", () => {
    authState.isLoading = false;
    authState.isAuthenticated = false;
    authState.isRefreshing = false;
    render(<SkillsWorkspace />);
    expect(catalogQueryCalls()).toHaveLength(0);
    expect(screen.getByText("Loading catalog…")).toBeInTheDocument();
  });

  it("does not invoke the private query while the auth token is refreshing", () => {
    authState.isLoading = false;
    authState.isAuthenticated = true;
    authState.isRefreshing = true;
    render(<SkillsWorkspace />);
    expect(catalogQueryCalls()).toHaveLength(0);
    expect(screen.getByText("Loading catalog…")).toBeInTheDocument();
  });

  it("starts listSkillsCatalog after readyForPrivateQueries becomes true", () => {
    authState.isLoading = false;
    authState.isAuthenticated = true;
    authState.isRefreshing = false;
    render(<SkillsWorkspace />);
    expect(catalogQueryCalls()).toHaveLength(1);
    expect(catalogQueryCalls()[0]?.args).toEqual({});
  });

  it("renders the static catalog while live availability is pending", () => {
    authState.isLoading = false;
    authState.isAuthenticated = true;
    authState.isRefreshing = false;
    render(<SkillsWorkspace />);
    expect(screen.getByText("Vault")).toBeInTheDocument();
    expect(screen.getAllByText(SKILLS_CATALOG_PENDING_AVAILABILITY_LABEL)).toHaveLength(
      NEXUS_SKILLS_CATALOG_TOOL_IDS.length,
    );
    expect(screen.queryByText("Loading catalog…")).not.toBeInTheDocument();
  });

  it("replaces pending availability labels when the live catalog resolves", () => {
    authState.isLoading = false;
    authState.isAuthenticated = true;
    authState.isRefreshing = false;
    queryResults.set(nexusSkills.listCatalog, {
      sections: [
        {
          id: "knowledge_research",
          label: "Knowledge & Research",
          tools: [
            {
              toolId: "vault.agentic_retrieval",
              displayName: "Vault",
              shortDescription: "Vault search",
              category: "knowledge_research",
              accessModes: ["chat"],
              inputType: "text_request",
              ordinaryChatAvailable: true,
              calendarAvailable: true,
              libraryAvailable: false,
              requiresConnector: true,
              safetyLevel: "read_only",
              currentAvailability: "available",
              availabilityLabel: "Available",
            },
          ],
        },
      ],
      connectorConfigured: true,
      connectorOnline: true,
    });

    render(<SkillsWorkspace />);
    expect(screen.getByText("Available")).toBeInTheDocument();
    expect(screen.queryByText(SKILLS_CATALOG_PENDING_AVAILABILITY_LABEL)).not.toBeInTheDocument();
  });

  it("shows a safe error state instead of endless loading when the query fails", () => {
    authState.isLoading = false;
    authState.isAuthenticated = true;
    authState.isRefreshing = false;
    queryShouldThrow.value = true;
    render(<SkillsWorkspace />);
    expect(screen.getByRole("alert")).toHaveTextContent(SKILLS_CATALOG_QUERY_ERROR_MESSAGE);
    expect(screen.getByText("Vault")).toBeInTheDocument();
    expect(screen.queryByText("Loading catalog…")).not.toBeInTheDocument();
  });

  it("uses readyForPrivateQueries rather than a generic ready alias", () => {
    const src = readFileSync(
      path.join(ROOT, "components/workspace/port/SkillsWorkspace.tsx"),
      "utf8",
    );
    expect(src).toContain("readyForPrivateQueries");
    expect(src).not.toMatch(/\{\s*ready\s*\}\s*=\s*useNexusAuthReadiness/);
  });

  it("defers the private query hook until auth readiness in the component tree", () => {
    const src = readFileSync(
      path.join(ROOT, "components/workspace/port/SkillsWorkspace.tsx"),
      "utf8",
    );
    expect(src).toContain("function SkillsCatalogLoaded");
    expect(src).toMatch(/authLoading \|\| !readyForPrivateQueries[\s\S]*SkillsCatalogContent/);
  });
});
