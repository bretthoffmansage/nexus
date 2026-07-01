import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { clampLength, P5_LIMITS, type BoundedMetadata } from "./p5config";

/**
 * Shared P5 write helpers. These are plain functions (not Convex functions) so
 * the public mutations, the internal worker mutations, and tests all allocate
 * sequences and touch conversations through one consistent, transactional path.
 *
 * Per-conversation message sequence and per-task progress sequence are both
 * allocated by reading the current max under the relevant index and adding one.
 * Convex OCC retries any concurrent writer whose read range was mutated, so
 * sequences are always gap-free and unique within their parent.
 */

export async function nextMessageSequence(
  ctx: MutationCtx,
  conversationId: Id<"nexusConversations">,
): Promise<number> {
  const last = await ctx.db
    .query("nexusMessages")
    .withIndex("by_conversation_and_sequence", (q) =>
      q.eq("conversationId", conversationId),
    )
    .order("desc")
    .first();
  return (last?.sequence ?? 0) + 1;
}

export async function appendMessage(
  ctx: MutationCtx,
  args: {
    conversationId: Id<"nexusConversations">;
    ownerClerkUserId: string;
    author: Doc<"nexusMessages">["author"];
    kind: Doc<"nexusMessages">["kind"];
    content: string;
    taskId?: Id<"nexusTasks">;
    metadata?: BoundedMetadata;
    now: number;
  },
): Promise<Id<"nexusMessages">> {
  const sequence = await nextMessageSequence(ctx, args.conversationId);
  return await ctx.db.insert("nexusMessages", {
    conversationId: args.conversationId,
    ownerClerkUserId: args.ownerClerkUserId,
    author: args.author,
    kind: args.kind,
    content: clampLength(args.content, P5_LIMITS.maxMessageLength),
    taskId: args.taskId,
    createdAt: args.now,
    sequence,
    metadata: args.metadata,
  });
}

export async function nextProgressSequence(
  ctx: MutationCtx,
  taskId: Id<"nexusTasks">,
): Promise<number> {
  const last = await ctx.db
    .query("nexusTaskProgressEvents")
    .withIndex("by_task_and_sequence", (q) => q.eq("taskId", taskId))
    .order("desc")
    .first();
  return (last?.sequence ?? 0) + 1;
}

export async function appendProgress(
  ctx: MutationCtx,
  args: {
    taskId: Id<"nexusTasks">;
    ownerClerkUserId: string;
    eventType: Doc<"nexusTaskProgressEvents">["eventType"];
    message?: string;
    metadata?: BoundedMetadata;
    now: number;
  },
): Promise<void> {
  const sequence = await nextProgressSequence(ctx, args.taskId);
  await ctx.db.insert("nexusTaskProgressEvents", {
    taskId: args.taskId,
    ownerClerkUserId: args.ownerClerkUserId,
    sequence,
    eventType: args.eventType,
    message: args.message
      ? clampLength(args.message, P5_LIMITS.maxProgressMessageLength)
      : undefined,
    createdAt: args.now,
    metadata: args.metadata,
  });
}

export async function recordAudit(
  ctx: MutationCtx,
  args: {
    ownerClerkUserId: string;
    eventType: Doc<"nexusTaskAuditEvents">["eventType"];
    conversationId?: Id<"nexusConversations">;
    taskId?: Id<"nexusTasks">;
    /** P6 — which Connector performed a worker-originated event, if any. */
    connectorId?: string;
    metadata?: BoundedMetadata;
    now: number;
  },
): Promise<void> {
  await ctx.db.insert("nexusTaskAuditEvents", {
    ownerClerkUserId: args.ownerClerkUserId,
    eventType: args.eventType,
    conversationId: args.conversationId,
    taskId: args.taskId,
    connectorId: args.connectorId,
    at: args.now,
    metadata: args.metadata,
  });
}

/**
 * Write the one canonical task result (insert, or replace in place if one
 * already exists). Extracted so `taskResults.writeTaskResultInternal` (the
 * preserved P5 worker-mutation surface) and the P6 Connector `completeTask`
 * mutation share identical logic within their own transaction.
 */
export async function writeCanonicalTaskResult(
  ctx: MutationCtx,
  args: {
    taskId: Id<"nexusTasks">;
    ownerClerkUserId: string;
    answerText: string;
    format?: Doc<"nexusTaskResults">["format"];
    completedBy?: string;
    model?: string;
    toolId?: string;
    durationMs?: number;
    now: number;
  },
): Promise<Id<"nexusTaskResults">> {
  const answerText = clampLength(args.answerText, P5_LIMITS.maxResultLength);
  const existing = await ctx.db
    .query("nexusTaskResults")
    .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
    .unique();

  const fields = {
    taskId: args.taskId,
    ownerClerkUserId: args.ownerClerkUserId,
    answerText,
    format: args.format ?? ("markdown" as const),
    createdAt: args.now,
    completedBy: args.completedBy,
    model: args.model,
    toolId: args.toolId,
    durationMs: args.durationMs,
  };

  if (existing) {
    await ctx.db.patch(existing._id, fields);
    return existing._id;
  }
  return await ctx.db.insert("nexusTaskResults", fields);
}

export type TaskSourceInput = {
  sourceType: Doc<"nexusTaskSources">["sourceType"];
  title: string;
  locator?: string;
  excerpt?: string;
  provenanceLabel?: string;
};

/**
 * Replace all provenance sources for a task (delete existing, insert the
 * bounded new set). Extracted so `taskSources.replaceTaskSourcesInternal`
 * (preserved P5 surface) and the P6 Connector `completeTask` mutation share
 * identical bounded-write logic.
 */
export async function replaceTaskSourceRows(
  ctx: MutationCtx,
  args: {
    taskId: Id<"nexusTasks">;
    ownerClerkUserId: string;
    sources: TaskSourceInput[];
    now: number;
  },
): Promise<{ taskId: Id<"nexusTasks">; count: number }> {
  const existing = await ctx.db
    .query("nexusTaskSources")
    .withIndex("by_task_and_ordinal", (q) => q.eq("taskId", args.taskId))
    .collect();
  for (const row of existing) {
    await ctx.db.delete(row._id);
  }

  const bounded = args.sources.slice(0, P5_LIMITS.maxSourcesPerTask);
  let ordinal = 0;
  for (const source of bounded) {
    await ctx.db.insert("nexusTaskSources", {
      taskId: args.taskId,
      ownerClerkUserId: args.ownerClerkUserId,
      sourceType: source.sourceType,
      title: clampLength(source.title, P5_LIMITS.maxSourceTitleLength),
      locator: source.locator
        ? clampLength(source.locator, P5_LIMITS.maxSourceLocatorLength)
        : undefined,
      excerpt: source.excerpt
        ? clampLength(source.excerpt, P5_LIMITS.maxSourceExcerptLength)
        : undefined,
      provenanceLabel: source.provenanceLabel
        ? clampLength(source.provenanceLabel, P5_LIMITS.maxSourceTitleLength)
        : undefined,
      ordinal,
      createdAt: args.now,
    });
    ordinal += 1;
  }
  return { taskId: args.taskId, count: bounded.length };
}

/** Bump a conversation's activity timestamps. updatedAt always advances. */
export async function touchConversation(
  ctx: MutationCtx,
  conversationId: Id<"nexusConversations"> | undefined,
  patch: { now: number; lastMessageAt?: number; lastTaskAt?: number },
): Promise<void> {
  if (!conversationId) return;
  await ctx.db.patch(conversationId, {
    updatedAt: patch.now,
    ...(patch.lastMessageAt !== undefined ? { lastMessageAt: patch.lastMessageAt } : {}),
    ...(patch.lastTaskAt !== undefined ? { lastTaskAt: patch.lastTaskAt } : {}),
  });
}
