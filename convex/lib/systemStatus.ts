import { P6_LEASE } from "./p6config";
import { v } from "convex/values";

/** Claudia heartbeat optional field contract version. */
export const SYSTEM_STATUS_CONTRACT_VERSION = "system_status_v1";

export const systemComponentRecordValidator = v.object({
  active: v.boolean(),
  observedAt: v.number(),
});

export const systemStatusRecordValidator = v.object({
  contractVersion: v.literal(SYSTEM_STATUS_CONTRACT_VERSION),
  snapshotId: v.string(),
  snapshotObservedAt: v.number(),
  sessionId: v.string(),
  components: v.object({
    core_api: v.optional(systemComponentRecordValidator),
    nexus_connector: v.optional(systemComponentRecordValidator),
    vault_retrieval: v.optional(systemComponentRecordValidator),
    vault: v.optional(systemComponentRecordValidator),
    cursor_cli: v.optional(systemComponentRecordValidator),
    codex_cli: v.optional(systemComponentRecordValidator),
    claude_cli: v.optional(systemComponentRecordValidator),
    cleanup_storage: v.optional(systemComponentRecordValidator),
  }),
});

// Card render order. Worker CLIs are grouped Cursor → Codex → Claude so the
// first-priority read-only worker leads; `cursor_cli` is the additive eighth
// component key (see claudia_nexus_system_status_handoff_v1).
export const SYSTEM_COMPONENT_KEYS = [
  "core_api",
  "nexus_connector",
  "vault_retrieval",
  "vault",
  "cursor_cli",
  "codex_cli",
  "claude_cli",
  "cleanup_storage",
] as const;

export type SystemComponentKey = (typeof SYSTEM_COMPONENT_KEYS)[number];

export type SystemComponentState = {
  active: boolean;
  observedAt: number;
};

export type StoredSystemStatus = {
  contractVersion: typeof SYSTEM_STATUS_CONTRACT_VERSION;
  snapshotId: string;
  snapshotObservedAt: number;
  sessionId: string;
  components: Partial<Record<SystemComponentKey, SystemComponentState>>;
};

export const P6_SYSTEM_STATUS = {
  /** Cursor/Claude/Codex CLI observation freshness (24h). */
  cliObservationTtlMs: 86_400_000,
  maxSnapshotIdLength: 256,
  maxSessionIdLength: 128,
  maxContractVersionLength: 64,
} as const;

/** Whole snapshot TTL reuses the authoritative Connector offline threshold. */
export function systemStatusSnapshotTtlMs(): number {
  return P6_LEASE.connectorOfflineThresholdMs;
}

/** The command-line worker runtimes that share the centralized CLI TTL. */
export const CLI_WORKER_KEYS = ["cursor_cli", "codex_cli", "claude_cli"] as const;

export function isCliWorkerComponent(key: SystemComponentKey): boolean {
  return (CLI_WORKER_KEYS as readonly string[]).includes(key);
}

export function componentObservationTtlMs(key: SystemComponentKey): number {
  return isCliWorkerComponent(key)
    ? P6_SYSTEM_STATUS.cliObservationTtlMs
    : P6_LEASE.connectorOfflineThresholdMs;
}

const ISO_UTC_Z =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

export function parseUtcInstantZ(value: unknown): number | null {
  if (typeof value !== "string" || !ISO_UTC_Z.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function boundedString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

function parseComponent(value: unknown): SystemComponentState | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.active !== "boolean") return null;
  const observedAt = parseUtcInstantZ(row.observedAt);
  if (observedAt === null) return null;
  return { active: row.active, observedAt };
}

/**
 * Parse optional heartbeat `systemStatus`. Returns `null` when the payload is
 * present but not trustworthy (fail closed — caller must not persist it).
 * Returns `undefined` when the field is absent (`undefined` input).
 */
export function parseSystemStatus(
  raw: unknown,
): StoredSystemStatus | null | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object") return null;

  const obj = raw as Record<string, unknown>;
  if (obj.contractVersion !== SYSTEM_STATUS_CONTRACT_VERSION) return null;

  const snapshotId = boundedString(obj.snapshotId, P6_SYSTEM_STATUS.maxSnapshotIdLength);
  const sessionId = boundedString(obj.sessionId, P6_SYSTEM_STATUS.maxSessionIdLength);
  const snapshotObservedAt = parseUtcInstantZ(obj.observedAt);
  if (!snapshotId || !sessionId || snapshotObservedAt === null) return null;

  const componentsRaw = obj.components;
  if (!componentsRaw || typeof componentsRaw !== "object" || Array.isArray(componentsRaw)) {
    return null;
  }

  const componentsObj = componentsRaw as Record<string, unknown>;
  for (const key of Object.keys(componentsObj)) {
    if (!(SYSTEM_COMPONENT_KEYS as readonly string[]).includes(key)) {
      return null;
    }
  }

  const components: StoredSystemStatus["components"] = {};
  for (const key of SYSTEM_COMPONENT_KEYS) {
    const entry = componentsObj[key];
    if (entry === undefined) continue;
    const parsed = parseComponent(entry);
    if (!parsed) continue;
    components[key] = parsed;
  }

  return {
    contractVersion: SYSTEM_STATUS_CONTRACT_VERSION,
    snapshotId,
    snapshotObservedAt,
    sessionId,
    components,
  };
}
