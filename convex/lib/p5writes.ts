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
    metadata?: BoundedMetadata;
    now: number;
  },
): Promise<void> {
  await ctx.db.insert("nexusTaskAuditEvents", {
    ownerClerkUserId: args.ownerClerkUserId,
    eventType: args.eventType,
    conversationId: args.conversationId,
    taskId: args.taskId,
    at: args.now,
    metadata: args.metadata,
  });
}

/** Bump a conversation's activity timestamps. updatedAt always advances. */
export async function touchConversation(
  ctx: MutationCtx,
  conversationId: Id<"nexusConversations">,
  patch: { now: number; lastMessageAt?: number; lastTaskAt?: number },
): Promise<void> {
  await ctx.db.patch(conversationId, {
    updatedAt: patch.now,
    ...(patch.lastMessageAt !== undefined ? { lastMessageAt: patch.lastMessageAt } : {}),
    ...(patch.lastTaskAt !== undefined ? { lastTaskAt: patch.lastTaskAt } : {}),
  });
}
