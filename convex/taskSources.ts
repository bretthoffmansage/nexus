import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { requireKnowledgeReader, requireOwnedTask } from "./lib/ownership";
import { clampLength, P5_LIMITS } from "./lib/p5config";

const sourceTypeValidator = v.union(
  v.literal("vault_note"),
  v.literal("membership_transcript"),
  v.literal("web"),
  v.literal("file"),
  v.literal("other"),
);

/** Read the caller's own task sources, ordered (revalidates ownership). */
export const listMyTaskSources = query({
  args: { taskId: v.id("nexusTasks") },
  handler: async (ctx, args) => {
    const { clerkUserId } = await requireKnowledgeReader(ctx);
    await requireOwnedTask(ctx, clerkUserId, args.taskId);
    const rows = await ctx.db
      .query("nexusTaskSources")
      .withIndex("by_task_and_ordinal", (q) => q.eq("taskId", args.taskId))
      .order("asc")
      .take(P5_LIMITS.maxSourcesPerTask);
    return rows.map((s) => ({
      id: s._id,
      sourceType: s.sourceType,
      title: s.title,
      locator: s.locator ?? null,
      excerpt: s.excerpt ?? null,
      provenanceLabel: s.provenanceLabel ?? null,
      ordinal: s.ordinal,
    }));
  },
});

/**
 * Internal — replace a task's provenance sources. Reserved for the future
 * trusted worker. NOT a public mutation. Ownership is copied from the task;
 * source count and excerpt sizes are bounded so full documents/transcripts are
 * never stored.
 */
export const replaceTaskSourcesInternal = internalMutation({
  args: {
    taskId: v.id("nexusTasks"),
    sources: v.array(
      v.object({
        sourceType: sourceTypeValidator,
        title: v.string(),
        locator: v.optional(v.string()),
        excerpt: v.optional(v.string()),
        provenanceLabel: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("task_not_found");

    // Clear any existing sources for this task.
    const existing = await ctx.db
      .query("nexusTaskSources")
      .withIndex("by_task_and_ordinal", (q) => q.eq("taskId", args.taskId))
      .collect();
    for (const row of existing) {
      await ctx.db.delete(row._id);
    }

    const now = Date.now();
    const bounded = args.sources.slice(0, P5_LIMITS.maxSourcesPerTask);
    let ordinal = 0;
    for (const source of bounded) {
      await ctx.db.insert("nexusTaskSources", {
        taskId: args.taskId,
        ownerClerkUserId: task.ownerClerkUserId,
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
        createdAt: now,
      });
      ordinal += 1;
    }
    return { taskId: args.taskId, count: bounded.length };
  },
});
