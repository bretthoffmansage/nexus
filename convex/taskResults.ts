import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { requireKnowledgeReader, requireOwnedTask } from "./lib/ownership";
import { writeCanonicalTaskResult } from "./lib/p5writes";

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
    return writeCanonicalTaskResult(ctx, {
      taskId: args.taskId,
      ownerClerkUserId: task.ownerClerkUserId,
      answerText: args.answerText,
      format: args.format,
      completedBy: args.completedBy,
      model: args.model,
      toolId: args.toolId,
      durationMs: args.durationMs,
      now: Date.now(),
    });
  },
});
