import { LIBRARY_DROPZONE_TOOL_ID } from "./libraryDropzoneConfig";
import {
  DEFAULT_CONNECTOR_TOOL_IDS,
  executionSafetyForTool,
  MEMBERSHIP_FULL_SYNC_TOOL_ID,
  type ExecutionSafetyClass,
} from "./p6config";
import { P5_SUPPORTED_TOOL_IDS } from "./p5config";
import { isCalendarScheduledToolAvailable } from "./calendarScheduledTools";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type SkillsCatalogCategory =
  | "knowledge_research"
  | "library_documents"
  | "scheduled_maintenance";

export type SkillsAccessMode = "chat" | "calendar" | "library" | "connector";

export type SkillsInputType = "text_request" | "no_input_action" | "library_upload";

export type SkillsCurrentAvailability =
  | "available"
  | "connector_required"
  | "connector_offline"
  | "unavailable"
  | "scheduled_only"
  | "library_only";

export type SkillsCatalogToolDef = {
  toolId: string;
  displayName: string;
  shortDescription: string;
  category: SkillsCatalogCategory;
  accessModes: readonly SkillsAccessMode[];
  inputType: SkillsInputType;
  ordinaryChatAvailable: boolean;
  calendarAvailable: boolean;
  libraryAvailable: boolean;
  requiresConnector: boolean;
  /** Calendar scheduling needs explicit Connector allowlist entry (not default). */
  calendarRequiresExplicitCapability?: boolean;
};

export const SKILLS_CATALOG_SECTIONS: readonly {
  id: SkillsCatalogCategory;
  label: string;
}[] = [
  { id: "knowledge_research", label: "Knowledge & Research" },
  { id: "library_documents", label: "Library & Documents" },
  { id: "scheduled_maintenance", label: "Scheduled Maintenance" },
];

/**
 * Static Nexus-accessible tool definitions — derived from canonical registries.
 * Availability is resolved at query time from Connector state.
 */
export const SKILLS_CATALOG_TOOL_DEFS: readonly SkillsCatalogToolDef[] = [
  {
    toolId: "vault.agentic_retrieval",
    displayName: "SAGE Knowledge Vault",
    shortDescription:
      "Searches and synthesizes information from the approved SAGE Knowledge Base vault.",
    category: "knowledge_research",
    accessModes: ["chat", "calendar", "connector"],
    inputType: "text_request",
    ordinaryChatAvailable: true,
    calendarAvailable: true,
    libraryAvailable: false,
    requiresConnector: true,
  },
  {
    toolId: "membership_io.transcript_retrieve",
    displayName: "Membership.io Transcript Search",
    shortDescription:
      "Searches and retrieves relevant knowledge from the indexed Membership.io transcript library.",
    category: "knowledge_research",
    accessModes: ["chat", "calendar", "connector"],
    inputType: "text_request",
    ordinaryChatAvailable: true,
    calendarAvailable: true,
    libraryAvailable: false,
    requiresConnector: true,
  },
  {
    toolId: LIBRARY_DROPZONE_TOOL_ID,
    displayName: "Library Dropzone Processing",
    shortDescription:
      "Processes a document uploaded through Nexus Library and routes approved knowledge into the governed vault workflow.",
    category: "library_documents",
    accessModes: ["library", "connector"],
    inputType: "library_upload",
    ordinaryChatAvailable: false,
    calendarAvailable: false,
    libraryAvailable: true,
    requiresConnector: true,
  },
  {
    toolId: MEMBERSHIP_FULL_SYNC_TOOL_ID,
    displayName: "Membership.io Full Sync",
    shortDescription:
      "Runs the complete Membership.io catalog scrape, transcript refresh, index rebuild, and governed vault update.",
    category: "scheduled_maintenance",
    accessModes: ["calendar", "connector"],
    inputType: "no_input_action",
    ordinaryChatAvailable: false,
    calendarAvailable: true,
    libraryAvailable: false,
    requiresConnector: true,
    calendarRequiresExplicitCapability: true,
  },
] as const;

/** All tool ids Nexus may surface in the Skills catalog. */
export const NEXUS_SKILLS_CATALOG_TOOL_IDS: readonly string[] = SKILLS_CATALOG_TOOL_DEFS.map(
  (tool) => tool.toolId,
);

export function skillsCatalogToolIdsMatchAuthority(): boolean {
  const expected = new Set([
    ...P5_SUPPORTED_TOOL_IDS,
    LIBRARY_DROPZONE_TOOL_ID,
    MEMBERSHIP_FULL_SYNC_TOOL_ID,
  ]);
  return (
    NEXUS_SKILLS_CATALOG_TOOL_IDS.length === expected.size &&
    NEXUS_SKILLS_CATALOG_TOOL_IDS.every((id) => expected.has(id))
  );
}

export type SkillsCatalogEntry = SkillsCatalogToolDef & {
  safetyLevel: ExecutionSafetyClass;
  currentAvailability: SkillsCurrentAvailability;
  availabilityLabel: string;
};

export type SkillsCatalogSectionView = {
  id: SkillsCatalogCategory;
  label: string;
  tools: SkillsCatalogEntry[];
};

const AVAILABILITY_LABELS: Record<SkillsCurrentAvailability, string> = {
  available: "Available",
  connector_required: "Connector required",
  connector_offline: "Connector offline",
  unavailable: "Unavailable",
  scheduled_only: "Scheduled via Calendar",
  library_only: "Available via Library",
};

export function accessModeLabel(mode: SkillsAccessMode): string {
  switch (mode) {
    case "chat":
      return "Chat";
    case "calendar":
      return "Calendar";
    case "library":
      return "Library";
    case "connector":
      return "Connector";
  }
}

function connectorAllowsTool(allowedToolIds: readonly string[], toolId: string): boolean {
  const allowed = allowedToolIds.length > 0 ? allowedToolIds : [...DEFAULT_CONNECTOR_TOOL_IDS];
  return allowed.includes(toolId);
}

export function resolveSkillsToolAvailability(
  def: SkillsCatalogToolDef,
  options: {
    connectorConfigured: boolean;
    connectorOnline: boolean;
    allowedToolIds: readonly string[];
    calendarCapabilityAvailable?: boolean;
  },
): { currentAvailability: SkillsCurrentAvailability; availabilityLabel: string } {
  const { connectorConfigured, connectorOnline, allowedToolIds } = options;
  const calendarReady =
    options.calendarCapabilityAvailable ??
    (!def.calendarRequiresExplicitCapability || connectorAllowsTool(allowedToolIds, def.toolId));

  if (!connectorConfigured) {
    return {
      currentAvailability: "connector_required",
      availabilityLabel: AVAILABILITY_LABELS.connector_required,
    };
  }
  if (!connectorOnline) {
    return {
      currentAvailability: "connector_offline",
      availabilityLabel: AVAILABILITY_LABELS.connector_offline,
    };
  }

  if (def.libraryAvailable && !def.ordinaryChatAvailable && !def.calendarAvailable) {
    if (connectorAllowsTool(allowedToolIds, def.toolId)) {
      return {
        currentAvailability: "library_only",
        availabilityLabel: AVAILABILITY_LABELS.library_only,
      };
    }
    return {
      currentAvailability: "connector_required",
      availabilityLabel: AVAILABILITY_LABELS.connector_required,
    };
  }

  if (def.calendarRequiresExplicitCapability) {
    if (calendarReady && connectorAllowsTool(allowedToolIds, def.toolId)) {
      return {
        currentAvailability: "scheduled_only",
        availabilityLabel: AVAILABILITY_LABELS.scheduled_only,
      };
    }
    return {
      currentAvailability: "unavailable",
      availabilityLabel: AVAILABILITY_LABELS.unavailable,
    };
  }

  if (!connectorAllowsTool(allowedToolIds, def.toolId)) {
    return {
      currentAvailability: "unavailable",
      availabilityLabel: AVAILABILITY_LABELS.unavailable,
    };
  }

  return {
    currentAvailability: "available",
    availabilityLabel: AVAILABILITY_LABELS.available,
  };
}

export function buildSkillsCatalogSections(
  options: {
    connectorConfigured: boolean;
    connectorOnline: boolean;
    allowedToolIds: readonly string[];
    calendarCapabilityByToolId?: Record<string, boolean>;
  },
): SkillsCatalogSectionView[] {
  const entries: SkillsCatalogEntry[] = SKILLS_CATALOG_TOOL_DEFS.map((def) => {
    const { currentAvailability, availabilityLabel } = resolveSkillsToolAvailability(def, {
      ...options,
      calendarCapabilityAvailable: options.calendarCapabilityByToolId?.[def.toolId],
    });
    return {
      ...def,
      safetyLevel: executionSafetyForTool(def.toolId),
      currentAvailability,
      availabilityLabel,
    };
  });

  return SKILLS_CATALOG_SECTIONS.map((section) => ({
    ...section,
    tools: entries.filter((entry) => entry.category === section.id),
  })).filter((section) => section.tools.length > 0);
}

/** Async calendar capability check for tools that require explicit Connector allowlist. */
export async function calendarCapabilityAvailable(
  ctx: QueryCtx | MutationCtx,
  toolId: string,
): Promise<boolean> {
  return isCalendarScheduledToolAvailable(ctx, toolId);
}
