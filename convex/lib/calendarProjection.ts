import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { clampLength, P5_LIMITS } from "./p5config";
import type { TaskStatus } from "./taskStatus";

export type CalendarEventStatus =
  | "scheduled"
  | "due"
  | "dispatching"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "needs_review"
  | "cancelled"
  | "deleted";

const MEMBERSHIP_UNCERTAIN_ERROR_CODE = "execution_state_uncertain";

function isMembershipFullSyncTask(
  task: Pick<Doc<"nexusTasks">, "taskKind" | "taskMetadata">,
): boolean {
  return (
    task.taskKind === "membership_full_sync" ||
    task.taskMetadata?.kind === "membership_full_sync"
  );
}

export function mapTaskStatusToCalendarEvent(
  taskStatus: TaskStatus,
  task?: Pick<Doc<"nexusTasks">, "errorCode" | "taskKind" | "taskMetadata">,
): CalendarEventStatus {
  if (
    taskStatus === "failed" &&
    task?.errorCode === MEMBERSHIP_UNCERTAIN_ERROR_CODE &&
    task &&
    isMembershipFullSyncTask(task)
  ) {
    return "needs_review";
  }
  switch (taskStatus) {
    case "queued":
      return "queued";
    case "claimed":
    case "running":
    case "cancel_requested":
      return "running";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    default:
      return "queued";
  }
}

export async function projectScheduledEventFromTask(
  ctx: MutationCtx,
  event: Doc<"nexusScheduledEvents">,
  task: Doc<"nexusTasks">,
  progressMessage?: string,
): Promise<void> {
  if (event.linkedTaskId && event.linkedTaskId !== task._id) return;

  const now = Date.now();
  const scheduleStatus = mapTaskStatusToCalendarEvent(task.status, task);
  const patch: Partial<Doc<"nexusScheduledEvents">> = {
    scheduleStatus,
    updatedAt: now,
    queueSequence: task.queueSequence,
    progressMessage: progressMessage
      ? clampLength(progressMessage, P5_LIMITS.maxProgressMessageLength)
      : event.progressMessage,
    queuedAt: task.queuedAt ?? event.queuedAt,
    claimedAt: task.claimedAt ?? event.claimedAt,
    startedAt: task.startedAt ?? event.startedAt,
    completedAt: task.completedAt ?? event.completedAt,
    failedAt: task.failedAt ?? event.failedAt,
    cancelledAt: task.cancelledAt ?? event.cancelledAt,
    terminalResultSummary: task.resultSummary ?? event.terminalResultSummary,
    terminalErrorCode: task.errorCode ?? event.terminalErrorCode,
    terminalUserSafeMessage: task.errorMessage ?? event.terminalUserSafeMessage,
  };
  await ctx.db.patch(event._id, patch);
}

export function isCalendarEventEditable(event: Doc<"nexusScheduledEvents">): boolean {
  if (event.deletedAt || event.hiddenFromCalendar) return false;
  if (event.linkedTaskId) return false;
  return ["scheduled", "due", "dispatching"].includes(event.scheduleStatus);
}

export function isCalendarEventDeletable(event: Doc<"nexusScheduledEvents">): boolean {
  if (event.deletedAt || event.hiddenFromCalendar) return false;
  if (
    event.linkedTaskId &&
    ["queued", "running", "dispatching"].includes(event.scheduleStatus)
  ) {
    return false;
  }
  return true;
}

export async function patchScheduledEventForTaskStatus(
  ctx: MutationCtx,
  task: Doc<"nexusTasks">,
  progressMessage?: string,
): Promise<void> {
  if (!task.scheduledEventId) return;
  const event = await ctx.db.get(task.scheduledEventId);
  if (!event || event.deletedAt) return;
  await projectScheduledEventFromTask(ctx, event, task, progressMessage);
}

export async function findScheduledEventByTask(
  ctx: MutationCtx,
  taskId: Id<"nexusTasks">,
): Promise<Doc<"nexusScheduledEvents"> | null> {
  return await ctx.db
    .query("nexusScheduledEvents")
    .withIndex("by_linked_task", (q) => q.eq("linkedTaskId", taskId))
    .unique();
}
