import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { NEXUS_ERROR_CODES, nexusError } from "./lib/errors";
import {
  requireKnowledgeReader,
  requireOwnedConversation,
  requireOwnedTask,
} from "./lib/ownership";
import {
  clampLength,
  clampPageSize,
  isSupportedToolId,
  isValidIdempotencyKey,
  normalizedRequestHash,
  normalizeWhitespace,
  P5_DEFAULT_TOOL_ID,
  P5_LIMITS,
  P5_QUEUE,
} from "./lib/p5config";
import { allocateQueueSequence, defaultQueuePriority } from "./lib/queue";
import { appendMessage, appendProgress, recordAudit, touchConversation } from "./lib/p5writes";
import { performTaskTransition } from "./lib/taskTransitions";
import {
  assertTransition,
  isRetryable,
  isUserCancellable,
  isUserCancelRequestable,
  type TaskStatus,
  taskStatusValidator,
  TASK_STATUSES,
} from "./lib/taskStatus";

const TITLE_FROM_REQUEST_CHARS = 60;
const DEFAULT_CONVERSATION_TITLE = "New conversation";

/** Derive a default conversation title from the first request — no model call. */
function deriveTitleFromRequest(requestText: string): string {
  const normalized = normalizeWhitespace(requestText);
  if (!normalized) return DEFAULT_CONVERSATION_TITLE;
  if (normalized.length <= TITLE_FROM_REQUEST_CHARS) return normalized;
  return `${normalized.slice(0, TITLE_FROM_REQUEST_CHARS).trimEnd()}…`;
}

/** Owner-safe projection of a task row (no idempotency key / internal hash). */
function projectTask(doc: Doc<"nexusTasks">) {
  return {
    id: doc._id,
    conversationId: doc.conversationId,
    requestMessageId: doc.requestMessageId,
    requestedToolId: doc.requestedToolId,
    requestText: doc.requestText,
    status: doc.status,
    queueSequence: doc.queueSequence,
    attemptNumber: doc.attemptNumber,
    retryOfTaskId: doc.retryOfTaskId ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    queuedAt: doc.queuedAt,
    claimedAt: doc.claimedAt ?? null,
    startedAt: doc.startedAt ?? null,
    completedAt: doc.completedAt ?? null,
    failedAt: doc.failedAt ?? null,
    cancelledAt: doc.cancelledAt ?? null,
    cancellationRequestedAt: doc.cancellationRequestedAt ?? null,
    resultSummary: doc.resultSummary ?? null,
    errorCode: doc.errorCode ?? null,
    errorMessage: doc.errorMessage ?? null,
  };
}

/** Find a prior task for this owner with the same idempotency key, if any. */
async function findByIdempotencyKey(
  ctx: Parameters<typeof requireOwnedTask>[0],
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

/**
 * Canonical user task submission. Idempotent per (owner, idempotencyKey).
 *
 * Creates (or reuses) an owned conversation, persists the user message,
 * atomically allocates a global queueSequence, creates the queued task, and
 * records progress + audit events. The task is honestly `queued` — no execution
 * happens in P5.
 */
export const submitKnowledgeRequest = mutation({
  args: {
    requestText: v.string(),
    requestedToolId: v.optional(v.string()),
    conversationId: v.optional(v.id("nexusConversations")),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const { clerkUserId } = await requireKnowledgeReader(ctx);

    if (!isValidIdempotencyKey(args.idempotencyKey)) {
      nexusError(NEXUS_ERROR_CODES.INVALID_INPUT, "Invalid idempotency key");
    }

    const requestText = args.requestText.trim();
    if (!requestText) {
      nexusError(NEXUS_ERROR_CODES.INVALID_INPUT, "Request cannot be empty");
    }
    if (requestText.length > P5_LIMITS.maxRequestLength) {
      nexusError(NEXUS_ERROR_CODES.REQUEST_TOO_LARGE, "Request exceeds maximum length");
    }

    const requestedToolId = args.requestedToolId ?? P5_DEFAULT_TOOL_ID;
    if (!isSupportedToolId(requestedToolId)) {
      nexusError(NEXUS_ERROR_CODES.INVALID_TOOL, "Unsupported tool requested");
    }

    if (!P5_QUEUE.allowQueueWithoutConnector) {
      nexusError(NEXUS_ERROR_CODES.QUEUE_UNAVAILABLE, "Queue is not accepting new work");
    }

    // Idempotency: a retried network call returns the original IDs, never a
    // duplicate conversation / message / task.
    const existing = await findByIdempotencyKey(ctx, clerkUserId, args.idempotencyKey);
    if (existing) {
      return {
        duplicate: true,
        taskId: existing._id,
        conversationId: existing.conversationId,
        requestMessageId: existing.requestMessageId,
        status: existing.status,
        queueSequence: existing.queueSequence,
        attemptNumber: existing.attemptNumber,
      };
    }

    const now = Date.now();

    // Resolve the target conversation (owned), or create a fresh one.
    let conversationId: Id<"nexusConversations">;
    if (args.conversationId) {
      const conversation = await requireOwnedConversation(
        ctx,
        clerkUserId,
        args.conversationId,
      );
      conversationId = conversation._id;
      // Submitting into an archived conversation reopens it.
      if (conversation.status === "archived") {
        await ctx.db.patch(conversationId, {
          status: "active",
          archivedAt: undefined,
          updatedAt: now,
        });
        await recordAudit(ctx, {
          ownerClerkUserId: clerkUserId,
          eventType: "conversation_reopened",
          conversationId,
          now,
        });
      }
    } else {
      conversationId = await ctx.db.insert("nexusConversations", {
        ownerClerkUserId: clerkUserId,
        title: deriveTitleFromRequest(requestText),
        titleSource: "generated",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await recordAudit(ctx, {
        ownerClerkUserId: clerkUserId,
        eventType: "conversation_created",
        conversationId,
        now,
      });
    }

    // Persist the user message first; the task links back to it.
    const requestMessageId = await appendMessage(ctx, {
      conversationId,
      ownerClerkUserId: clerkUserId,
      author: "user",
      kind: "text",
      content: requestText,
      now,
    });

    const queueSequence = await allocateQueueSequence(ctx);

    const taskId = await ctx.db.insert("nexusTasks", {
      ownerClerkUserId: clerkUserId,
      conversationId,
      requestMessageId,
      requestedToolId,
      requestText: clampLength(requestText, P5_LIMITS.maxRequestLength),
      normalizedRequestHash: normalizedRequestHash(requestText),
      status: "queued",
      queueSequence,
      priority: defaultQueuePriority(),
      createdAt: now,
      updatedAt: now,
      queuedAt: now,
      attemptNumber: 1,
      idempotencyKey: args.idempotencyKey,
    });

    // Link the request message to its task (controlled, one-time link).
    await ctx.db.patch(requestMessageId, { taskId });

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
      message: "Queued — waiting for the Claudia Connector.",
      now,
    });
    await recordAudit(ctx, {
      ownerClerkUserId: clerkUserId,
      eventType: "task_created",
      conversationId,
      taskId,
      now,
      metadata: { requestedToolId, queueSequence },
    });

    await touchConversation(ctx, conversationId, {
      now,
      lastMessageAt: now,
      lastTaskAt: now,
    });

    return {
      duplicate: false,
      taskId,
      conversationId,
      requestMessageId,
      status: "queued" as const,
      queueSequence,
      attemptNumber: 1,
    };
  },
});

export const listMyTasks = query({
  args: {
    limit: v.optional(v.number()),
    before: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { clerkUserId } = await requireKnowledgeReader(ctx);
    const limit = clampPageSize(args.limit, P5_LIMITS.tasksPageSize, P5_LIMITS.tasksPageSizeMax);
    const rows = await ctx.db
      .query("nexusTasks")
      .withIndex("by_owner_and_created_at", (q) => {
        const base = q.eq("ownerClerkUserId", clerkUserId);
        return args.before !== undefined ? base.lt("createdAt", args.before) : base;
      })
      .order("desc")
      .take(limit);
    return {
      tasks: rows.map(projectTask),
      nextCursor: rows.length === limit ? rows[rows.length - 1].createdAt : null,
    };
  },
});

export const listMyTasksByStatus = query({
  args: {
    status: taskStatusValidator,
    limit: v.optional(v.number()),
    before: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { clerkUserId } = await requireKnowledgeReader(ctx);
    const limit = clampPageSize(args.limit, P5_LIMITS.tasksPageSize, P5_LIMITS.tasksPageSizeMax);
    const rows = await ctx.db
      .query("nexusTasks")
      .withIndex("by_owner_and_status_and_created_at", (q) => {
        const base = q.eq("ownerClerkUserId", clerkUserId).eq("status", args.status);
        return args.before !== undefined ? base.lt("createdAt", args.before) : base;
      })
      .order("desc")
      .take(limit);
    return {
      tasks: rows.map(projectTask),
      nextCursor: rows.length === limit ? rows[rows.length - 1].createdAt : null,
    };
  },
});

export const getMyTask = query({
  args: { taskId: v.id("nexusTasks") },
  handler: async (ctx, args) => {
    const { clerkUserId } = await requireKnowledgeReader(ctx);
    const task = await requireOwnedTask(ctx, clerkUserId, args.taskId);
    return projectTask(task);
  },
});

/** Aggregate counts of the caller's OWN tasks by status. Never global. */
export const myTaskCounts = query({
  args: {},
  handler: async (ctx) => {
    const { clerkUserId } = await requireKnowledgeReader(ctx);
    const counts: Record<TaskStatus, number> = {
      queued: 0,
      cancel_requested: 0,
      cancelled: 0,
      claimed: 0,
      running: 0,
      completed: 0,
      failed: 0,
    };
    let total = 0;
    for (const status of TASK_STATUSES) {
      const rows = await ctx.db
        .query("nexusTasks")
        .withIndex("by_owner_and_status_and_created_at", (q) =>
          q.eq("ownerClerkUserId", clerkUserId).eq("status", status),
        )
        .collect();
      counts[status] = rows.length;
      total += rows.length;
    }
    return { ...counts, total };
  },
});

/**
 * Request cancellation of an owned task. Repeated cancellation is idempotent.
 * Completed/failed tasks cannot be cancelled.
 *
 * - `queued` (no Connector holds it yet): cancelled immediately.
 * - `claimed`/`running` (P6 — a Connector holds the lease): moves to
 *   `cancel_requested`. The lease is left untouched so the Connector keeps
 *   observing it via its next lease heartbeat; the Connector (or P6's
 *   stale-lease recovery policy, if the Connector has disappeared) finalizes
 *   the task to `cancelled`.
 */
export const cancelMyTask = mutation({
  args: { taskId: v.id("nexusTasks") },
  handler: async (ctx, args) => {
    const { clerkUserId } = await requireKnowledgeReader(ctx);
    const task = await requireOwnedTask(ctx, clerkUserId, args.taskId);

    if (task.status === "cancelled" || task.status === "cancel_requested") {
      return { taskId: task._id, status: task.status };
    }

    const now = Date.now();

    if (isUserCancellable(task.status)) {
      assertTransition(task.status, "cancelled");
      await ctx.db.patch(task._id, {
        status: "cancelled",
        cancellationRequestedAt: now,
        cancelledAt: now,
        updatedAt: now,
      });
      await appendProgress(ctx, {
        taskId: task._id,
        ownerClerkUserId: clerkUserId,
        eventType: "task_cancelled",
        message: "Cancelled by you before execution.",
        now,
      });
      await recordAudit(ctx, {
        ownerClerkUserId: clerkUserId,
        eventType: "task_cancelled",
        conversationId: task.conversationId,
        taskId: task._id,
        now,
      });
      await touchConversation(ctx, task.conversationId, { now });
      return { taskId: task._id, status: "cancelled" as const };
    }

    if (isUserCancelRequestable(task.status)) {
      assertTransition(task.status, "cancel_requested");
      await ctx.db.patch(task._id, {
        status: "cancel_requested",
        cancellationRequestedAt: now,
        updatedAt: now,
      });
      await appendProgress(ctx, {
        taskId: task._id,
        ownerClerkUserId: clerkUserId,
        eventType: "cancel_requested",
        message: "Cancellation requested — waiting for the Claudia Connector to stop.",
        now,
      });
      await recordAudit(ctx, {
        ownerClerkUserId: clerkUserId,
        eventType: "task_cancel_requested",
        conversationId: task.conversationId,
        taskId: task._id,
        now,
      });
      await touchConversation(ctx, task.conversationId, { now });
      return { taskId: task._id, status: "cancel_requested" as const };
    }

    nexusError(
      NEXUS_ERROR_CODES.CANCELLATION_NOT_ALLOWED,
      "Task cannot be cancelled in its current state",
    );
  },
});

/**
 * Retry an owned, eligible (failed/cancelled) task by creating a NEW queued
 * task — the original is never mutated back to queued. Idempotent per
 * (owner, idempotencyKey).
 */
export const retryMyTask = mutation({
  args: {
    taskId: v.id("nexusTasks"),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const { clerkUserId } = await requireKnowledgeReader(ctx);

    if (!isValidIdempotencyKey(args.idempotencyKey)) {
      nexusError(NEXUS_ERROR_CODES.INVALID_INPUT, "Invalid idempotency key");
    }

    const existing = await findByIdempotencyKey(ctx, clerkUserId, args.idempotencyKey);
    if (existing) {
      return {
        duplicate: true,
        taskId: existing._id,
        conversationId: existing.conversationId,
        status: existing.status,
        queueSequence: existing.queueSequence,
        attemptNumber: existing.attemptNumber,
      };
    }

    const original = await requireOwnedTask(ctx, clerkUserId, args.taskId);
    if (!isRetryable(original.status)) {
      nexusError(NEXUS_ERROR_CODES.RETRY_NOT_ALLOWED, "Task is not eligible for retry");
    }
    if (original.attemptNumber >= P5_LIMITS.maxRetryDepth) {
      nexusError(NEXUS_ERROR_CODES.RETRY_NOT_ALLOWED, "Maximum retry depth reached");
    }

    const now = Date.now();
    const conversationId = original.conversationId;

    // Re-post the request text as a new user message in the same conversation.
    const requestMessageId = await appendMessage(ctx, {
      conversationId,
      ownerClerkUserId: clerkUserId,
      author: "user",
      kind: "text",
      content: original.requestText,
      now,
    });

    const queueSequence = await allocateQueueSequence(ctx);

    const taskId = await ctx.db.insert("nexusTasks", {
      ownerClerkUserId: clerkUserId,
      conversationId,
      requestMessageId,
      requestedToolId: original.requestedToolId,
      requestText: original.requestText,
      normalizedRequestHash: original.normalizedRequestHash,
      status: "queued",
      queueSequence,
      priority: defaultQueuePriority(),
      createdAt: now,
      updatedAt: now,
      queuedAt: now,
      retryOfTaskId: original._id,
      attemptNumber: original.attemptNumber + 1,
      idempotencyKey: args.idempotencyKey,
    });

    await ctx.db.patch(requestMessageId, { taskId });

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
      message: "Re-queued — waiting for the Claudia Connector.",
      now,
    });
    await recordAudit(ctx, {
      ownerClerkUserId: clerkUserId,
      eventType: "task_retried",
      conversationId,
      taskId,
      now,
      metadata: { retryOfTaskId: original._id, attemptNumber: original.attemptNumber + 1 },
    });
    await touchConversation(ctx, conversationId, {
      now,
      lastMessageAt: now,
      lastTaskAt: now,
    });

    return {
      duplicate: false,
      taskId,
      conversationId,
      status: "queued" as const,
      queueSequence,
      attemptNumber: original.attemptNumber + 1,
    };
  },
});

/**
 * Internal — drive a task through its lifecycle. Reserved for the future
 * Console Connector and for test fixtures. NOT a public mutation: the browser
 * can never claim, complete, fail, or otherwise set worker state. Ownership is
 * copied from the task; the transition is validated centrally.
 */
export const transitionTaskInternal = internalMutation({
  args: {
    taskId: v.id("nexusTasks"),
    toStatus: taskStatusValidator,
    resultSummary: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    progressMessage: v.optional(v.string()),
  },
  handler: (ctx, args) => performTaskTransition(ctx, args),
});
