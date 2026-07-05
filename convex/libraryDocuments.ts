import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { NEXUS_ERROR_CODES, nexusError } from "./lib/errors";
import {
  assertSafeOriginalFilename,
  sanitizeDisplayFilename,
} from "./lib/libraryFilename";
import {
  isDeniedLibraryExtension,
  isLibraryRemoteExtension,
  LIBRARY_ATTACHMENT_ROLE_PRIMARY,
  LIBRARY_DROPZONE_TOOL_ID,
  LIBRARY_MAX_UPLOAD_BYTES,
  LIBRARY_TASK_KIND,
  normalizeFileExtension,
} from "./lib/libraryDropzoneConfig";
import { patchLibraryVersionForTaskStatus } from "./lib/libraryProjection";
import { isValidSha256Hex, normalizeSha256Hex } from "./lib/librarySha256";
import { allocateQueueSequence, defaultQueuePriority } from "./lib/queue";
import { P5_LIMITS } from "./lib/p5config";
import { appendProgress, recordAudit } from "./lib/p5writes";
import {
  getCurrentApprovedClerkUserId,
  requireKnowledgeReader,
  requireOwnedLibraryDocument,
  requireOwnedLibraryVersion,
} from "./lib/ownership";
import type { TaskStatus } from "./lib/taskStatus";
import { taskStatusValidator } from "./lib/taskStatus";

const ACTIVE_TASK_STATUSES: readonly TaskStatus[] = [
  "queued",
  "claimed",
  "running",
  "cancel_requested",
];

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireKnowledgeReader(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const finalizeUploadRecord = internalMutation({
  args: {
    clerkUserId: v.string(),
    storageId: v.id("_storage"),
    originalFilename: v.string(),
    contentType: v.string(),
    byteLength: v.number(),
    sha256: v.string(),
    documentId: v.optional(v.id("nexusLibraryDocuments")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    try {
      assertSafeOriginalFilename(args.originalFilename);
    } catch {
      nexusError(NEXUS_ERROR_CODES.LIBRARY_UPLOAD_INVALID, "Invalid filename");
    }

    const ext = normalizeFileExtension(args.originalFilename);
    const displayFilename = sanitizeDisplayFilename(args.originalFilename);
    const sha256 = normalizeSha256Hex(args.sha256);
    if (!isValidSha256Hex(sha256)) {
      nexusError(NEXUS_ERROR_CODES.LIBRARY_UPLOAD_INVALID, "Invalid content digest");
    }
    if (args.byteLength <= 0 || args.byteLength > LIBRARY_MAX_UPLOAD_BYTES) {
      nexusError(NEXUS_ERROR_CODES.LIBRARY_UPLOAD_TOO_LARGE, "Upload exceeds the maximum size");
    }

    const metadata = await ctx.storage.getMetadata(args.storageId);
    if (!metadata || metadata.size !== args.byteLength) {
      nexusError(NEXUS_ERROR_CODES.LIBRARY_UPLOAD_INVALID, "Stored bytes do not match declared length");
    }

    const unsupported =
      !ext ||
      isDeniedLibraryExtension(ext) ||
      !isLibraryRemoteExtension(ext);
    const processingStatus = unsupported ? ("unsupported" as const) : ("uploaded" as const);
    const unsupportedReason = unsupported
      ? "Format is not supported for remote Dropzone processing."
      : undefined;

    let documentId = args.documentId;
    if (documentId) {
      const doc = await ctx.db.get(documentId);
      if (!doc || doc.ownerClerkUserId !== args.clerkUserId || doc.status === "deleted") {
        nexusError(NEXUS_ERROR_CODES.LIBRARY_DOCUMENT_NOT_FOUND, "Document not found");
      }
    } else {
      documentId = await ctx.db.insert("nexusLibraryDocuments", {
        ownerClerkUserId: args.clerkUserId,
        displayName: displayFilename,
        status: "active",
        versionCount: 0,
        createdAt: now,
        updatedAt: now,
      });
    }

    const document = await ctx.db.get(documentId);
    if (!document) nexusError(NEXUS_ERROR_CODES.LIBRARY_DOCUMENT_NOT_FOUND, "Document not found");

    const versionNumber = document.versionCount + 1;
    const versionId = await ctx.db.insert("nexusLibraryDocumentVersions", {
      documentId,
      ownerClerkUserId: args.clerkUserId,
      versionNumber,
      originalFilename: args.originalFilename,
      displayFilename,
      contentType: args.contentType || "application/octet-stream",
      fileExtension: ext,
      byteLength: args.byteLength,
      sha256,
      storageId: args.storageId,
      uploadedAt: now,
      processingStatus,
      unsupportedReason,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(documentId, {
      latestVersionId: versionId,
      versionCount: versionNumber,
      displayName: document.versionCount === 0 ? displayFilename : document.displayName,
      updatedAt: now,
    });

    return { documentId, documentVersionId: versionId, versionNumber, processingStatus };
  },
});

export const listMyLibraryVersions = query({
  args: {
    statusFilter: v.optional(
      v.union(
        v.literal("all"),
        v.literal("uploaded"),
        v.literal("queued"),
        v.literal("processing"),
        v.literal("processed"),
        v.literal("needs_review"),
        v.literal("failed"),
        v.literal("unsupported"),
        v.literal("archived"),
      ),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { clerkUserId } = await requireKnowledgeReader(ctx);
    const limit = Math.min(args.limit ?? 50, 100);
    const filter = args.statusFilter ?? "all";

    let rows;
    if (filter === "all") {
      rows = await ctx.db
        .query("nexusLibraryDocumentVersions")
        .withIndex("by_owner_and_uploaded_at", (q) => q.eq("ownerClerkUserId", clerkUserId))
        .order("desc")
        .take(limit);
      rows = rows.filter((r) => r.processingStatus !== "archived" && !r.deletedAt);
    } else {
      rows = await ctx.db
        .query("nexusLibraryDocumentVersions")
        .withIndex("by_owner_and_processing_status", (q) =>
          q.eq("ownerClerkUserId", clerkUserId).eq("processingStatus", filter),
        )
        .order("desc")
        .take(limit);
    }

    return rows.map(projectVersionForUi);
  },
});

export const listMyDocumentVersions = query({
  args: { documentId: v.id("nexusLibraryDocuments") },
  handler: async (ctx, args) => {
    const { clerkUserId } = await requireKnowledgeReader(ctx);
    await requireOwnedLibraryDocument(ctx, clerkUserId, args.documentId);
    const rows = await ctx.db
      .query("nexusLibraryDocumentVersions")
      .withIndex("by_document_and_version", (q) => q.eq("documentId", args.documentId))
      .order("desc")
      .collect();
    return rows.filter((r) => !r.deletedAt).map(projectVersionForUi);
  },
});

function projectVersionForUi(version: Doc<"nexusLibraryDocumentVersions">) {
  return {
    documentVersionId: version._id,
    documentId: version.documentId,
    versionNumber: version.versionNumber,
    originalFilename: version.originalFilename,
    displayFilename: version.displayFilename,
    contentType: version.contentType,
    fileExtension: version.fileExtension,
    byteLength: version.byteLength,
    sha256: version.sha256,
    uploadedAt: version.uploadedAt,
    processingStatus: version.processingStatus,
    activeTaskId: version.activeTaskId,
    progressMessage: version.progressMessage,
    terminalSummary: version.terminalSummary,
    notesCreatedCount: version.notesCreatedCount,
    vaultLocatorCount: version.vaultLocatorCount,
    unsupportedReason: version.unsupportedReason,
    terminalRetryable: version.terminalRetryable,
    terminalWarnings: version.terminalWarnings,
  };
}

async function findActiveTaskForVersion(
  ctx: MutationCtx,
  version: Doc<"nexusLibraryDocumentVersions">,
): Promise<Doc<"nexusTasks"> | null> {
  if (version.activeTaskId) {
    const task = await ctx.db.get(version.activeTaskId);
    if (task && ACTIVE_TASK_STATUSES.includes(task.status)) return task;
  }
  const byVersion = await ctx.db
    .query("nexusTasks")
    .withIndex("by_library_document_version", (q) =>
      q.eq("libraryDocumentVersionId", version._id),
    )
    .order("desc")
    .take(5);
  return byVersion.find((t) => ACTIVE_TASK_STATUSES.includes(t.status)) ?? null;
}

export const processMyDocumentVersion = mutation({
  args: { documentVersionId: v.id("nexusLibraryDocumentVersions") },
  handler: async (ctx, args) => {
    const { clerkUserId } = await requireKnowledgeReader(ctx);
    const version = await requireOwnedLibraryVersion(ctx, clerkUserId, args.documentVersionId);

    if (version.processingStatus === "archived" || version.deletedAt) {
      nexusError(NEXUS_ERROR_CODES.LIBRARY_PROCESS_NOT_ALLOWED, "Version is archived");
    }
    if (version.processingStatus === "unsupported") {
      nexusError(NEXUS_ERROR_CODES.LIBRARY_UNSUPPORTED_FORMAT, "Format is not supported");
    }
    // needs_review + terminalRetryable is a retryable stop (disposition
    // "blocked"), not a human-review outcome; without this carve-out those
    // versions are unreachable dead ends in the UI.
    if (
      version.processingStatus === "processed" ||
      (version.processingStatus === "needs_review" && !version.terminalRetryable)
    ) {
      nexusError(NEXUS_ERROR_CODES.LIBRARY_PROCESS_NOT_ALLOWED, "Version is already processed");
    }
    if (version.processingStatus === "failed" && !version.terminalRetryable) {
      nexusError(NEXUS_ERROR_CODES.LIBRARY_PROCESS_NOT_ALLOWED, "Retry is not allowed for this version");
    }
    if (version.byteLength > LIBRARY_MAX_UPLOAD_BYTES) {
      nexusError(NEXUS_ERROR_CODES.LIBRARY_UPLOAD_TOO_LARGE, "File exceeds the maximum size");
    }

    const existingActive = await findActiveTaskForVersion(ctx, version);
    if (existingActive) {
      return {
        taskId: existingActive._id,
        queueSequence: existingActive.queueSequence,
        alreadyActive: true as const,
      };
    }

    const idempotencyKey = `${version._id}:${version.sha256}`;
    const prior = await ctx.db
      .query("nexusTasks")
      .withIndex("by_owner_and_idempotency_key", (q) =>
        q.eq("ownerClerkUserId", clerkUserId).eq("idempotencyKey", idempotencyKey),
      )
      .unique();
    if (prior && ACTIVE_TASK_STATUSES.includes(prior.status)) {
      await ctx.db.patch(version._id, { activeTaskId: prior._id, processingStatus: "queued", updatedAt: Date.now() });
      return { taskId: prior._id, queueSequence: prior.queueSequence, alreadyActive: true as const };
    }

    const now = Date.now();
    const queueSequence = await allocateQueueSequence(ctx);
    const attachmentId = crypto.randomUUID();
    const requestText = `Process uploaded document: ${version.displayFilename}`;

    const taskId = await ctx.db.insert("nexusTasks", {
      ownerClerkUserId: clerkUserId,
      taskKind: LIBRARY_TASK_KIND,
      libraryDocumentId: version.documentId,
      libraryDocumentVersionId: version._id,
      requestedToolId: LIBRARY_DROPZONE_TOOL_ID,
      requestText,
      taskMetadata: {
        kind: LIBRARY_TASK_KIND,
        explicitUserAction: "process",
        documentId: version.documentId,
        documentVersionId: version._id,
        idempotencyKey,
        attachments: [{ attachmentId, role: LIBRARY_ATTACHMENT_ROLE_PRIMARY }],
      },
      status: "queued",
      queueSequence,
      priority: defaultQueuePriority(),
      createdAt: now,
      updatedAt: now,
      queuedAt: now,
      attemptNumber: 1,
      idempotencyKey,
    });

    await ctx.db.insert("nexusTaskAttachments", {
      attachmentId,
      taskId,
      ownerClerkUserId: clerkUserId,
      documentId: version.documentId,
      documentVersionId: version._id,
      role: LIBRARY_ATTACHMENT_ROLE_PRIMARY,
      storageId: version.storageId,
      originalFilename: version.originalFilename,
      displayFilename: version.displayFilename,
      contentType: version.contentType,
      fileExtension: version.fileExtension,
      byteLength: version.byteLength,
      sha256: version.sha256,
      createdAt: now,
    });

    await ctx.db.patch(version._id, {
      processingStatus: "queued",
      activeTaskId: taskId,
      progressMessage: "Queued for Dropzone processing.",
      updatedAt: now,
    });

    await appendProgress(ctx, {
      taskId,
      ownerClerkUserId: clerkUserId,
      eventType: "task_created",
      message: requestText,
      now,
    });
    await appendProgress(ctx, {
      taskId,
      ownerClerkUserId: clerkUserId,
      eventType: "task_queued",
      message: "Queued in the global Nexus task queue.",
      now,
    });
    await recordAudit(ctx, {
      ownerClerkUserId: clerkUserId,
      eventType: "task_created",
      taskId,
      now,
      metadata: { kind: LIBRARY_TASK_KIND, documentVersionId: version._id },
    });

    return { taskId, queueSequence, alreadyActive: false as const };
  },
});

export const archiveMyDocumentVersion = mutation({
  args: { documentVersionId: v.id("nexusLibraryDocumentVersions") },
  handler: async (ctx, args) => {
    const { clerkUserId } = await requireKnowledgeReader(ctx);
    const version = await requireOwnedLibraryVersion(ctx, clerkUserId, args.documentVersionId);
    if (version.activeTaskId) {
      const task = await ctx.db.get(version.activeTaskId);
      if (task && ACTIVE_TASK_STATUSES.includes(task.status)) {
        nexusError(NEXUS_ERROR_CODES.LIBRARY_PROCESS_NOT_ALLOWED, "Version has an active task");
      }
    }
    const now = Date.now();
    await ctx.db.patch(version._id, {
      processingStatus: "archived",
      archivedAt: now,
      updatedAt: now,
    });
    return { documentVersionId: version._id };
  },
});

export const deleteMyDocumentVersion = mutation({
  args: { documentVersionId: v.id("nexusLibraryDocumentVersions") },
  handler: async (ctx, args) => {
    const { clerkUserId } = await requireKnowledgeReader(ctx);
    const version = await requireOwnedLibraryVersion(ctx, clerkUserId, args.documentVersionId);
    if (version.activeTaskId) {
      const task = await ctx.db.get(version.activeTaskId);
      if (task && ACTIVE_TASK_STATUSES.includes(task.status)) {
        nexusError(NEXUS_ERROR_CODES.LIBRARY_PROCESS_NOT_ALLOWED, "Cannot delete a version with an active task");
      }
    }
    const now = Date.now();
    await ctx.db.patch(version._id, { deletedAt: now, updatedAt: now });
    return { documentVersionId: version._id };
  },
});

/** Internal: sync library version when Connector transitions a library task. */
export const syncLibraryVersionFromTask = internalMutation({
  args: {
    taskId: v.id("nexusTasks"),
    taskStatus: taskStatusValidator,
    progressMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return;
    await patchLibraryVersionForTaskStatus(ctx, task, args.taskStatus, args.progressMessage);
  },
});
