import { LIBRARY_DROPZONE_TOOL_ID } from "./libraryDropzoneConfig";
import { DEEP_RESEARCH_TOOL_ID } from "./deepResearchConfig";
import { P5_LIMITS, P5_SUPPORTED_TOOL_IDS, type P5ToolId } from "./p5config";

/** Canonical Claudia tool — full Membership.io parent workflow (Calendar-only in Nexus). */
export const MEMBERSHIP_FULL_SYNC_TOOL_ID = "membership_io.catalog_refresh_and_vault_update";

/**
 * P6 — Trusted Connector queue protocol.
 *
 * Single source of truth for protocol version, signing/replay policy, lease
 * timing, request limits, concurrency policy, and execution-safety
 * classification. Every P6 handler imports from here — no value below may be
 * hardcoded elsewhere. Contains no secrets: the Connector shared secret lives
 * only in Convex deployment environment configuration
 * (see `convex/lib/connectorAuth.ts`).
 */

/** Canonical protocol version. Must match the client's `nexus-connector-v1` prefix. */
export const P6_PROTOCOL_VERSION = "v1";
export const P6_SIGNING_PREFIX = "nexus-connector-v1";

/** Request signing / replay-protection policy. */
export const P6_SIGNING = {
  /** Maximum allowed |now - requestTimestamp|. */
  maxClockSkewMs: 5 * 60 * 1000,
  connectorIdMinLength: 3,
  connectorIdMaxLength: 100,
  nonceMinLength: 16,
  nonceMaxLength: 128,
  /** How long a consumed nonce is retained before it may be pruned. */
  nonceTtlMs: 10 * 60 * 1000,
  signatureHexLength: 64, // hex-encoded SHA-256 HMAC output (32 bytes)
} as const;

/** Lease timing policy for a claimed task. */
export const P6_LEASE = {
  /** Duration granted at claim time. */
  initialLeaseDurationMs: 2 * 60 * 1000,
  /** Recommended interval for the Connector to send a lease heartbeat. */
  heartbeatIntervalRecommendationMs: 30 * 1000,
  /** Extension applied to `leaseExpiresAt` on each successful heartbeat. */
  renewalExtensionMs: 2 * 60 * 1000,
  /** After this many silent seconds, a Connector is considered offline. */
  connectorOfflineThresholdMs: 90 * 1000,
  /** Cap on how many times one task's abandoned lease may be recovered
   * before it is failed outright instead of requeued again. */
  maxLeaseRecoveries: 3,
} as const;

/** Bounded sizes for every Connector-supplied payload. Reuses P5 limits where
 * the same field already has a canonical bound (results/sources/progress are
 * user-visible either way, so one limit governs both origins). */
export const P6_LIMITS = {
  /** Raw HTTP body size ceiling, enforced before any parsing. */
  maxRequestBodyBytes: 64 * 1024,
  maxProgressMessageLength: P5_LIMITS.maxProgressMessageLength,
  maxStageLength: 50,
  maxAnswerLength: P5_LIMITS.maxResultLength,
  maxSourceCount: P5_LIMITS.maxSourcesPerTask,
  maxSourceTitleLength: P5_LIMITS.maxSourceTitleLength,
  maxSourceLocatorLength: P5_LIMITS.maxSourceLocatorLength,
  maxSourceExcerptLength: P5_LIMITS.maxSourceExcerptLength,
  maxErrorMessageLength: P5_LIMITS.maxErrorMessageLength,
  maxDisplayNameLength: 200,
  maxSoftwareVersionLength: 100,
  maxHostLabelLength: 200,
  maxEnvironmentLength: 50,
  maxLeaseIdLength: 200,
} as const;

/** Concurrency policy. P6 ships single-worker mode only; the schema (a scalar
 * `currentTaskId`/`currentLeaseId` pair per Connector) intentionally does not
 * yet support tracking multiple simultaneous claims — raising this value
 * would require replacing those scalar fields with a bounded list or a
 * separate claims table, not just changing this number. */
export const P6_CONCURRENCY = {
  maxConcurrentTasksPerConnector: 1,
} as const;

/** Optional operator-configured cap on total accumulated queued tasks.
 * `undefined` means unlimited (P6 default — P5 already persists queued work
 * indefinitely while the Connector is offline, and P6 does not change that). */
export const P6_QUEUE = {
  maxAccumulatedQueuedTasks: undefined as number | undefined,
};

/** Execution-safety classification governs stale-lease recovery policy. */
export const EXECUTION_SAFETY_CLASSES = [
  "read_only_idempotent",
  "write_requires_confirmation",
  "non_idempotent",
] as const;
export type ExecutionSafetyClass = (typeof EXECUTION_SAFETY_CLASSES)[number];

/** Every P5-supported tool is read-only retrieval today. Unknown tool ids are
 * treated as `non_idempotent` (fail safe: never blindly requeue unknown work). */
const TOOL_EXECUTION_SAFETY: Record<string, ExecutionSafetyClass> = {
  "vault.agentic_retrieval": "read_only_idempotent",
  "membership_io.transcript_retrieve": "read_only_idempotent",
  [LIBRARY_DROPZONE_TOOL_ID]: "write_requires_confirmation",
  [MEMBERSHIP_FULL_SYNC_TOOL_ID]: "write_requires_confirmation",
  [DEEP_RESEARCH_TOOL_ID]: "read_only_idempotent",
};

export function executionSafetyForTool(toolId: string): ExecutionSafetyClass {
  return (TOOL_EXECUTION_SAFETY as Record<string, ExecutionSafetyClass>)[toolId] ?? "non_idempotent";
}

/** Tool ids a Connector may claim when it declares no explicit allowlist. */
export const DEFAULT_CONNECTOR_TOOL_IDS: readonly string[] = [
  ...P5_SUPPORTED_TOOL_IDS,
  LIBRARY_DROPZONE_TOOL_ID,
];

/** Full operator-configurable tool universe (includes tools not on the default allowlist). */
export const KNOWN_CONNECTOR_TOOL_IDS: readonly string[] = [
  ...DEFAULT_CONNECTOR_TOOL_IDS,
  MEMBERSHIP_FULL_SYNC_TOOL_ID,
  DEEP_RESEARCH_TOOL_ID,
];

/** Approved Connector progress "stage" values (bounded vocabulary; the
 * Connector cannot invent arbitrary system-authority events). */
export const CONNECTOR_PROGRESS_STAGES = [
  "accepted",
  "retrieving",
  "analyzing",
  "synthesizing",
  "finalizing",
  "downloading_attachment",
  "verifying_attachment",
  "staging_attachment",
  "processing_document",
] as const;
export type ConnectorProgressStage = (typeof CONNECTOR_PROGRESS_STAGES)[number];

export function isConnectorProgressStage(value: string): value is ConnectorProgressStage {
  return (CONNECTOR_PROGRESS_STAGES as readonly string[]).includes(value);
}

/** Bounded Connector-level operating states reported on the health heartbeat. */
export const CONNECTOR_OPERATING_STATES = ["idle", "claiming", "running", "degraded"] as const;
export type ConnectorOperatingState = (typeof CONNECTOR_OPERATING_STATES)[number];

export function isConnectorOperatingState(value: string): value is ConnectorOperatingState {
  return (CONNECTOR_OPERATING_STATES as readonly string[]).includes(value);
}

/** Truthful Connector presence states surfaced to the Nexus UI (§ PART S). */
export const CONNECTOR_PRESENCE_STATES = [
  "not_configured",
  "offline",
  "online_idle",
  "online_busy",
  "degraded",
  "disabled",
] as const;
export type ConnectorPresenceState = (typeof CONNECTOR_PRESENCE_STATES)[number];
