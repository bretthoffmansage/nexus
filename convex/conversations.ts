import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { NEXUS_ERROR_CODES, nexusError } from "./lib/errors";
import {
  requireKnowledgeReader,
  requireOwnedConversation,
} from "./lib/ownership";
import {
  clampPageSize,
  normalizeWhitespace,
  P5_LIMITS,
} from "./lib/p5config";
import { recordAudit } from "./lib/p5writes";

const DEFAULT_CONVERSATION_TITLE = "New conversation";

/** Sanitize and length-limit a user-supplied conversation title. */
function sanitizeTitle(raw: string): string {
  const normalized = normalizeWhitespace(raw);
  if (!normalized) {
    nexusError(NEXUS_ERROR_CODES.INVALID_INPUT, "Title cannot be empty");
  }
  return normalized.slice(0, P5_LIMITS.maxConversationTitleLength);
}

/** Owner-safe projection of a conversation row. */
function projectConversation(doc: Doc<"nexusConversations">) {
  return {
    id: doc._id,
    title: doc.title,
    titleSource: doc.titleSource,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    lastMessageAt: doc.lastMessageAt ?? null,
    lastTaskAt: doc.lastTaskAt ?? null,
    archivedAt: doc.archivedAt ?? null,
  };
}

export const createConversation = mutation({
  args: {
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { clerkUserId } = await requireKnowledgeReader(ctx);
    const now = Date.now();

    const hasUserTitle = typeof args.title === "string" && args.title.trim().length > 0;
    const title = hasUserTitle ? sanitizeTitle(args.title!) : DEFAULT_CONVERSATION_TITLE;

    const conversationId = await ctx.db.insert("nexusConversations", {
      ownerClerkUserId: clerkUserId,
      title,
      titleSource: hasUserTitle ? "user" : "default",
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

    const created = await ctx.db.get(conversationId);
    return projectConversation(created!);
  },
});

export const listMyConversations = query({
  args: {
    limit: v.optional(v.number()),
    before: v.optional(v.number()),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { clerkUserId } = await requireKnowledgeReader(ctx);
    const limit = clampPageSize(
      args.limit,
      P5_LIMITS.conversationsPageSize,
      P5_LIMITS.conversationsPageSizeMax,
    );

    let rows: Doc<"nexusConversations">[];
    if (args.includeArchived) {
      rows = await ctx.db
        .query("nexusConversations")
        .withIndex("by_owner_and_updated_at", (q) => {
          const base = q.eq("ownerClerkUserId", clerkUserId);
          return args.before !== undefined ? base.lt("updatedAt", args.before) : base;
        })
        .order("desc")
        .take(limit);
    } else {
      rows = await ctx.db
        .query("nexusConversations")
        .withIndex("by_owner_and_status_and_updated_at", (q) => {
          const base = q.eq("ownerClerkUserId", clerkUserId).eq("status", "active");
          return args.before !== undefined ? base.lt("updatedAt", args.before) : base;
        })
        .order("desc")
        .take(limit);
    }

    return {
      conversations: rows.map(projectConversation),
      nextCursor: rows.length === limit ? rows[rows.length - 1].updatedAt : null,
    };
  },
});

export const getMyConversation = query({
  args: { conversationId: v.id("nexusConversations") },
  handler: async (ctx, args) => {
    const { clerkUserId } = await requireKnowledgeReader(ctx);
    const conversation = await requireOwnedConversation(
      ctx,
      clerkUserId,
      args.conversationId,
    );
    return projectConversation(conversation);
  },
});

export const renameMyConversation = mutation({
  args: {
    conversationId: v.id("nexusConversations"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const { clerkUserId } = await requireKnowledgeReader(ctx);
    await requireOwnedConversation(ctx, clerkUserId, args.conversationId);
    const title = sanitizeTitle(args.title);
    await ctx.db.patch(args.conversationId, {
      title,
      titleSource: "user",
      updatedAt: Date.now(),
    });
    const updated = await ctx.db.get(args.conversationId);
    return projectConversation(updated!);
  },
});

export const archiveMyConversation = mutation({
  args: { conversationId: v.id("nexusConversations") },
  handler: async (ctx, args) => {
    const { clerkUserId } = await requireKnowledgeReader(ctx);
    const conversation = await requireOwnedConversation(
      ctx,
      clerkUserId,
      args.conversationId,
    );
    if (conversation.status === "archived") {
      return projectConversation(conversation);
    }
    const now = Date.now();
    await ctx.db.patch(args.conversationId, {
      status: "archived",
      archivedAt: now,
      updatedAt: now,
    });
    await recordAudit(ctx, {
      ownerClerkUserId: clerkUserId,
      eventType: "conversation_archived",
      conversationId: args.conversationId,
      now,
    });
    const updated = await ctx.db.get(args.conversationId);
    return projectConversation(updated!);
  },
});

export const reopenMyConversation = mutation({
  args: { conversationId: v.id("nexusConversations") },
  handler: async (ctx, args) => {
    const { clerkUserId } = await requireKnowledgeReader(ctx);
    const conversation = await requireOwnedConversation(
      ctx,
      clerkUserId,
      args.conversationId,
    );
    if (conversation.status === "active") {
      return projectConversation(conversation);
    }
    const now = Date.now();
    await ctx.db.patch(args.conversationId, {
      status: "active",
      archivedAt: undefined,
      updatedAt: now,
    });
    await recordAudit(ctx, {
      ownerClerkUserId: clerkUserId,
      eventType: "conversation_reopened",
      conversationId: args.conversationId,
      now,
    });
    const updated = await ctx.db.get(args.conversationId);
    return projectConversation(updated!);
  },
});

/**
 * Full reopen payload: the conversation, its ordered messages, and lightweight
 * task summaries. Result bodies and sources are fetched on demand per task.
 */
export const getConversationTranscript = query({
  args: {
    conversationId: v.id("nexusConversations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { clerkUserId } = await requireKnowledgeReader(ctx);
    const conversation = await requireOwnedConversation(
      ctx,
      clerkUserId,
      args.conversationId,
    );

    const limit = clampPageSize(
      args.limit,
      P5_LIMITS.messagesPageSize,
      P5_LIMITS.messagesPageSizeMax,
    );

    const messages = await ctx.db
      .query("nexusMessages")
      .withIndex("by_conversation_and_sequence", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("asc")
      .take(limit);

    const tasks = await ctx.db
      .query("nexusTasks")
      .withIndex("by_owner_and_conversation_and_created_at", (q) =>
        q.eq("ownerClerkUserId", clerkUserId).eq("conversationId", args.conversationId),
      )
      .order("asc")
      .take(P5_LIMITS.tasksPageSizeMax);

    return {
      conversation: projectConversation(conversation),
      messages: messages.map((m) => ({
        id: m._id,
        author: m.author,
        kind: m.kind,
        content: m.content,
        taskId: m.taskId ?? null,
        sequence: m.sequence,
        createdAt: m.createdAt,
      })),
      tasks: tasks.map((t) => ({
        id: t._id,
        status: t.status,
        requestedToolId: t.requestedToolId,
        requestText: t.requestText,
        queueSequence: t.queueSequence,
        attemptNumber: t.attemptNumber,
        createdAt: t.createdAt,
        resultSummary: t.resultSummary ?? null,
        errorCode: t.errorCode ?? null,
      })),
    };
  },
});
