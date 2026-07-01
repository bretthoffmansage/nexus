import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { requireKnowledgeReader, requireOwnedTask } from "./lib/ownership";
import { boundedMetadataValidator, clampPageSize, P5_LIMITS } from "./lib/p5config";
import { appendProgress } from "./lib/p5writes";

export const listMyTaskProgress = query({
  args: {
    taskId: v.id("nexusTasks"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { clerkUserId } = await requireKnowledgeReader(ctx);
    await requireOwnedTask(ctx, clerkUserId, args.taskId);
    const limit = clampPageSize(
      args.limit,
      P5_LIMITS.progressPageSize,
      P5_LIMITS.messagesPageSizeMax,
    );
    const rows = await ctx.db
      .query("nexusTaskProgressEvents")
      .withIndex("by_task_and_sequence", (q) => q.eq("taskId", args.taskId))
      .order("asc")
      .take(limit);
    return rows.map((e) => ({
      id: e._id,
      sequence: e.sequence,
      eventType: e.eventType,
      message: e.message ?? null,
      createdAt: e.createdAt,
    }));
  },
});

/**
 * Internal — append a user-safe progress event. Reserved for the future worker.
 * Ownership is copied from the task record, never trusted from an argument.
 */
export const appendTaskProgressInternal = internalMutation({
  args: {
    taskId: v.id("nexusTasks"),
    eventType: v.union(
      v.literal("task_claimed"),
      v.literal("task_started"),
      v.literal("tool_progress"),
      v.literal("task_completed"),
      v.literal("task_failed"),
      v.literal("cancel_requested"),
      v.literal("task_cancelled"),
    ),
    message: v.optional(v.string()),
    metadata: v.optional(boundedMetadataValidator),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("task_not_found");
    await appendProgress(ctx, {
      taskId: args.taskId,
      ownerClerkUserId: task.ownerClerkUserId,
      eventType: args.eventType,
      message: args.message,
      metadata: args.metadata,
      now: Date.now(),
    });
  },
});
