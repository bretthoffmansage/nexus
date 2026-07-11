import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { NEXUS_ERROR_CODES, nexusError } from "./lib/errors";
import { requireKnowledgeReader } from "./lib/ownership";
import { boundedMetadataValidator } from "./lib/p5config";
import {
  CONNECTOR_OPERATING_STATES,
  DEFAULT_CONNECTOR_TOOL_IDS,
  KNOWN_CONNECTOR_TOOL_IDS,
  P6_LEASE,
  P6_LIMITS,
  P6_PROTOCOL_VERSION,
  type ConnectorPresenceState,
} from "./lib/p6config";
import {
  systemStatusRecordValidator,
  type StoredSystemStatus,
} from "./lib/systemStatus";

/**
 * P6 — trusted Connector identity.
 *
 * A Connector row is created ONLY by an operator running
 * `npx convex run connectorRegistry:bootstrapConnector '{...}'` from a
 * trusted machine — there is no public self-registration endpoint, and no
 * plaintext secret is ever stored here (the shared secret lives only in
 * Convex deployment environment configuration; see
 * `convex/lib/connectorAuth.ts`). Ordinary users never read the raw table —
 * only the privacy-safe projections below.
 */

const operatingStateValidator = v.union(
  v.literal("idle"),
  v.literal("claiming"),
  v.literal("running"),
  v.literal("degraded"),
);

export const connectorStatusValidator = v.union(
  v.literal("active"),
  v.literal("disabled"),
  v.literal("revoked"),
);

/** Operator-only bootstrap. Not callable via HTTP or from the browser. */
export const bootstrapConnector = internalMutation({
  args: {
    connectorId: v.string(),
    displayName: v.string(),
    allowedToolIds: v.optional(v.array(v.string())),
    environment: v.optional(v.string()),
    metadata: v.optional(boundedMetadataValidator),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("nexusConnectors")
      .withIndex("by_connector_id", (q) => q.eq("connectorId", args.connectorId))
      .unique();
    if (existing) {
      throw new Error(
        `Connector "${args.connectorId}" already exists. Use setConnectorStatus to change its lifecycle state instead of re-bootstrapping.`,
      );
    }
    if (args.displayName.length === 0 || args.displayName.length > P6_LIMITS.maxDisplayNameLength) {
      throw new Error("displayName is empty or exceeds the maximum length");
    }
    const now = Date.now();
    const id = await ctx.db.insert("nexusConnectors", {
      connectorId: args.connectorId,
      displayName: args.displayName,
      status: "active",
      enabled: true,
      allowedCapabilities: ["protocol.v1"],
      allowedToolIds: args.allowedToolIds,
      createdAt: now,
      updatedAt: now,
      environment: args.environment,
      metadata: args.metadata,
    });
    return { id, connectorId: args.connectorId };
  },
});

/** Operator-only lifecycle change (active/disabled/revoked). CLI-only. */
export const setConnectorStatus = internalMutation({
  args: {
    connectorId: v.string(),
    status: connectorStatusValidator,
  },
  handler: async (ctx, args) => {
    const connector = await ctx.db
      .query("nexusConnectors")
      .withIndex("by_connector_id", (q) => q.eq("connectorId", args.connectorId))
      .unique();
    if (!connector) throw new Error(`Connector "${args.connectorId}" not found`);

    const now = Date.now();
    const patch: Partial<Doc<"nexusConnectors">> = {
      status: args.status,
      enabled: args.status === "active",
      updatedAt: now,
    };
    if (args.status === "disabled") patch.disabledAt = now;
    if (args.status === "revoked") patch.revokedAt = now;
    await ctx.db.patch(connector._id, patch);
    return { connectorId: args.connectorId, status: args.status };
  },
});

/**
 * Operator-only capability update for an EXISTING Connector. CLI-only, like
 * `bootstrapConnector` (which intentionally refuses to touch an existing row —
 * this is the canonical path for changing a live Connector's tool allowlist).
 *
 * Replaces `allowedToolIds` with the given explicit list. Every id must be a
 * member of the known tool universe (`DEFAULT_CONNECTOR_TOOL_IDS`) — no
 * wildcards, no unknown ids, no empty list. Identity, status, and secret
 * configuration are untouched; the mutation is idempotent for a repeated
 * identical call.
 */
export const setConnectorAllowedTools = internalMutation({
  args: {
    connectorId: v.string(),
    allowedToolIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const connector = await ctx.db
      .query("nexusConnectors")
      .withIndex("by_connector_id", (q) => q.eq("connectorId", args.connectorId))
      .unique();
    if (!connector) throw new Error(`Connector "${args.connectorId}" not found`);
    if (connector.status === "revoked") {
      throw new Error(`Connector "${args.connectorId}" is revoked and may not be updated`);
    }
    if (args.allowedToolIds.length === 0) {
      throw new Error("allowedToolIds must not be empty — pass the full explicit tool list");
    }
    const known = new Set<string>(KNOWN_CONNECTOR_TOOL_IDS);
    const deduped: string[] = [];
    for (const toolId of args.allowedToolIds) {
      if (!known.has(toolId)) {
        throw new Error(
          `Unknown tool id "${toolId}". Allowed tool ids: ${[...known].join(", ")}`,
        );
      }
      if (!deduped.includes(toolId)) deduped.push(toolId);
    }
    const changed =
      connector.allowedToolIds === undefined ||
      connector.allowedToolIds.length !== deduped.length ||
      connector.allowedToolIds.some((id, i) => id !== deduped[i]);
    if (changed) {
      await ctx.db.patch(connector._id, { allowedToolIds: deduped, updatedAt: Date.now() });
    }
    return { connectorId: args.connectorId, allowedToolIds: deduped, changed };
  },
});

/** Internal read used by the HTTP auth layer and protocol mutations. Never
 * exposed to the browser — only the safe projections below are public. */
export const getConnectorRecordInternal = internalQuery({
  args: { connectorId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("nexusConnectors")
      .withIndex("by_connector_id", (q) => q.eq("connectorId", args.connectorId))
      .unique();
  },
});

/** Require an active, enabled Connector or throw a stable error. Shared by
 * every protocol mutation so the check is identical everywhere. */
export async function requireActiveConnector(
  ctx: QueryCtx | MutationCtx,
  connectorId: string,
): Promise<Doc<"nexusConnectors">> {
  const connector = await ctx.db
    .query("nexusConnectors")
    .withIndex("by_connector_id", (q) => q.eq("connectorId", connectorId))
    .unique();
  if (!connector) {
    nexusError(NEXUS_ERROR_CODES.CONNECTOR_UNAUTHORIZED, "Unknown Connector");
  }
  if (connector.status === "revoked") {
    nexusError(NEXUS_ERROR_CODES.CONNECTOR_REVOKED, "Connector credential has been revoked");
  }
  if (connector.status === "disabled" || !connector.enabled) {
    nexusError(NEXUS_ERROR_CODES.CONNECTOR_DISABLED, "Connector is disabled");
  }
  return connector;
}

/** Connector-level health heartbeat (independent of any task). Bounded
 * metadata only — no arbitrary free-form logs, no filesystem paths, no
 * private network configuration. */
export const heartbeatConnector = internalMutation({
  args: {
    connectorId: v.string(),
    softwareVersion: v.optional(v.string()),
    hostLabel: v.optional(v.string()),
    environment: v.optional(v.string()),
    operatingState: v.optional(operatingStateValidator),
    lastErrorCode: v.optional(v.string()),
    /** When true, replace `systemStatus` with `systemStatus` arg (undefined clears). */
    replaceSystemStatus: v.optional(v.boolean()),
    systemStatus: v.optional(systemStatusRecordValidator),
  },
  handler: async (ctx, args) => {
    const connector = await requireActiveConnector(ctx, args.connectorId);
    const now = Date.now();
    const patch: Partial<Doc<"nexusConnectors">> = {
      lastSeenAt: now,
      lastHeartbeatAt: now,
      updatedAt: now,
    };
    if (args.softwareVersion !== undefined) {
      patch.softwareVersion = args.softwareVersion.slice(0, P6_LIMITS.maxSoftwareVersionLength);
    }
    if (args.hostLabel !== undefined) {
      patch.hostLabel = args.hostLabel.slice(0, P6_LIMITS.maxHostLabelLength);
    }
    if (args.environment !== undefined) {
      patch.environment = args.environment.slice(0, P6_LIMITS.maxEnvironmentLength);
    }
    if (args.operatingState !== undefined) {
      patch.operatingState = args.operatingState;
    }
    if (args.lastErrorCode !== undefined) {
      patch.lastErrorCode = args.lastErrorCode;
      patch.lastErrorAt = now;
    }
    if (args.replaceSystemStatus) {
      patch.systemStatus = args.systemStatus as StoredSystemStatus | undefined;
    }
    await ctx.db.patch(connector._id, patch);
    return {
      connectorId: connector.connectorId,
      status: connector.status,
      operatingState: patch.operatingState ?? connector.operatingState ?? "idle",
      lastHeartbeatAt: now,
    };
  },
});

function deriveConnectorPresence(
  connector: Doc<"nexusConnectors"> | null,
  now: number,
): ConnectorPresenceState {
  if (!connector) return "not_configured";
  if (connector.status === "disabled" || connector.status === "revoked") return "disabled";
  const lastHeartbeatAt = connector.lastHeartbeatAt ?? connector.lastSeenAt;
  if (!lastHeartbeatAt || now - lastHeartbeatAt > P6_LEASE.connectorOfflineThresholdMs) {
    return "offline";
  }
  if (connector.operatingState === "degraded") return "degraded";
  if (connector.currentTaskId) return "online_busy";
  return "online_idle";
}

/**
 * Privacy-safe status for ordinary approved users — truthful presence only,
 * no heartbeat timestamps, no software/host details, no task identifiers.
 */
export const getConnectorStatusPublic = query({
  args: {},
  handler: async (ctx) => {
    await requireKnowledgeReader(ctx);
    const connector = await ctx.db.query("nexusConnectors").withIndex("by_status").first();
    const state = deriveConnectorPresence(connector, Date.now());
    return { state, protocolVersion: P6_PROTOCOL_VERSION };
  },
});

/** Bounded system status projection for the Status page (approved users only). */
async function systemStatusPageProjection(ctx: QueryCtx) {
  await requireKnowledgeReader(ctx);
  const now = Date.now();
  const connector = await ctx.db.query("nexusConnectors").withIndex("by_status").first();
  if (!connector) {
    return {
      configured: false as const,
      presence: "not_configured" as const,
      lastHeartbeatAt: null,
      operatingState: null,
      softwareVersion: null,
      hasSystemStatus: false,
      snapshotObservedAt: null,
      components: null,
    };
  }

  const presence = deriveConnectorPresence(connector, now);
  const components = connector.systemStatus?.components ?? null;

  return {
    configured: true as const,
    presence,
    lastHeartbeatAt: connector.lastHeartbeatAt ?? connector.lastSeenAt ?? null,
    operatingState: connector.operatingState ?? null,
    softwareVersion: connector.softwareVersion ?? null,
    hasSystemStatus: Boolean(connector.systemStatus),
    snapshotObservedAt: connector.systemStatus?.snapshotObservedAt ?? null,
    components: components
      ? {
          core_api: components.core_api ?? null,
          nexus_connector: components.nexus_connector ?? null,
          vault_retrieval: components.vault_retrieval ?? null,
          vault: components.vault ?? null,
          cursor_cli: components.cursor_cli ?? null,
          codex_cli: components.codex_cli ?? null,
          claude_cli: components.claude_cli ?? null,
          cleanup_storage: components.cleanup_storage ?? null,
        }
      : null,
  };
}

export const getSystemStatusForPage = query({
  args: {},
  handler: async (ctx) => systemStatusPageProjection(ctx),
});

/**
 * DEPRECATED transitional alias: the currently-deployed frontend bundle still
 * calls the pre-rebrand query name. Remove after the next Vercel deploy of the
 * console picks up getSystemStatusForPage.
 */
export const getClaudiaSystemStatusForPage = query({
  args: {},
  handler: async (ctx) => systemStatusPageProjection(ctx),
});

/**
 * Admin-only, still content-free, Connector diagnostics: operating detail
 * but never private task content. Consumed by `diagnostics.ts`'s
 * admin-gated aggregate query rather than exposed as its own admin route,
 * so there remains exactly one admin diagnostics surface.
 */
export async function getConnectorAdminProjection(ctx: QueryCtx, now: number) {
  const connector = await ctx.db.query("nexusConnectors").withIndex("by_status").first();
  if (!connector) {
    return { configured: false as const };
  }
  return {
    configured: true as const,
    connectorId: connector.connectorId,
    displayName: connector.displayName,
    status: connector.status,
    presence: deriveConnectorPresence(connector, now),
    operatingState: connector.operatingState ?? null,
    lastSeenAt: connector.lastSeenAt ?? null,
    lastHeartbeatAt: connector.lastHeartbeatAt ?? null,
    hasActiveTask: Boolean(connector.currentTaskId),
    softwareVersion: connector.softwareVersion ?? null,
    protocolVersion: P6_PROTOCOL_VERSION,
    lastErrorCode: connector.lastErrorCode ?? null,
    lastErrorAt: connector.lastErrorAt ?? null,
  };
}

export const CONNECTOR_OPERATING_STATE_VALUES = CONNECTOR_OPERATING_STATES;
