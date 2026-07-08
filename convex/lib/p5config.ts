import { v } from "convex/values";

/**
 * P5 — Private conversations, persistent tasks, and shared queue.
 *
 * Single source of truth for P5 limits, the supported tool allowlist, queue
 * policy, and the development "queue without connector" flag. Both the Convex
 * functions and the Next.js UI import from here so limits are never hardcoded
 * in more than one place.
 */

/** Bounded sizes and page limits. Everything user-controlled is clamped here. */
export const P5_LIMITS = {
  maxConversationTitleLength: 200,
  maxRequestLength: 8_000,
  maxMessageLength: 16_000,
  maxResultLength: 100_000,
  maxResultSummaryLength: 500,
  maxSourceTitleLength: 300,
  maxSourceLocatorLength: 2_000,
  maxSourceExcerptLength: 500,
  maxSourcesPerTask: 50,
  maxProgressMessageLength: 1_000,
  maxErrorMessageLength: 2_000,
  conversationsPageSize: 30,
  conversationsPageSizeMax: 100,
  messagesPageSize: 100,
  messagesPageSizeMax: 200,
  tasksPageSize: 30,
  tasksPageSizeMax: 100,
  progressPageSize: 100,
  maxRetryDepth: 10,
  idempotencyKeyMinLength: 8,
  idempotencyKeyMaxLength: 200,
  recentHistoryLimit: 50,
  /** Bounded metadata: max keys and max stringified size guard. */
  maxMetadataKeys: 24,
  maxMetadataValueLength: 1_000,
} as const;

/**
 * Tool IDs an ordinary user may request in P5. Tightly controlled: only the
 * two read-only retrieval tools the architecture allows for the MVP.
 */
export const P5_SUPPORTED_TOOL_IDS = [
  "vault.agentic_retrieval",
  "membership_io.transcript_retrieve",
] as const;

export type P5ToolId = (typeof P5_SUPPORTED_TOOL_IDS)[number];

/** User-facing tool titles shared by Skills, Calendar, and other Nexus surfaces. */
export const P5_TOOL_DISPLAY_TITLES: Record<P5ToolId, string> = {
  "vault.agentic_retrieval": "SAGE Knowledge Vault",
  "membership_io.transcript_retrieve": "Transcript retrieval",
};

/** Safe default when the UI does not (yet) expose explicit tool selection. */
export const P5_DEFAULT_TOOL_ID: P5ToolId = "vault.agentic_retrieval";

export function isSupportedToolId(value: string): value is P5ToolId {
  return (P5_SUPPORTED_TOOL_IDS as readonly string[]).includes(value);
}

/** Queue policy. Priority and queueSequence are server-owned; never client args. */
export const P5_QUEUE = {
  /** Default priority for all user-created tasks (lower runs first). */
  defaultPriority: 100,
  /**
   * P5 has no worker. Allow durable queued tasks to accumulate (default true so
   * persistence is testable). A future package may require explicit operator
   * acknowledgement before enqueuing without a connector.
   */
  allowQueueWithoutConnector: true,
} as const;

/** Idempotency keys: nonempty, bounded, URL/UUID-safe character set only. */
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_.:-]+$/;

export function isValidIdempotencyKey(value: string): boolean {
  if (typeof value !== "string") return false;
  if (
    value.length < P5_LIMITS.idempotencyKeyMinLength ||
    value.length > P5_LIMITS.idempotencyKeyMaxLength
  ) {
    return false;
  }
  return IDEMPOTENCY_KEY_PATTERN.test(value);
}

/** Collapse runs of whitespace and trim — applied only to titles, never bodies. */
export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Trim a string to a maximum length without throwing. */
export function clampLength(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/** Clamp a page-size request into [1, max]. */
export function clampPageSize(requested: number | undefined, fallback: number, max: number): number {
  if (typeof requested !== "number" || !Number.isFinite(requested) || requested <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(requested), max);
}

/**
 * Deterministic, dependency-free FNV-1a hash of normalized request text. Used
 * only as an optional dedupe/grouping hint — never for authorization or
 * idempotency (the per-owner idempotency key owns that).
 */
export function normalizedRequestHash(requestText: string): string {
  const normalized = normalizeWhitespace(requestText).toLowerCase();
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Sanitized worker-activity readback (UI/readback only).
 *
 * Finite allowlists + bounds mirrored from Claudia's `core_api/worker_activity`
 * so both ends agree on the safe vocabulary. These govern the additive
 * `worker_activity` progress event: the Connector may only ever transport an
 * allowlisted (surface, toolId, worker, phase, status) tuple plus a bounded,
 * single-line message. Nothing outside these lists is persisted or rendered.
 */
export const WORKER_ACTIVITY_LIMITS = {
  /** Hard bound on a single sanitized activity message (also clamped on render). */
  maxMessageLength: 300,
  /** Nexus renders only the latest N lines of the activity feed. */
  visibleLineCount: 4,
  /** Per-task cap on persisted activity events (defense against runaway emission). */
  maxEventsPerTask: 100,
} as const;

export const WORKER_ACTIVITY_SURFACES = ["deep_research", "chat"] as const;
export type WorkerActivitySurface = (typeof WORKER_ACTIVITY_SURFACES)[number];

export const WORKER_ACTIVITY_WORKERS = ["system", "hermes", "cursor_cli", "claude", "codex"] as const;
export type WorkerActivityWorker = (typeof WORKER_ACTIVITY_WORKERS)[number];

export const WORKER_ACTIVITY_PHASES = [
  "planning",
  "preparing",
  "retrieval",
  "web_search",
  "web_extract",
  "vault_retrieval",
  "transcript_retrieval",
  "source_review",
  "synthesis",
  "finalizing",
  "cleanup",
] as const;
export type WorkerActivityPhase = (typeof WORKER_ACTIVITY_PHASES)[number];

export const WORKER_ACTIVITY_STATUSES = [
  "started",
  "running",
  "waiting",
  "completed",
  "failed",
  "unavailable",
  "timed_out",
] as const;
export type WorkerActivityStatus = (typeof WORKER_ACTIVITY_STATUSES)[number];

export const WORKER_ACTIVITY_TOOL_IDS = [
  "research.hermes_deep_research",
  "vault.agentic_retrieval",
  "membership_io.transcript_retrieve",
] as const;
export type WorkerActivityToolId = (typeof WORKER_ACTIVITY_TOOL_IDS)[number];

export function isWorkerActivitySurface(v: string): v is WorkerActivitySurface {
  return (WORKER_ACTIVITY_SURFACES as readonly string[]).includes(v);
}
export function isWorkerActivityWorker(v: string): v is WorkerActivityWorker {
  return (WORKER_ACTIVITY_WORKERS as readonly string[]).includes(v);
}
export function isWorkerActivityPhase(v: string): v is WorkerActivityPhase {
  return (WORKER_ACTIVITY_PHASES as readonly string[]).includes(v);
}
export function isWorkerActivityStatus(v: string): v is WorkerActivityStatus {
  return (WORKER_ACTIVITY_STATUSES as readonly string[]).includes(v);
}
export function isWorkerActivityToolId(v: string): v is WorkerActivityToolId {
  return (WORKER_ACTIVITY_TOOL_IDS as readonly string[]).includes(v);
}

/** Convex validator for the bounded metadata blobs allowed on messages/events. */
export const boundedMetadataValidator = v.record(
  v.string(),
  v.union(v.string(), v.number(), v.boolean(), v.null()),
);

export type BoundedMetadata = Record<string, string | number | boolean | null>;
