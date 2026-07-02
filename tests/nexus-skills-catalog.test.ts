// @vitest-environment edge-runtime
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { api } from "@/convex/_generated/api";
import {
  buildSkillsCatalogSections,
  NEXUS_SKILLS_CATALOG_TOOL_IDS,
  resolveSkillsToolAvailability,
  SKILLS_CATALOG_TOOL_DEFS,
  skillsCatalogToolIdsMatchAuthority,
} from "@/convex/lib/nexusSkillsCatalog";
import { LIBRARY_DROPZONE_TOOL_ID } from "@/convex/lib/libraryDropzoneConfig";
import { MEMBERSHIP_FULL_SYNC_TOOL_ID } from "@/convex/lib/p6config";
import { P5_TOOL_DISPLAY_TITLES } from "@/convex/lib/p5config";
import { NEXUS_TOOL_REGISTRY } from "@/lib/navigation/toolRegistry";
import { IDENTITY_A, p5Test, seedApprovedReader } from "./helpers/convexP5";
import { seedConnector } from "./helpers/convexP6";

const ROOT = path.resolve(import.meta.dirname, "..");

describe("Nexus Skills catalog", () => {
  it("static catalog matches canonical Nexus tool authority", () => {
    expect(skillsCatalogToolIdsMatchAuthority()).toBe(true);
    expect(NEXUS_SKILLS_CATALOG_TOOL_IDS).toEqual([
      "vault.agentic_retrieval",
      "membership_io.transcript_retrieve",
      LIBRARY_DROPZONE_TOOL_ID,
      MEMBERSHIP_FULL_SYNC_TOOL_ID,
    ]);
  });

  it("groups tools into sections without duplicates", () => {
    const sections = buildSkillsCatalogSections({
      connectorConfigured: true,
      connectorOnline: true,
      allowedToolIds: NEXUS_SKILLS_CATALOG_TOOL_IDS,
      calendarCapabilityByToolId: { [MEMBERSHIP_FULL_SYNC_TOOL_ID]: true },
    });
    const ids = sections.flatMap((s) => s.tools.map((t) => t.toolId));
    expect(ids).toHaveLength(new Set(ids).size);
    expect(ids).toHaveLength(4);
    expect(sections.map((s) => s.label)).toEqual([
      "Knowledge & Research",
      "Library & Documents",
      "Scheduled Maintenance",
    ]);
  });

  it("represents access modes for Chat, Calendar, and Library surfaces", () => {
    const vault = SKILLS_CATALOG_TOOL_DEFS.find((t) => t.toolId === "vault.agentic_retrieval")!;
    const dropzone = SKILLS_CATALOG_TOOL_DEFS.find((t) => t.toolId === LIBRARY_DROPZONE_TOOL_ID)!;
    const fullSync = SKILLS_CATALOG_TOOL_DEFS.find(
      (t) => t.toolId === MEMBERSHIP_FULL_SYNC_TOOL_ID,
    )!;
    expect(vault.ordinaryChatAvailable).toBe(true);
    expect(vault.calendarAvailable).toBe(true);
    expect(dropzone.ordinaryChatAvailable).toBe(false);
    expect(dropzone.libraryAvailable).toBe(true);
    expect(fullSync.ordinaryChatAvailable).toBe(false);
    expect(fullSync.calendarAvailable).toBe(true);
    expect(fullSync.inputType).toBe("no_input_action");
  });

  it("uses Transcript retrieval as the transcript tool display title", () => {
    const transcript = SKILLS_CATALOG_TOOL_DEFS.find(
      (t) => t.toolId === "membership_io.transcript_retrieve",
    )!;
    expect(transcript.displayName).toBe("Transcript retrieval");
    expect(transcript.displayName).toBe(P5_TOOL_DISPLAY_TITLES["membership_io.transcript_retrieve"]);
    expect(transcript.shortDescription).toContain("Membership.io");
  });

  it("does not mark tools available without Connector advertisement", () => {
    const unavailable = resolveSkillsToolAvailability(
      SKILLS_CATALOG_TOOL_DEFS.find((t) => t.toolId === MEMBERSHIP_FULL_SYNC_TOOL_ID)!,
      {
        connectorConfigured: true,
        connectorOnline: true,
        allowedToolIds: ["vault.agentic_retrieval"],
        calendarCapabilityAvailable: false,
      },
    );
    expect(unavailable.currentAvailability).toBe("unavailable");

    const dropzone = resolveSkillsToolAvailability(
      SKILLS_CATALOG_TOOL_DEFS.find((t) => t.toolId === LIBRARY_DROPZONE_TOOL_ID)!,
      {
        connectorConfigured: false,
        connectorOnline: false,
        allowedToolIds: [],
      },
    );
    expect(dropzone.currentAvailability).toBe("connector_required");
  });

  it("listSkillsCatalog returns a non-empty grouped catalog", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    await seedConnector(t);
    const catalog = await t.withIdentity(IDENTITY_A).query(api.skillsCatalog.listSkillsCatalog, {});
    expect(catalog.sections.length).toBeGreaterThan(0);
    const tools = catalog.sections.flatMap((s) => s.tools);
    expect(tools.length).toBe(4);
    for (const tool of tools) {
      expect(tool.displayName).toBeTruthy();
      expect(tool.shortDescription).toBeTruthy();
    }
  });

  it("listSkillsCatalog returns known tools without an active Connector", async () => {
    const t = p5Test();
    await seedApprovedReader(t, IDENTITY_A);
    const catalog = await t.withIdentity(IDENTITY_A).query(api.skillsCatalog.listSkillsCatalog, {});
    const tools = catalog.sections.flatMap((s) => s.tools);
    expect(tools.map((t) => t.toolId)).toEqual(NEXUS_SKILLS_CATALOG_TOOL_IDS);
    expect(tools.every((tool) => tool.currentAvailability === "connector_required")).toBe(true);
    expect(catalog.connectorConfigured).toBe(false);
  });
});

describe("Nexus Skills page and navigation", () => {
  it("Skills workspace has no legacy Local Claudia placeholder copy", () => {
    const src = readFileSync(
      path.join(ROOT, "components/workspace/port/SkillsWorkspace.tsx"),
      "utf8",
    );
    expect(src).not.toContain("Local Claudia only");
    expect(src).not.toContain("No skills loaded in hosted Nexus");
    expect(src).not.toContain("legacy local console");
    expect(src).not.toContain("ToolAvailabilityBanner");
    expect(src).not.toContain("Markdown editor");
    expect(src).toContain("nexusSkills");
    expect(src).not.toContain("runTool");
    expect(src).not.toContain("submitRequest");
    expect(src).toContain("readyForPrivateQueries");
    expect(src).not.toMatch(/\{\s*ready\s*\}\s*=\s*useNexusAuthReadiness/);
    expect(src).toContain("buildSkillsCatalogSections");
  });

  it("Skills sidebar item has no minus symbol badge and no Connector badge", () => {
    const skills = NEXUS_TOOL_REGISTRY.find((t) => t.id === "skills");
    expect(skills?.availability).toBe("available");

    const navSrc = readFileSync(path.join(ROOT, "components/layout/ToolNavigation.tsx"), "utf8");
    expect(navSrc).toContain('tool.availability !== "available"');
    expect(navSrc).toContain('"—"');
  });

  it("Calendar and Vault Library sidebar presentation remains unchanged", () => {
    expect(NEXUS_TOOL_REGISTRY.find((t) => t.id === "calendar")?.availability).toBe("available");
    const library = NEXUS_TOOL_REGISTRY.find((t) => t.id === "documents");
    expect(library?.availability).toBe("available");
    expect(library?.label).toBe("Vault Library");
  });
});
