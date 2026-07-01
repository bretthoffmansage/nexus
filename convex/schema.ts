import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { boundedMetadataValidator } from "./lib/p5config";
import { taskStatusValidator } from "./lib/taskStatus";

const userStatus = v.union(
  v.literal("pending"),
  v.literal("active"),
  v.literal("suspended"),
);

const roleName = v.union(v.literal("knowledge_reader"), v.literal("nexus_admin"));

const identityEventType = v.union(
  v.literal("user_seen"),
  v.literal("user_approved"),
  v.literal("user_suspended"),
  v.literal("user_reactivated"),
  v.literal("role_granted"),
  v.literal("role_revoked"),
  v.literal("clerk_user_updated"),
  v.literal("clerk_user_deleted"),
  v.literal("identity_email_repaired"),
);

export default defineSchema({
  approvedUsers: defineTable({
    clerkUserId: v.string(),
    primaryEmail: v.string(),
    displayName: v.optional(v.string()),
    status: userStatus,
    invitedAt: v.optional(v.number()),
    firstSeenAt: v.number(),
    approvedAt: v.optional(v.number()),
    approvedByClerkUserId: v.optional(v.string()),
    suspendedAt: v.optional(v.number()),
    suspendedByClerkUserId: v.optional(v.string()),
    suspensionReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_clerk_user_id", ["clerkUserId"])
    .index("by_primary_email", ["primaryEmail"])
    .index("by_status", ["status"]),

  userRoles: defineTable({
    clerkUserId: v.string(),
    role: roleName,
    grantedAt: v.number(),
    grantedByClerkUserId: v.string(),
    revokedAt: v.optional(v.number()),
    revokedByClerkUserId: v.optional(v.string()),
    active: v.boolean(),
  })
    .index("by_clerk_user_id", ["clerkUserId"])
    .index("by_clerk_user_id_and_role", ["clerkUserId", "role"])
    .index("by_role_and_active", ["role", "active"]),

  identityAuditEvents: defineTable({
    eventType: identityEventType,
    actorType: v.union(v.literal("user"), v.literal("system"), v.literal("clerk_webhook")),
    actorId: v.string(),
    targetClerkUserId: v.string(),
    at: v.number(),
    metadata: v.optional(v.any()),
    dedupeKey: v.optional(v.string()),
  })
    .index("by_target_and_at", ["targetClerkUserId", "at"])
    .index("by_event_type_and_at", ["eventType", "at"])
    .index("by_at", ["at"])
    .index("by_dedupe_key", ["dedupeKey"]),

  // ---------------------------------------------------------------------------
  // P5 — private hosted conversations, persistent tasks, and the shared queue.
  // Every row is owned by the verified Clerk subject (`ownerClerkUserId`).
  // ---------------------------------------------------------------------------

  // A private user-owned thread containing ordered messages and one or more
  // tasks. ("conversation", never "session" — Clerk owns the term "session".)
  nexusConversations: defineTable({
    ownerClerkUserId: v.string(),
    title: v.string(),
    titleSource: v.union(
      v.literal("default"),
      v.literal("user"),
      v.literal("generated"),
    ),
    status: v.union(v.literal("active"), v.literal("archived")),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastMessageAt: v.optional(v.number()),
    lastTaskAt: v.optional(v.number()),
    archivedAt: v.optional(v.number()),
  })
    .index("by_owner_and_updated_at", ["ownerClerkUserId", "updatedAt"])
    .index("by_owner_and_status_and_updated_at", [
      "ownerClerkUserId",
      "status",
      "updatedAt",
    ])
    .index("by_owner_and_created_at", ["ownerClerkUserId", "createdAt"]),

  // An append-only conversational entry authored by the user, assistant, or
  // system. Browser callers may only create `user`/`text` messages.
  nexusMessages: defineTable({
    conversationId: v.id("nexusConversations"),
    ownerClerkUserId: v.string(),
    author: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system"),
    ),
    kind: v.union(
      v.literal("text"),
      v.literal("task_status"),
      v.literal("error"),
      v.literal("result_summary"),
    ),
    content: v.string(),
    taskId: v.optional(v.id("nexusTasks")),
    createdAt: v.number(),
    sequence: v.number(),
    metadata: v.optional(boundedMetadataValidator),
  })
    .index("by_conversation_and_sequence", ["conversationId", "sequence"])
    .index("by_owner_and_created_at", ["ownerClerkUserId", "createdAt"])
    .index("by_task", ["taskId"]),

  // A durable queued work request. The future Console Connector (P6+) will
  // claim and execute these; in P5 they remain honestly `queued`.
  nexusTasks: defineTable({
    ownerClerkUserId: v.string(),
    conversationId: v.id("nexusConversations"),
    requestMessageId: v.id("nexusMessages"),
    requestedToolId: v.string(),
    requestText: v.string(),
    normalizedRequestHash: v.optional(v.string()),
    status: taskStatusValidator,
    queueSequence: v.number(),
    priority: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    queuedAt: v.number(),
    claimedAt: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    cancellationRequestedAt: v.optional(v.number()),
    retryOfTaskId: v.optional(v.id("nexusTasks")),
    attemptNumber: v.number(),
    idempotencyKey: v.string(),
    resultSummary: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  })
    // User-private indexes.
    .index("by_owner_and_created_at", ["ownerClerkUserId", "createdAt"])
    .index("by_owner_and_status_and_created_at", [
      "ownerClerkUserId",
      "status",
      "createdAt",
    ])
    .index("by_owner_and_conversation_and_created_at", [
      "ownerClerkUserId",
      "conversationId",
      "createdAt",
    ])
    .index("by_owner_and_idempotency_key", ["ownerClerkUserId", "idempotencyKey"])
    // Global future-worker indexes — NEVER exposed through public user queries.
    .index("by_status_and_priority_and_queue_sequence", [
      "status",
      "priority",
      "queueSequence",
    ])
    .index("by_status_and_queue_sequence", ["status", "queueSequence"])
    .index("by_queue_sequence", ["queueSequence"])
    // Retry lineage.
    .index("by_retry_of_task", ["retryOfTaskId"]),

  // A bounded chronological status event for a task. User-safe content only.
  nexusTaskProgressEvents: defineTable({
    taskId: v.id("nexusTasks"),
    ownerClerkUserId: v.string(),
    sequence: v.number(),
    eventType: v.union(
      v.literal("task_created"),
      v.literal("task_queued"),
      v.literal("cancel_requested"),
      v.literal("task_cancelled"),
      v.literal("task_claimed"),
      v.literal("task_started"),
      v.literal("tool_progress"),
      v.literal("task_completed"),
      v.literal("task_failed"),
    ),
    message: v.optional(v.string()),
    createdAt: v.number(),
    metadata: v.optional(boundedMetadataValidator),
  })
    .index("by_task_and_sequence", ["taskId", "sequence"])
    .index("by_owner_and_created_at", ["ownerClerkUserId", "createdAt"]),

  // A bounded provenance record attached to a task result. Excerpts are
  // length-limited; full documents/transcripts are never stored.
  nexusTaskSources: defineTable({
    taskId: v.id("nexusTasks"),
    ownerClerkUserId: v.string(),
    sourceType: v.union(
      v.literal("vault_note"),
      v.literal("membership_transcript"),
      v.literal("web"),
      v.literal("file"),
      v.literal("other"),
    ),
    title: v.string(),
    locator: v.optional(v.string()),
    excerpt: v.optional(v.string()),
    provenanceLabel: v.optional(v.string()),
    ordinal: v.number(),
    createdAt: v.number(),
  })
    .index("by_task_and_ordinal", ["taskId", "ordinal"])
    .index("by_owner_and_created_at", ["ownerClerkUserId", "createdAt"]),

  // The structured completion payload produced later by a trusted worker. One
  // canonical result per task (replaced in place if rewritten).
  nexusTaskResults: defineTable({
    taskId: v.id("nexusTasks"),
    ownerClerkUserId: v.string(),
    answerText: v.string(),
    format: v.union(v.literal("markdown"), v.literal("plain")),
    createdAt: v.number(),
    completedBy: v.optional(v.string()),
    model: v.optional(v.string()),
    toolId: v.optional(v.string()),
    durationMs: v.optional(v.number()),
  })
    .index("by_task", ["taskId"])
    .index("by_owner_and_created_at", ["ownerClerkUserId", "createdAt"]),

  // Owner-private lifecycle audit for conversations and tasks. Bounded metadata.
  nexusTaskAuditEvents: defineTable({
    ownerClerkUserId: v.string(),
    eventType: v.union(
      v.literal("task_created"),
      v.literal("task_cancel_requested"),
      v.literal("task_cancelled"),
      v.literal("task_retried"),
      v.literal("conversation_created"),
      v.literal("conversation_archived"),
      v.literal("conversation_reopened"),
    ),
    conversationId: v.optional(v.id("nexusConversations")),
    taskId: v.optional(v.id("nexusTasks")),
    at: v.number(),
    metadata: v.optional(boundedMetadataValidator),
  })
    .index("by_owner_and_at", ["ownerClerkUserId", "at"])
    .index("by_task_and_at", ["taskId", "at"]),

  // Singleton monotonic allocator for the global queue sequence.
  nexusQueueCounter: defineTable({
    key: v.string(),
    value: v.number(),
  }).index("by_key", ["key"]),
});
