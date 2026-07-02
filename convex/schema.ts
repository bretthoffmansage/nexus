import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { boundedMetadataValidator } from "./lib/p5config";
import { taskStatusValidator } from "./lib/taskStatus";

const libraryProcessingStatusValidator = v.union(
  v.literal("uploaded"),
  v.literal("queued"),
  v.literal("processing"),
  v.literal("processed"),
  v.literal("needs_review"),
  v.literal("failed"),
  v.literal("unsupported"),
  v.literal("archived"),
);

const libraryDocumentStatusValidator = v.union(
  v.literal("active"),
  v.literal("archived"),
  v.literal("deleted"),
);

const taskKindValidator = v.union(
  v.literal("chat"),
  v.literal("library_document_processing"),
  v.literal("scheduled_task"),
  v.literal("membership_full_sync"),
  v.literal("deep_research"),
);

const libraryTaskMetadataValidator = v.object({
  kind: v.literal("library_document_processing"),
  explicitUserAction: v.literal("process"),
  documentId: v.id("nexusLibraryDocuments"),
  documentVersionId: v.id("nexusLibraryDocumentVersions"),
  idempotencyKey: v.string(),
  attachments: v.array(
    v.object({
      attachmentId: v.string(),
      role: v.literal("primary_document"),
    }),
  ),
});

const scheduledTaskMetadataValidator = v.object({
  kind: v.literal("scheduled_task"),
  scheduledEventId: v.id("nexusScheduledEvents"),
  scheduledForUtc: v.number(),
  explicitUserAction: v.literal("schedule"),
  lateDispatch: v.optional(v.boolean()),
});

const membershipFullSyncTaskMetadataValidator = v.object({
  kind: v.literal("membership_full_sync"),
  scheduledEventId: v.id("nexusScheduledEvents"),
  scheduledForUtc: v.string(),
  explicitUserAction: v.literal("sync"),
  idempotencyKey: v.string(),
});

const deepResearchTaskMetadataValidator = v.object({
  kind: v.literal("deep_research"),
  sourcePage: v.literal("nexus_deep_research"),
  explicitUserAction: v.literal("research"),
  researchRequestId: v.string(),
  idempotencyKey: v.string(),
});

const noteTypeValidator = v.union(v.literal("note"), v.literal("checklist"));

const checklistItemValidator = v.object({
  id: v.string(),
  text: v.string(),
  completed: v.boolean(),
  order: v.number(),
});

const calendarEventStatusValidator = v.union(
  v.literal("scheduled"),
  v.literal("due"),
  v.literal("dispatching"),
  v.literal("queued"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("needs_review"),
  v.literal("cancelled"),
  v.literal("deleted"),
);

const calendarDispatchStateValidator = v.union(
  v.literal("undispatched"),
  v.literal("dispatching"),
  v.literal("dispatched"),
  v.literal("dispatch_failed"),
);

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
    conversationId: v.optional(v.id("nexusConversations")),
    requestMessageId: v.optional(v.id("nexusMessages")),
    taskKind: v.optional(taskKindValidator),
    libraryDocumentId: v.optional(v.id("nexusLibraryDocuments")),
    libraryDocumentVersionId: v.optional(v.id("nexusLibraryDocumentVersions")),
    scheduledEventId: v.optional(v.id("nexusScheduledEvents")),
    taskMetadata: v.optional(
      v.union(
        libraryTaskMetadataValidator,
        scheduledTaskMetadataValidator,
        membershipFullSyncTaskMetadataValidator,
        deepResearchTaskMetadataValidator,
      ),
    ),
    requestedToolId: v.string(),
    /** Exact user-visible request text (Chat transcript + Tasks UI). */
    requestText: v.string(),
    /**
     * Optional governed model selection (Deep Research page only, v1.1). A
     * validated Vercel AI Gateway model identifier captured at submission time
     * so the run is reproducible; absent means "use Claudia's default". Only
     * the Deep Research submission path ever sets this; the Connector forwards
     * it only for the research tool, and Claudia is the final authority.
     */
    requestedModelId: v.optional(v.string()),
    /** Immutable contextual payload sent to the Connector; omitted when identical to requestText. */
    executionRequestText: v.optional(v.string()),
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
    // P6 — trusted Connector lease. Set only while status is
    // claimed/running/cancel_requested; cleared on every terminal transition.
    // Ownership of the task itself never changes; this is scheduling state only.
    claimedByConnectorId: v.optional(v.string()),
    leaseId: v.optional(v.string()),
    leaseExpiresAt: v.optional(v.number()),
    lastLeaseHeartbeatAt: v.optional(v.number()),
    claimAttempt: v.optional(v.number()),
    /** Times a stale/abandoned lease on this task has been recovered. Bounds
     * requeue loops (see `convex/lib/p6config.ts` `maxLeaseRecoveries`). */
    recoveryCount: v.optional(v.number()),
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
    // P6 — stale lease recovery scan (claimed/running/cancel_requested tasks
    // whose lease has expired). NEVER exposed through public user queries.
    .index("by_status_and_lease_expires_at", ["status", "leaseExpiresAt"])
    // Retry lineage.
    .index("by_retry_of_task", ["retryOfTaskId"])
    .index("by_library_document_version", ["libraryDocumentVersionId"])
    .index("by_scheduled_event", ["scheduledEventId"]),

  // Private per-user scheduled calendar events (one-time tasks in v1).
  nexusScheduledEvents: defineTable({
    ownerClerkUserId: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    taskRequest: v.string(),
    requestedToolId: v.string(),
    timezone: v.string(),
    localScheduledDate: v.string(),
    localScheduledTime: v.string(),
    scheduledForUtc: v.number(),
    oneTime: v.literal(true),
    scheduleStatus: calendarEventStatusValidator,
    dispatchState: calendarDispatchStateValidator,
    dispatchClaimToken: v.optional(v.string()),
    dispatchStartedAt: v.optional(v.number()),
    dispatchedAt: v.optional(v.number()),
    linkedTaskId: v.optional(v.id("nexusTasks")),
    queueSequence: v.optional(v.number()),
    lateDispatch: v.optional(v.boolean()),
    latenessMs: v.optional(v.number()),
    lastDispatchError: v.optional(v.string()),
    revision: v.number(),
    queuedAt: v.optional(v.number()),
    claimedAt: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    progressMessage: v.optional(v.string()),
    terminalResultSummary: v.optional(v.string()),
    terminalErrorCode: v.optional(v.string()),
    terminalUserSafeMessage: v.optional(v.string()),
    deletedAt: v.optional(v.number()),
    deletedBy: v.optional(v.string()),
    hiddenFromCalendar: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
    createdBy: v.string(),
  })
    .index("by_owner_and_local_date", ["ownerClerkUserId", "localScheduledDate"])
    .index("by_owner_and_scheduled_for_utc", ["ownerClerkUserId", "scheduledForUtc"])
    .index("by_schedule_status_and_scheduled_for_utc", [
      "scheduleStatus",
      "scheduledForUtc",
    ])
    .index("by_dispatch_state_and_scheduled_for_utc", [
      "dispatchState",
      "scheduledForUtc",
    ])
    .index("by_linked_task", ["linkedTaskId"]),

  // Immutable hosted Library document versions (Dropzone upload contract).
  nexusLibraryDocuments: defineTable({
    ownerClerkUserId: v.string(),
    displayName: v.string(),
    status: libraryDocumentStatusValidator,
    latestVersionId: v.optional(v.id("nexusLibraryDocumentVersions")),
    versionCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
  })
    .index("by_owner_and_updated_at", ["ownerClerkUserId", "updatedAt"])
    .index("by_owner_and_status_and_updated_at", [
      "ownerClerkUserId",
      "status",
      "updatedAt",
    ]),

  nexusLibraryDocumentVersions: defineTable({
    documentId: v.id("nexusLibraryDocuments"),
    ownerClerkUserId: v.string(),
    versionNumber: v.number(),
    originalFilename: v.string(),
    displayFilename: v.string(),
    contentType: v.string(),
    fileExtension: v.string(),
    byteLength: v.number(),
    sha256: v.string(),
    storageId: v.id("_storage"),
    uploadedAt: v.number(),
    processingStatus: libraryProcessingStatusValidator,
    activeTaskId: v.optional(v.id("nexusTasks")),
    lastTaskId: v.optional(v.id("nexusTasks")),
    progressMessage: v.optional(v.string()),
    terminalSummary: v.optional(v.string()),
    terminalDisposition: v.optional(v.string()),
    terminalRetryable: v.optional(v.boolean()),
    terminalPartial: v.optional(v.boolean()),
    terminalWarnings: v.optional(v.array(v.string())),
    notesCreatedCount: v.optional(v.number()),
    vaultLocatorCount: v.optional(v.number()),
    unsupportedReason: v.optional(v.string()),
    archivedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_document_and_version", ["documentId", "versionNumber"])
    .index("by_owner_and_uploaded_at", ["ownerClerkUserId", "uploadedAt"])
    .index("by_owner_and_processing_status", ["ownerClerkUserId", "processingStatus"])
    .index("by_active_task", ["activeTaskId"]),

  nexusTaskAttachments: defineTable({
    attachmentId: v.string(),
    taskId: v.id("nexusTasks"),
    ownerClerkUserId: v.string(),
    documentId: v.id("nexusLibraryDocuments"),
    documentVersionId: v.id("nexusLibraryDocumentVersions"),
    role: v.literal("primary_document"),
    storageId: v.id("_storage"),
    originalFilename: v.string(),
    displayFilename: v.string(),
    contentType: v.string(),
    fileExtension: v.string(),
    byteLength: v.number(),
    sha256: v.string(),
    createdAt: v.number(),
  })
    .index("by_task", ["taskId"])
    .index("by_attachment_id", ["attachmentId"])
    .index("by_document_version", ["documentVersionId"]),

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
      v.literal("conversation_deleted"),
      // P6 — trusted Connector lifecycle (never browser-originated).
      v.literal("task_claimed"),
      v.literal("task_started"),
      v.literal("task_completed"),
      v.literal("task_failed"),
      v.literal("task_lease_recovered"),
    ),
    conversationId: v.optional(v.id("nexusConversations")),
    taskId: v.optional(v.id("nexusTasks")),
    /** P6 — which Connector performed a worker-originated event, if any. */
    connectorId: v.optional(v.string()),
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

  // ---------------------------------------------------------------------------
  // P6 — trusted Connector queue protocol. `nexusTasks` remains the ONE
  // canonical queue; these tables add machine identity and replay protection
  // for the future Console Connector. No plaintext secret is ever stored here
  // — the shared secret lives only in Convex deployment environment config and
  // is verified via HMAC (see `convex/lib/connectorAuth.ts`).
  // ---------------------------------------------------------------------------

  // A trusted machine identity, provisioned only via an operator-run bootstrap
  // (`npx convex run connectorRegistry:bootstrapConnector ...`) — never via a
  // public/self-registration endpoint. Ordinary users never read this table
  // directly; only privacy-safe projections are exposed (see
  // `connectorRegistry.ts` / `diagnostics.ts`).
  nexusConnectors: defineTable({
    connectorId: v.string(),
    displayName: v.string(),
    status: v.union(v.literal("active"), v.literal("disabled"), v.literal("revoked")),
    enabled: v.boolean(),
    /** Reserved for future fine-grained scoping; P6 grants the full protocol set. */
    allowedCapabilities: v.array(v.string()),
    /** Tool IDs this Connector may claim. Defaults to all P5-supported tools when unset. */
    allowedToolIds: v.optional(v.array(v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastSeenAt: v.optional(v.number()),
    lastHeartbeatAt: v.optional(v.number()),
    operatingState: v.optional(
      v.union(
        v.literal("idle"),
        v.literal("claiming"),
        v.literal("running"),
        v.literal("degraded"),
      ),
    ),
    currentTaskId: v.optional(v.id("nexusTasks")),
    currentLeaseId: v.optional(v.string()),
    softwareVersion: v.optional(v.string()),
    hostLabel: v.optional(v.string()),
    environment: v.optional(v.string()),
    lastErrorCode: v.optional(v.string()),
    lastErrorAt: v.optional(v.number()),
    disabledAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    metadata: v.optional(boundedMetadataValidator),
  })
    .index("by_connector_id", ["connectorId"])
    .index("by_status", ["status"])
    .index("by_last_seen_at", ["lastSeenAt"])
    .index("by_current_task_id", ["currentTaskId"]),

  // Replay protection for signed Connector requests. A (connectorId, nonce)
  // pair may be consumed at most once. Bounded retention — pruned by a cron.
  nexusConnectorNonces: defineTable({
    connectorId: v.string(),
    nonce: v.string(),
    requestTimestamp: v.number(),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_connector_and_nonce", ["connectorId", "nonce"])
    .index("by_expires_at", ["expiresAt"]),

  // Private per-user Google Keep–style notes (Nexus-owned authority).
  nexusNotes: defineTable({
    ownerClerkUserId: v.string(),
    title: v.string(),
    content: v.string(),
    noteType: noteTypeValidator,
    checklistItems: v.array(checklistItemValidator),
    labels: v.array(v.string()),
    pinned: v.boolean(),
    archived: v.boolean(),
    dueAtUtc: v.optional(v.number()),
    dueLocalDate: v.optional(v.string()),
    dueLocalTime: v.optional(v.string()),
    timezone: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
  })
    .index("by_owner_and_archived_and_updated_at", [
      "ownerClerkUserId",
      "archived",
      "updatedAt",
    ])
    .index("by_owner_and_archived_and_due_at", ["ownerClerkUserId", "archived", "dueAtUtc"]),
});
