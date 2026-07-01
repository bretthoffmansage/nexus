import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { requireKnowledgeReader, requireOwnedConversation } from "./lib/ownership";
import { boundedMetadataValidator, clampPageSize, P5_LIMITS } from "./lib/p5config";
import { appendMessage, touchConversation } from "./lib/p5writes";

export const listMyConversationMessages = query({
  args: {
    conversationId: v.id("nexusConversations"),
    limit: v.optional(v.number()),
    afterSequence: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { clerkUserId } = await requireKnowledgeReader(ctx);
    await requireOwnedConversation(ctx, clerkUserId, args.conversationId);

    const limit = clampPageSize(
      args.limit,
      P5_LIMITS.messagesPageSize,
      P5_LIMITS.messagesPageSizeMax,
    );

    const rows = await ctx.db
      .query("nexusMessages")
      .withIndex("by_conversation_and_sequence", (q) => {
        const base = q.eq("conversationId", args.conversationId);
        return args.afterSequence !== undefined
          ? base.gt("sequence", args.afterSequence)
          : base;
      })
      .order("asc")
      .take(limit);

    return {
      messages: rows.map((m) => ({
        id: m._id,
        author: m.author,
        kind: m.kind,
        content: m.content,
        taskId: m.taskId ?? null,
        sequence: m.sequence,
        createdAt: m.createdAt,
      })),
      nextCursor: rows.length === limit ? rows[rows.length - 1].sequence : null,
    };
  },
});

/**
 * Internal — append an assistant-authored message. Reserved for the future
 * Console Connector / trusted worker. The browser can NEVER author an assistant
 * message: this is not a public mutation, and ownership is copied from the
 * conversation record rather than trusted from an argument.
 */
export const appendAssistantMessage = internalMutation({
  args: {
    conversationId: v.id("nexusConversations"),
    content: v.string(),
    kind: v.optional(
      v.union(v.literal("text"), v.literal("result_summary"), v.literal("error")),
    ),
    taskId: v.optional(v.id("nexusTasks")),
    metadata: v.optional(boundedMetadataValidator),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) throw new Error("conversation_not_found");
    const now = Date.now();
    const messageId = await appendMessage(ctx, {
      conversationId: args.conversationId,
      ownerClerkUserId: conversation.ownerClerkUserId,
      author: "assistant",
      kind: args.kind ?? "text",
      content: args.content,
      taskId: args.taskId,
      metadata: args.metadata,
      now,
    });
    await touchConversation(ctx, args.conversationId, { now, lastMessageAt: now });
    return messageId;
  },
});

/** Internal — append a system message (status notices). Not browser-callable. */
export const appendSystemMessage = internalMutation({
  args: {
    conversationId: v.id("nexusConversations"),
    content: v.string(),
    kind: v.optional(v.union(v.literal("task_status"), v.literal("error"))),
    taskId: v.optional(v.id("nexusTasks")),
    metadata: v.optional(boundedMetadataValidator),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) throw new Error("conversation_not_found");
    const now = Date.now();
    const messageId = await appendMessage(ctx, {
      conversationId: args.conversationId,
      ownerClerkUserId: conversation.ownerClerkUserId,
      author: "system",
      kind: args.kind ?? "task_status",
      content: args.content,
      taskId: args.taskId,
      metadata: args.metadata,
      now,
    });
    await touchConversation(ctx, args.conversationId, { now, lastMessageAt: now });
    return messageId;
  },
});
