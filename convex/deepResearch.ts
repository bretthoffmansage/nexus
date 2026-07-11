import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  buildDeepResearchEnvelope,
  DEEP_RESEARCH_TASK_KIND,
  DEEP_RESEARCH_TOOL_ID,
} from "./lib/deepResearchConfig";
import { NEXUS_ERROR_CODES, nexusError } from "./lib/errors";
import { requireDeepResearchAccess } from "./lib/ownership";
import { clampLength, clampPageSize, P5_LIMITS, P5_QUEUE } from "./lib/p5config";
import { appendProgress, recordAudit } from "./lib/p5writes";
import { allocateQueueSequence, defaultQueuePriority } from "./lib/queue";
import { taskStatusValidator, type TaskStatus } from "./lib/taskStatus";

const ACTIVE_DEEP_RESEARCH_STATUSES: readonly TaskStatus[] = [
  "queued",
  "claimed",
  "running",
  "cancel_requested",
];

function projectDeepResearchTask(doc: Doc<"nexusTasks">) {
  const metadata =
    doc.taskMetadata?.kind === DEEP_RESEARCH_TASK_KIND ? doc.taskMetadata : null;
  return {
    id: doc._id,
    requestedToolId: doc.requestedToolId,
    requestText: doc.requestText,
    status: doc.status,
    queueSequence: doc.queueSequence,
    attemptNumber: doc.attemptNumber,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    queuedAt: doc.queuedAt,
    claimedAt: doc.claimedAt ?? null,
    startedAt: doc.startedAt ?? null,
    completedAt: doc.completedAt ?? null,
    failedAt: doc.failedAt ?? null,
    cancelledAt: doc.cancelledAt ?? null,
    resultSummary: doc.resultSummary ?? null,
    errorCode: doc.errorCode ?? null,
    errorMessage: doc.errorMessage ?? null,
    researchRequestId: metadata?.researchRequestId ?? null,
    requestedModelId: doc.requestedModelId ?? null,
    idempotencyKey: doc.idempotencyKey,
    // Read-only derived marker: direct page submissions never carry a
    // scheduledEventId; Calendar-dispatched research tasks do. Used only for an
    // optional History source badge — no metadata/contract/write change.
    fromCalendar: doc.scheduledEventId != null,
  };
}

async function findByIdempotencyKey(
  ctx: Parameters<typeof requireDeepResearchAccess>[0],
  clerkUserId: string,
  idempotencyKey: string,
): Promise<Doc<"nexusTasks"> | null> {
  return await ctx.db
    .query("nexusTasks")
    .withIndex("by_owner_and_idempotency_key", (q) =>
      q.eq("ownerClerkUserId", clerkUserId).eq("idempotencyKey", idempotencyKey),
    )
    .first();
}

function envelopeErrorToNexus(code: string): never {
  switch (code) {
    case "empty_request":
      nexusError(NEXUS_ERROR_CODES.INVALID_INPUT, "Request cannot be empty");
    case "request_too_large":
      nexusError(NEXUS_ERROR_CODES.REQUEST_TOO_LARGE, "Request exceeds maximum length");
    case "invalid_research_request_id":
      nexusError(NEXUS_ERROR_CODES.INVALID_INPUT, "Invalid research request id");
    case "invalid_idempotency_key":
      nexusError(NEXUS_ERROR_CODES.INVALID_INPUT, "Invalid idempotency key");
    case "invalid_model_id":
      nexusError(NEXUS_ERROR_CODES.INVALID_INPUT, "Invalid model selection");
    default:
      nexusError(NEXUS_ERROR_CODES.INVALID_INPUT, "Invalid deep research request");
  }
}

/**
 * Canonical Deep Research submission — no conversation, no attachments, exact
 * governed envelope only. Idempotent per (owner, idempotencyKey).
 */
export const submitDeepResearch = mutation({
  args: {
    requestText: v.string(),
    researchRequestId: v.string(),
    idempotencyKey: v.string(),
    /** Optional governed model selection; omit for the system default. */
    requestedModelId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { clerkUserId } = await requireDeepResearchAccess(ctx);

    if (!P5_QUEUE.allowQueueWithoutConnector) {
      nexusError(NEXUS_ERROR_CODES.QUEUE_UNAVAILABLE, "Queue is not accepting new work");
    }

    const built = buildDeepResearchEnvelope({
      requestText: args.requestText,
      researchRequestId: args.researchRequestId,
      idempotencyKey: args.idempotencyKey,
      requestedModelId: args.requestedModelId,
    });
    if (!built.ok) {
      envelopeErrorToNexus(built.code);
    }
    const { envelope } = built;
    const requestedModelId = envelope.requestedModelId ?? null;

    const existing = await findByIdempotencyKey(ctx, clerkUserId, envelope.taskMetadata.idempotencyKey);
    if (existing) {
      return {
        duplicate: true as const,
        taskId: existing._id,
        status: existing.status,
        queueSequence: existing.queueSequence,
        attemptNumber: existing.attemptNumber,
      };
    }

    const now = Date.now();
    const queueSequence = await allocateQueueSequence(ctx);

    const taskId = await ctx.db.insert("nexusTasks", {
      ownerClerkUserId: clerkUserId,
      taskKind: envelope.taskKind,
      requestedToolId: envelope.requestedToolId,
      requestText: clampLength(envelope.requestText, P5_LIMITS.maxRequestLength),
      ...(requestedModelId ? { requestedModelId } : {}),
      taskMetadata: envelope.taskMetadata,
      status: "queued",
      queueSequence,
      priority: defaultQueuePriority(),
      createdAt: now,
      updatedAt: now,
      queuedAt: now,
      attemptNumber: 1,
      idempotencyKey: envelope.taskMetadata.idempotencyKey,
    });

    await appendProgress(ctx, {
      taskId,
      ownerClerkUserId: clerkUserId,
      eventType: "task_created",
      now,
    });
    await appendProgress(ctx, {
      taskId,
      ownerClerkUserId: clerkUserId,
      eventType: "task_queued",
      message: "Queued — waiting for the Console Connector.",
      now,
    });
    await recordAudit(ctx, {
      ownerClerkUserId: clerkUserId,
      eventType: "task_created",
      taskId,
      now,
      metadata: {
        requestedToolId: envelope.requestedToolId,
        queueSequence,
        taskKind: envelope.taskKind,
        sourcePage: envelope.taskMetadata.sourcePage,
      },
    });

    return {
      duplicate: false as const,
      taskId,
      status: "queued" as const,
      queueSequence,
      attemptNumber: 1,
    };
  },
});

/** Owner-scoped Deep Research task history (filtered from nexusTasks). */
export const listMyDeepResearchTasks = query({
  args: {
    limit: v.optional(v.number()),
    before: v.optional(v.number()),
    status: v.optional(taskStatusValidator),
  },
  handler: async (ctx, args) => {
    const { clerkUserId } = await requireDeepResearchAccess(ctx);
    const limit = clampPageSize(args.limit, P5_LIMITS.tasksPageSize, P5_LIMITS.tasksPageSizeMax);
    const fetchSize = Math.min(limit * 4, P5_LIMITS.tasksPageSizeMax * 2);
    const rows = await ctx.db
      .query("nexusTasks")
      .withIndex("by_owner_and_created_at", (q) => {
        const base = q.eq("ownerClerkUserId", clerkUserId);
        return args.before !== undefined ? base.lt("createdAt", args.before) : base;
      })
      .order("desc")
      .take(fetchSize);

    const filtered = rows
      .filter(
        (row) =>
          row.taskKind === DEEP_RESEARCH_TASK_KIND &&
          row.requestedToolId === DEEP_RESEARCH_TOOL_ID &&
          (args.status === undefined || row.status === args.status),
      )
      .slice(0, limit)
      .map(projectDeepResearchTask);

    return {
      tasks: filtered,
      nextCursor:
        filtered.length === limit ? filtered[filtered.length - 1].createdAt : null,
    };
  },
});

export function isActiveDeepResearchStatus(status: TaskStatus): boolean {
  return (ACTIVE_DEEP_RESEARCH_STATUSES as readonly string[]).includes(status);
}
