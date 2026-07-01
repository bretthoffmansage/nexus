import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { requireKnowledgeReader, requireOwnedTask } from "./lib/ownership";
import { clampLength, P5_LIMITS } from "./lib/p5config";

/** Read the caller's own task result (revalidates ownership). */
export const getMyTaskResult = query({
  args: { taskId: v.id("nexusTasks") },
  handler: async (ctx, args) => {
    const { clerkUserId } = await requireKnowledgeReader(ctx);
    await requireOwnedTask(ctx, clerkUserId, args.taskId);
    const result = await ctx.db
      .query("nexusTaskResults")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .unique();
    if (!result) return null;
    return {
      id: result._id,
      taskId: result.taskId,
      answerText: result.answerText,
      format: result.format,
      createdAt: result.createdAt,
      completedBy: result.completedBy ?? null,
      model: result.model ?? null,
      toolId: result.toolId ?? null,
      durationMs: result.durationMs ?? null,
    };
  },
});

/**
 * Internal — write the canonical task result. Reserved for the future trusted
 * worker. NOT a public mutation: the browser can never complete a task or write
 * an answer. Ownership is copied from the task record; one canonical result per
 * task (an existing result is replaced in place).
 */
export const writeTaskResultInternal = internalMutation({
  args: {
    taskId: v.id("nexusTasks"),
    answerText: v.string(),
    format: v.optional(v.union(v.literal("markdown"), v.literal("plain"))),
    completedBy: v.optional(v.string()),
    model: v.optional(v.string()),
    toolId: v.optional(v.string()),
    durationMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("task_not_found");

    const answerText = clampLength(args.answerText, P5_LIMITS.maxResultLength);
    const existing = await ctx.db
      .query("nexusTaskResults")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .unique();

    const fields = {
      taskId: args.taskId,
      ownerClerkUserId: task.ownerClerkUserId,
      answerText,
      format: args.format ?? ("markdown" as const),
      createdAt: Date.now(),
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
  },
});
