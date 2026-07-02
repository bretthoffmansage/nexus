import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  isLoading: true,
  isAuthenticated: false,
}));

const queryCalls = vi.hoisted(() => [] as Array<{ fn: unknown; args: unknown }>);
const queryResults = vi.hoisted(() => new Map<unknown, unknown>());

vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex/react")>()),
  useQuery: (fn: unknown, args: unknown) => {
    queryCalls.push({ fn, args });
    if (args === "skip") return undefined;
    return queryResults.get(fn);
  },
  useConvexAuth: () => ({ ...authState, isRefreshing: false }),
}));

import {
  SKILLS_CATALOG_PENDING_AVAILABILITY_LABEL,
  SkillsWorkspace,
} from "@/components/workspace/port/SkillsWorkspace";
import { nexusSkills } from "@/lib/nexus/skillsClient";
import { NEXUS_SKILLS_CATALOG_TOOL_IDS } from "@/convex/lib/nexusSkillsCatalog";

function lastCatalogCall() {
  const calls = queryCalls.filter((c) => c.fn === nexusSkills.listCatalog);
  return calls[calls.length - 1];
}

beforeEach(() => {
  queryCalls.length = 0;
  queryResults.clear();
  authState.isLoading = true;
  authState.isAuthenticated = false;
});

describe("Nexus Skills catalog loading repair", () => {
  it("skips listSkillsCatalog until readyForPrivateQueries", () => {
    authState.isLoading = true;
    authState.isAuthenticated = false;
    render(<SkillsWorkspace />);
    expect(lastCatalogCall()?.args).toBe("skip");
    expect(screen.getByText("Loading catalog…")).toBeInTheDocument();
    expect(screen.queryByText("SAGE Knowledge Vault")).not.toBeInTheDocument();
  });

  it("runs listSkillsCatalog once auth is ready", () => {
    authState.isLoading = false;
    authState.isAuthenticated = true;
    render(<SkillsWorkspace />);
    expect(lastCatalogCall()?.args).toEqual({});
  });

  it("renders known tools while live availability is still pending", () => {
    authState.isLoading = false;
    authState.isAuthenticated = true;
    render(<SkillsWorkspace />);
    expect(screen.getByText("SAGE Knowledge Vault")).toBeInTheDocument();
    expect(screen.getByText("Membership.io Full Sync")).toBeInTheDocument();
    expect(screen.getAllByText(SKILLS_CATALOG_PENDING_AVAILABILITY_LABEL)).toHaveLength(
      NEXUS_SKILLS_CATALOG_TOOL_IDS.length,
    );
    expect(screen.queryByText("Loading catalog…")).not.toBeInTheDocument();
  });

  it("replaces pending availability labels when the live catalog resolves", () => {
    authState.isLoading = false;
    authState.isAuthenticated = true;
    queryResults.set(nexusSkills.listCatalog, {
      sections: [
        {
          id: "knowledge_research",
          label: "Knowledge & Research",
          tools: [
            {
              toolId: "vault.agentic_retrieval",
              displayName: "SAGE Knowledge Vault",
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

  it("does not remain stuck on Loading catalog after auth becomes ready", () => {
    authState.isLoading = false;
    authState.isAuthenticated = true;
    render(<SkillsWorkspace />);
    expect(screen.queryByText("Loading catalog…")).not.toBeInTheDocument();
    expect(screen.getByText("Knowledge & Research")).toBeInTheDocument();
  });
});
