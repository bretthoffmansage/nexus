import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { clampLength, P5_LIMITS } from "./p5config";
import type { TaskStatus } from "./taskStatus";

export type LibraryProcessingStatus =
  | "uploaded"
  | "queued"
  | "processing"
  | "processed"
  | "needs_review"
  | "failed"
  | "unsupported"
  | "archived";

export type DropzoneProcessingDisposition =
  | "processed"
  | "needs_review"
  | "failed"
  | "blocked"
  | "paused"
  | "already_completed";

export type DropzoneTerminalResult = {
  processingDisposition: DropzoneProcessingDisposition;
  userSafeMessage: string;
  notesCreated?: number;
  vaultLocatorCount?: number;
  warnings?: string[];
  retryable?: boolean;
  partial?: boolean;
};

export function mapTaskStatusToLibraryProcessing(
  taskStatus: TaskStatus,
  current: LibraryProcessingStatus,
): LibraryProcessingStatus {
  switch (taskStatus) {
    case "queued":
      return "queued";
    case "claimed":
    case "running":
    case "cancel_requested":
      return "processing";
    case "completed":
      return current === "needs_review" ? "needs_review" : "processed";
    case "failed":
      return "failed";
    case "cancelled":
      return current === "processed" || current === "needs_review" ? current : "uploaded";
    default:
      return current;
  }
}

export function mapDispositionToLibraryStatus(
  disposition: DropzoneProcessingDisposition,
): LibraryProcessingStatus {
  switch (disposition) {
    case "processed":
    case "already_completed":
      return "processed";
    case "needs_review":
      return "needs_review";
    case "failed":
      return "failed";
    case "blocked":
    case "paused":
      return "needs_review";
    default:
      return "failed";
  }
}

export async function patchLibraryVersionForTaskStatus(
  ctx: MutationCtx,
  task: Doc<"nexusTasks">,
  taskStatus: TaskStatus,
  progressMessage?: string,
): Promise<void> {
  if (!task.libraryDocumentVersionId) return;
  const version = await ctx.db.get(task.libraryDocumentVersionId);
  if (!version || version.ownerClerkUserId !== task.ownerClerkUserId) return;

  const nextStatus = mapTaskStatusToLibraryProcessing(taskStatus, version.processingStatus);
  const patch: Partial<Doc<"nexusLibraryDocumentVersions">> = {
    processingStatus: nextStatus,
    updatedAt: Date.now(),
  };
  if (progressMessage) {
    patch.progressMessage = clampLength(progressMessage, P5_LIMITS.maxProgressMessageLength);
  }
  if (taskStatus === "queued") {
    patch.activeTaskId = task._id;
  }
  if (["completed", "failed", "cancelled"].includes(taskStatus)) {
    patch.activeTaskId = undefined;
    patch.lastTaskId = task._id;
  }
  await ctx.db.patch(version._id, patch);
}

export async function applyDropzoneTerminalResult(
  ctx: MutationCtx,
  task: Doc<"nexusTasks">,
  result: DropzoneTerminalResult,
): Promise<void> {
  if (!task.libraryDocumentVersionId) return;
  const version = await ctx.db.get(task.libraryDocumentVersionId);
  if (!version || version.ownerClerkUserId !== task.ownerClerkUserId) return;
  if (version.activeTaskId && version.activeTaskId !== task._id && version.lastTaskId !== task._id) {
    return;
  }

  const now = Date.now();
  const status = mapDispositionToLibraryStatus(result.processingDisposition);
  await ctx.db.patch(version._id, {
    processingStatus: status,
    // The in-flight progress line is superseded by the terminal outcome;
    // leaving it set keeps the card painted at its last stage (e.g.
    // "Analyzing document") even though the run already ended.
    progressMessage: undefined,
    terminalSummary: clampLength(result.userSafeMessage, P5_LIMITS.maxResultSummaryLength),
    notesCreatedCount: result.notesCreated,
    vaultLocatorCount: result.vaultLocatorCount,
    terminalDisposition: result.processingDisposition,
    terminalRetryable: result.retryable,
    terminalPartial: result.partial,
    terminalWarnings: result.warnings?.slice(0, 8).map((w) =>
      clampLength(w, 300),
    ),
    activeTaskId: undefined,
    lastTaskId: task._id,
    updatedAt: now,
  });
}

export async function clearLibraryVersionActiveTask(
  ctx: MutationCtx,
  versionId: Id<"nexusLibraryDocumentVersions">,
  taskId: Id<"nexusTasks">,
): Promise<void> {
  const version = await ctx.db.get(versionId);
  if (!version || version.activeTaskId !== taskId) return;
  await ctx.db.patch(versionId, { activeTaskId: undefined, updatedAt: Date.now() });
}
