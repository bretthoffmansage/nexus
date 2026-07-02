import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  buildDeepResearchTaskMetadata,
  DEEP_RESEARCH_TASK_KIND,
  DEEP_RESEARCH_TOOL_ID,
} from "./deepResearchConfig";
import {
  DEFAULT_CONNECTOR_TOOL_IDS,
  MEMBERSHIP_FULL_SYNC_TOOL_ID,
  VAULT_EXPANSION_PASS_TOOL_ID,
} from "./p6config";
import { P5_SUPPORTED_TOOL_IDS, P5_TOOL_DISPLAY_TITLES } from "./p5config";
import type { TaskStatus } from "./taskStatus";

/** Re-export for Calendar registry consumers. */
export { MEMBERSHIP_FULL_SYNC_TOOL_ID, VAULT_EXPANSION_PASS_TOOL_ID } from "./p6config";
export { DEEP_RESEARCH_TASK_KIND, DEEP_RESEARCH_TOOL_ID } from "./deepResearchConfig";

export const VAULT_EXPANSION_PASS_TASK_KIND = "vault_expansion_pass";
export const VAULT_EXPANSION_PASS_REQUEST_TEXT = "Run Vault Expansion Pass";
export const VAULT_EXPANSION_PASS_DESCRIPTION =
  "Runs the current vault-owned Expansion Pass instructions through Claudia using a governed " +
  "write-capable worker. The pass may create and update Markdown notes across the active Sage Knowledge Vault.";
export const VAULT_EXPANSION_PASS_UNAVAILABLE_REASON =
  "Unavailable — Vault Expansion Pass requires Connector capability";
export const VAULT_EXPANSION_PASS_WAIT_MESSAGE = "Waiting for existing Vault Expansion Pass";
/** Claudia registry guidance — enforced on Claudia side; documented for operators. */
export const VAULT_EXPANSION_PASS_EXECUTION_TIMEOUT_SECONDS = 1800;

export const MEMBERSHIP_FULL_SYNC_TASK_KIND = "membership_full_sync";
export const MEMBERSHIP_FULL_SYNC_REQUEST_TEXT = "Run Membership.io full synchronization";
export const MEMBERSHIP_FULL_SYNC_DESCRIPTION =
  "Runs the full Membership.io catalog scrape, transcript refresh, index rebuild, and vault update.";
export const MEMBERSHIP_FULL_SYNC_UNAVAILABLE_REASON =
  "Unavailable — Claudia support required";
export const DEEP_RESEARCH_UNAVAILABLE_REASON =
  "Unavailable — Deep Research requires Connector capability";
export const MEMBERSHIP_FULL_SYNC_WAIT_MESSAGE = "Waiting for existing Membership.io sync";

/** Claudia registry guidance — enforced on Claudia side; documented for operators. */
export const MEMBERSHIP_FULL_SYNC_EXECUTION_TIMEOUT_SECONDS = 3600;

export type CalendarScheduledInputMode =
  | "text_request"
  | "no_input_action"
  | "structured_deep_research";

export type CalendarScheduledTaskKind =
  | "scheduled_task"
  | typeof MEMBERSHIP_FULL_SYNC_TASK_KIND
  | typeof VAULT_EXPANSION_PASS_TASK_KIND
  | typeof DEEP_RESEARCH_TASK_KIND;

export type CalendarScheduledToolDefinition = {
  requestedToolId: string;
  displayLabel: string;
  taskKind: CalendarScheduledTaskKind;
  inputMode: CalendarScheduledInputMode;
  description: string;
  fixedRequestText?: string;
  writeCapable: boolean;
  chatAvailable: boolean;
  requiresConnectorCapability: boolean;
  singleFlightKey?: string;
  executionTimeoutSeconds?: number;
};

const TEXT_SCHEDULED_TOOLS: readonly CalendarScheduledToolDefinition[] =
  P5_SUPPORTED_TOOL_IDS.map((requestedToolId) => ({
    requestedToolId,
    displayLabel:
      requestedToolId === "vault.agentic_retrieval"
        ? `${P5_TOOL_DISPLAY_TITLES["vault.agentic_retrieval"]} retrieval`
        : P5_TOOL_DISPLAY_TITLES["membership_io.transcript_retrieve"],
    taskKind: "scheduled_task" as const,
    inputMode: "text_request" as const,
    description: "",
    writeCapable: false,
    chatAvailable: true,
    requiresConnectorCapability: false,
  }));

export const DEEP_RESEARCH_SCHEDULED_TOOL: CalendarScheduledToolDefinition = {
  requestedToolId: DEEP_RESEARCH_TOOL_ID,
  displayLabel: "Deep Research",
  taskKind: DEEP_RESEARCH_TASK_KIND,
  inputMode: "structured_deep_research",
  description:
    "Runs governed multi-source research through the same Hermes deep research path as the Deep Research page.",
  writeCapable: false,
  chatAvailable: false,
  requiresConnectorCapability: true,
};

export const MEMBERSHIP_FULL_SYNC_SCHEDULED_TOOL: CalendarScheduledToolDefinition = {
  requestedToolId: MEMBERSHIP_FULL_SYNC_TOOL_ID,
  displayLabel: "Membership.io full sync",
  taskKind: MEMBERSHIP_FULL_SYNC_TASK_KIND,
  inputMode: "no_input_action",
  description: MEMBERSHIP_FULL_SYNC_DESCRIPTION,
  fixedRequestText: MEMBERSHIP_FULL_SYNC_REQUEST_TEXT,
  writeCapable: true,
  chatAvailable: false,
  requiresConnectorCapability: true,
  singleFlightKey: MEMBERSHIP_FULL_SYNC_TOOL_ID,
  executionTimeoutSeconds: MEMBERSHIP_FULL_SYNC_EXECUTION_TIMEOUT_SECONDS,
};

export const VAULT_EXPANSION_PASS_SCHEDULED_TOOL: CalendarScheduledToolDefinition = {
  requestedToolId: VAULT_EXPANSION_PASS_TOOL_ID,
  displayLabel: "Vault Expansion Pass",
  taskKind: VAULT_EXPANSION_PASS_TASK_KIND,
  inputMode: "no_input_action",
  description: VAULT_EXPANSION_PASS_DESCRIPTION,
  fixedRequestText: VAULT_EXPANSION_PASS_REQUEST_TEXT,
  writeCapable: true,
  chatAvailable: false,
  requiresConnectorCapability: true,
  singleFlightKey: VAULT_EXPANSION_PASS_TOOL_ID,
  executionTimeoutSeconds: VAULT_EXPANSION_PASS_EXECUTION_TIMEOUT_SECONDS,
};

/** Single registry for Nexus Calendar scheduled tools. */
export const CALENDAR_SCHEDULED_TOOLS: readonly CalendarScheduledToolDefinition[] = [
  ...TEXT_SCHEDULED_TOOLS,
  DEEP_RESEARCH_SCHEDULED_TOOL,
  MEMBERSHIP_FULL_SYNC_SCHEDULED_TOOL,
  VAULT_EXPANSION_PASS_SCHEDULED_TOOL,
];

export const CALENDAR_SCHEDULED_TOOL_IDS = CALENDAR_SCHEDULED_TOOLS.map(
  (tool) => tool.requestedToolId,
) as readonly string[];

export const CALENDAR_DEFAULT_SCHEDULED_TOOL_ID = P5_SUPPORTED_TOOL_IDS[0];

export function getCalendarScheduledTool(
  toolId: string,
): CalendarScheduledToolDefinition | undefined {
  return CALENDAR_SCHEDULED_TOOLS.find((tool) => tool.requestedToolId === toolId);
}

export function isCalendarScheduledToolId(toolId: string): boolean {
  return CALENDAR_SCHEDULED_TOOL_IDS.includes(toolId);
}

const SINGLE_FLIGHT_ACTIVE_STATUSES: readonly TaskStatus[] = [
  "queued",
  "claimed",
  "running",
  "cancel_requested",
];

/** True when an active Connector allowlist includes the tool id. */
export async function isConnectorToolReady(
  ctx: QueryCtx | MutationCtx,
  toolId: string,
): Promise<boolean> {
  const connectors = await ctx.db.query("nexusConnectors").collect();
  for (const connector of connectors) {
    if (connector.status !== "active" || !connector.enabled) continue;
    const allowed = connector.allowedToolIds ?? [...DEFAULT_CONNECTOR_TOOL_IDS];
    if (allowed.includes(toolId)) return true;
  }
  return false;
}

export async function isCalendarScheduledToolAvailable(
  ctx: QueryCtx | MutationCtx,
  toolId: string,
): Promise<boolean> {
  const tool = getCalendarScheduledTool(toolId);
  if (!tool) return false;
  if (!tool.requiresConnectorCapability) return true;
  return isConnectorToolReady(ctx, toolId);
}

export async function findActiveSingleFlightTask(
  ctx: QueryCtx | MutationCtx,
  singleFlightKey: string,
  excludeTaskId?: Id<"nexusTasks">,
) {
  for (const status of SINGLE_FLIGHT_ACTIVE_STATUSES) {
    const batch = await ctx.db
      .query("nexusTasks")
      .withIndex("by_status_and_queue_sequence", (q) => q.eq("status", status))
      .take(100);
    for (const task of batch) {
      if (task.requestedToolId !== singleFlightKey) continue;
      if (excludeTaskId && task._id === excludeTaskId) continue;
      return task;
    }
  }
  return null;
}

export function membershipFullSyncScheduledForUtcIso(scheduledForUtcMs: number): string {
  return new Date(scheduledForUtcMs).toISOString();
}

/** Stable researchRequestId for a Calendar-scheduled Deep Research event. */
export function buildCalendarDeepResearchRequestId(
  scheduledEventId: Id<"nexusScheduledEvents">,
): string {
  return `cal-dr-req:${scheduledEventId}`;
}

/** Stable execution idempotency key for one scheduled event fire. */
export function buildCalendarDeepResearchIdempotencyKey(
  scheduledEventId: Id<"nexusScheduledEvents">,
): string {
  return `schedule:${scheduledEventId}`;
}

/** Claudia contract metadata for a Calendar-dispatched Deep Research task. */
export function buildCalendarDeepResearchTaskMetadata(
  scheduledEventId: Id<"nexusScheduledEvents">,
) {
  const researchRequestId = buildCalendarDeepResearchRequestId(scheduledEventId);
  const idempotencyKey = buildCalendarDeepResearchIdempotencyKey(scheduledEventId);
  return buildDeepResearchTaskMetadata(researchRequestId, idempotencyKey);
}

export function calendarScheduledToolUnavailableReason(toolId: string): string {
  if (toolId === DEEP_RESEARCH_TOOL_ID) {
    return DEEP_RESEARCH_UNAVAILABLE_REASON;
  }
  if (toolId === MEMBERSHIP_FULL_SYNC_TOOL_ID) {
    return MEMBERSHIP_FULL_SYNC_UNAVAILABLE_REASON;
  }
  if (toolId === VAULT_EXPANSION_PASS_TOOL_ID) {
    return VAULT_EXPANSION_PASS_UNAVAILABLE_REASON;
  }
  return MEMBERSHIP_FULL_SYNC_UNAVAILABLE_REASON;
}

export type MembershipFullSyncTaskMetadata = {
  kind: typeof MEMBERSHIP_FULL_SYNC_TASK_KIND;
  explicitUserAction: "sync";
  scheduledEventId: Id<"nexusScheduledEvents">;
  scheduledForUtc: string;
  idempotencyKey: string;
};

/** Claudia contract payload — exactly five metadata keys, ISO UTC schedule instant. */
export function buildMembershipFullSyncTaskMetadata(
  scheduledEventId: Id<"nexusScheduledEvents">,
  scheduledForUtcMs: number,
): MembershipFullSyncTaskMetadata {
  const scheduledForUtc = membershipFullSyncScheduledForUtcIso(scheduledForUtcMs);
  return {
    kind: MEMBERSHIP_FULL_SYNC_TASK_KIND,
    explicitUserAction: "sync",
    scheduledEventId,
    scheduledForUtc,
    idempotencyKey: `${scheduledEventId}:${scheduledForUtc}`,
  };
}

export type VaultExpansionPassTaskMetadata = {
  kind: typeof VAULT_EXPANSION_PASS_TASK_KIND;
  sourcePage: "nexus_calendar";
  explicitUserAction: "run";
  scheduledEventId: Id<"nexusScheduledEvents">;
  scheduledForUtc: string;
  idempotencyKey: string;
};

/** Claudia contract payload — no-input Vault Expansion Pass, ISO UTC schedule instant. */
export function buildVaultExpansionPassTaskMetadata(
  scheduledEventId: Id<"nexusScheduledEvents">,
  scheduledForUtcMs: number,
): VaultExpansionPassTaskMetadata {
  const scheduledForUtc = membershipFullSyncScheduledForUtcIso(scheduledForUtcMs);
  return {
    kind: VAULT_EXPANSION_PASS_TASK_KIND,
    sourcePage: "nexus_calendar",
    explicitUserAction: "run",
    scheduledEventId,
    scheduledForUtc,
    idempotencyKey: `${scheduledEventId}:${scheduledForUtc}`,
  };
}
