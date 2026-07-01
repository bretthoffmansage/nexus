import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { clampLength, P5_LIMITS } from "./p5config";
import { appendProgress, touchConversation } from "./p5writes";
import { assertTransition, type TaskStatus } from "./taskStatus";

/**
 * Shared task-transition logic. Extracted so the P5 `internalMutation`
 * (`tasks.transitionTaskInternal`, preserved unchanged for the existing
 * worker-mutation surface and test fixtures) and the P6 Connector protocol
 * mutations (`connectorTasks.ts`) drive the exact same state machine and
 * side effects within their own single transaction — Convex mutations
 * cannot call other mutations, so logic reuse across mutations means a
 * plain, `ctx`-taking function like this one, not a second Convex function.
 */

const PROGRESS_EVENT_BY_STATUS: Record<TaskStatus, Doc<"nexusTaskProgressEvents">["eventType"]> = {
  queued: "task_queued",
  cancel_requested: "cancel_requested",
  cancelled: "task_cancelled",
  claimed: "task_claimed",
  running: "task_started",
  completed: "task_completed",
  failed: "task_failed",
};

/** These target states always clear any Connector lease: the three terminal
 * states (a task is never left claimed once it can no longer be worked), and
 * `queued` (stale-lease recovery requeues a task — by definition the old
 * lease is gone). */
const LEASE_CLEARING_STATUSES: readonly TaskStatus[] = ["completed", "failed", "cancelled", "queued"];

export type PerformTaskTransitionArgs = {
  taskId: Id<"nexusTasks">;
  toStatus: TaskStatus;
  resultSummary?: string;
  errorCode?: string;
  errorMessage?: string;
  progressMessage?: string;
  /** Present only when a Connector API caller is performing this transition. */
  clearLeaseOnTerminal?: boolean;
};

export async function performTaskTransition(
  ctx: MutationCtx,
  args: PerformTaskTransitionArgs,
): Promise<{ taskId: Id<"nexusTasks">; status: TaskStatus }> {
  const task = await ctx.db.get(args.taskId);
  if (!task) throw new Error("task_not_found");
  assertTransition(task.status, args.toStatus);

  const now = Date.now();
  const patch: Partial<Doc<"nexusTasks">> = { status: args.toStatus, updatedAt: now };
  if (args.resultSummary !== undefined) {
    patch.resultSummary = clampLength(args.resultSummary, P5_LIMITS.maxResultSummaryLength);
  }
  if (args.errorCode !== undefined) patch.errorCode = args.errorCode;
  if (args.errorMessage !== undefined) {
    patch.errorMessage = clampLength(args.errorMessage, P5_LIMITS.maxErrorMessageLength);
  }

  switch (args.toStatus) {
    case "claimed":
      patch.claimedAt = now;
      break;
    case "running":
      patch.startedAt = now;
      break;
    case "completed":
      patch.completedAt = now;
      break;
    case "failed":
      patch.failedAt = now;
      break;
    case "cancel_requested":
      patch.cancellationRequestedAt = now;
      break;
    case "cancelled":
      patch.cancelledAt = now;
      break;
    default:
      break;
  }

  if (LEASE_CLEARING_STATUSES.includes(args.toStatus)) {
    // Always release the active lease so no Connector can keep acting on it.
    patch.leaseId = undefined;
    patch.leaseExpiresAt = undefined;
    patch.lastLeaseHeartbeatAt = undefined;
    // A requeue (stale-lease recovery) fully unclaims the task. Terminal
    // states instead KEEP `claimedByConnectorId` as the record of which
    // Connector finished it — used for completion/failure idempotency and
    // audit. It is an internal field, never surfaced in a user projection.
    if (args.toStatus === "queued") {
      patch.claimedByConnectorId = undefined;
    }
  }

  await ctx.db.patch(args.taskId, patch);
  await appendProgress(ctx, {
    taskId: args.taskId,
    ownerClerkUserId: task.ownerClerkUserId,
    eventType: PROGRESS_EVENT_BY_STATUS[args.toStatus],
    message: args.progressMessage,
    now,
  });
  await touchConversation(ctx, task.conversationId, { now });
  return { taskId: args.taskId, status: args.toStatus };
}
