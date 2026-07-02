import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { NEXUS_ERROR_CODES, nexusError } from "./lib/errors";
import {
  contentDispositionAttachment,
  sanitizeDisplayFilename,
} from "./lib/libraryFilename";
import {
  LIBRARY_ATTACHMENT_PROTOCOL_VERSION,
  LIBRARY_MAX_UPLOAD_BYTES,
} from "./lib/libraryDropzoneConfig";
import { requireActiveConnector } from "./connectorRegistry";
import type { TaskStatus } from "./lib/taskStatus";

const ACTIVE_DOWNLOAD_STATUSES: readonly TaskStatus[] = ["claimed", "running", "cancel_requested"];

export type AttachmentDownloadAuthResult = {
  storageId: Id<"_storage">;
  attachmentId: string;
  documentVersionId: Id<"nexusLibraryDocumentVersions">;
  contentType: string;
  displayFilename: string;
  byteLength: number;
  sha256: string;
  ownerClerkUserId: string;
};

/**
 * Lease/task/attachment binding checks only — no Convex storage reads.
 * Storage metadata and blob retrieval run in the HTTP action isolate where
 * storage I/O is authoritative (see `convex/http.ts` attachment handler).
 */
export const authorizeAttachmentDownload = internalQuery({
  args: {
    connectorId: v.string(),
    taskId: v.id("nexusTasks"),
    leaseId: v.string(),
    attachmentId: v.string(),
    now: v.number(),
  },
  handler: async (ctx, args): Promise<AttachmentDownloadAuthResult> => {
    await requireActiveConnector(ctx, args.connectorId);
    const task = await ctx.db.get(args.taskId);
    if (!task) nexusError(NEXUS_ERROR_CODES.TASK_NOT_FOUND, "Task not found");

    if (!task.claimedByConnectorId) {
      nexusError(NEXUS_ERROR_CODES.TASK_NOT_CLAIMED, "Task is not currently claimed");
    }
    if (task.claimedByConnectorId !== args.connectorId) {
      nexusError(NEXUS_ERROR_CODES.WRONG_CONNECTOR, "Task is claimed by a different Connector");
    }
    if (task.leaseId !== args.leaseId) {
      nexusError(NEXUS_ERROR_CODES.WRONG_LEASE, "Lease id does not match the current claim");
    }
    if (task.leaseExpiresAt === undefined || task.leaseExpiresAt < args.now) {
      nexusError(NEXUS_ERROR_CODES.LEASE_EXPIRED, "Lease has expired");
    }
    if (task.status === "cancel_requested" || task.status === "cancelled") {
      nexusError(NEXUS_ERROR_CODES.CANCELLATION_REQUESTED, "Task cancellation prevents download");
    }
    if (!ACTIVE_DOWNLOAD_STATUSES.includes(task.status)) {
      nexusError(NEXUS_ERROR_CODES.TASK_NOT_CLAIMED, "Task is not in a downloadable state");
    }

    const attachment = await ctx.db
      .query("nexusTaskAttachments")
      .withIndex("by_attachment_id", (q) => q.eq("attachmentId", args.attachmentId))
      .unique();
    if (!attachment || attachment.taskId !== task._id) {
      nexusError(NEXUS_ERROR_CODES.ATTACHMENT_NOT_BOUND, "Attachment is not bound to this task");
    }
    if (
      task.libraryDocumentVersionId &&
      attachment.documentVersionId !== task.libraryDocumentVersionId
    ) {
      nexusError(NEXUS_ERROR_CODES.ATTACHMENT_VERSION_MISMATCH, "Attachment version mismatch");
    }

    if (attachment.byteLength > LIBRARY_MAX_UPLOAD_BYTES) {
      nexusError(NEXUS_ERROR_CODES.ATTACHMENT_TOO_LARGE, "Attachment exceeds the maximum size");
    }

    return {
      storageId: attachment.storageId,
      attachmentId: attachment.attachmentId,
      documentVersionId: attachment.documentVersionId,
      contentType: attachment.contentType,
      displayFilename: attachment.displayFilename,
      byteLength: attachment.byteLength,
      sha256: attachment.sha256,
      ownerClerkUserId: attachment.ownerClerkUserId,
    };
  },
});

/** Privacy-safe attachment route diagnostics (Convex log stream only). */
export function logAttachmentDownloadDiagnostic(event: {
  requestId: string;
  stage: string;
  taskId?: string;
  attachmentId?: string;
  connectorId?: string;
  httpStatus?: number;
  errorCode?: string;
  expectedByteLength?: number;
  storageMetadataSize?: number;
  bytesSent?: number;
  durationMs?: number;
}): void {
  console.log(
    JSON.stringify({
      kind: "nexus_attachment_download",
      ...event,
    }),
  );
}

export function attachmentSuccessHeaders(
  info: {
    attachmentId: string;
    documentVersionId: Id<"nexusLibraryDocumentVersions">;
    contentType: string;
    displayFilename: string;
    byteLength: number;
    sha256: string;
    requestId: string;
  },
): Record<string, string> {
  const safeType = info.contentType || "application/octet-stream";
  return {
    "Content-Type": safeType,
    "Content-Length": String(info.byteLength),
    "Content-Disposition": contentDispositionAttachment(
      sanitizeDisplayFilename(info.displayFilename),
    ),
    "X-Nexus-Protocol-Version": LIBRARY_ATTACHMENT_PROTOCOL_VERSION,
    "X-Nexus-Attachment-Id": info.attachmentId,
    "X-Nexus-Document-Version-Id": info.documentVersionId,
    "X-Nexus-Content-Sha256": info.sha256,
    "X-Nexus-Request-Id": info.requestId,
  };
}
