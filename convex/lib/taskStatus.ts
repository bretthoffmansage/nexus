import { v } from "convex/values";
import { NEXUS_ERROR_CODES, nexusError } from "./errors";

/**
 * Centralized task status lifecycle. Status strings must never be scattered
 * through UI and Convex code — import from here.
 *
 * P5 user-reachable states were only `queued` and `cancelled`. P6 activates
 * the worker states (`claimed`, `running`, `completed`, `failed`,
 * `cancel_requested`) for the trusted Connector protocol — the browser still
 * may never drive one of these transitions directly (see
 * `convex/lib/connectorAuth.ts` and `convex/connectorTasks.ts`).
 */
export const TASK_STATUSES = [
  "queued",
  "cancel_requested",
  "cancelled",
  "claimed",
  "running",
  "completed",
  "failed",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const taskStatusValidator = v.union(
  v.literal("queued"),
  v.literal("cancel_requested"),
  v.literal("cancelled"),
  v.literal("claimed"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
);

/**
 * Allowed forward transitions. Terminal states have no outgoing edges.
 *
 * Cancellation policy: a `queued` task may go directly to `cancelled` (no
 * worker holds it). A claimed/running task instead moves to
 * `cancel_requested`, and only the Connector holding the lease (or P6's
 * stale-lease recovery policy) finalizes it to `cancelled`.
 *
 * `claimed -> failed` (P6): a Connector may fail a task before ever calling
 * `start` (e.g. the tool becomes unavailable immediately after claim), so
 * failure must be reachable without fabricating a `running` transition that
 * never actually happened.
 *
 * `claimed|running -> queued` (P6, system-only): stale-lease recovery
 * requeues a task abandoned by a Connector that stopped heartbeating. Never
 * client- or Connector-triggered — only `convex/connectorTasks.ts`'s
 * recovery path drives this edge.
 */
const ALLOWED_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  queued: ["claimed", "cancel_requested", "cancelled"],
  cancel_requested: ["cancelled"],
  claimed: ["running", "cancel_requested", "failed", "queued"],
  running: ["completed", "failed", "cancel_requested", "queued"],
  cancelled: [],
  completed: [],
  failed: [],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: TaskStatus, to: TaskStatus): void {
  if (!canTransition(from, to)) {
    nexusError(
      NEXUS_ERROR_CODES.INVALID_TASK_STATE,
      `Invalid task transition from ${from} to ${to}`,
    );
  }
}

/** Statuses a user may cancel directly, immediately, to `cancelled` (no
 * Connector holds the task yet). */
export const USER_CANCELLABLE_STATUSES: readonly TaskStatus[] = ["queued"];

/** Statuses a user may request cancellation of (P6): a Connector already
 * holds the lease, so the task moves to `cancel_requested` and the Connector
 * (or stale-lease recovery) finalizes it. */
export const USER_CANCEL_REQUESTABLE_STATUSES: readonly TaskStatus[] = ["claimed", "running"];

/** Statuses that count as "already cancelling/cancelled" for idempotency. */
export const CANCELLATION_TERMINAL_OR_PENDING: readonly TaskStatus[] = [
  "cancel_requested",
  "cancelled",
];

/** Statuses a user may retry (creates a NEW task; never mutates the old one). */
export const RETRYABLE_STATUSES: readonly TaskStatus[] = ["failed", "cancelled"];

/**
 * Statuses eligible for the global queue ordering / future claim. Only honestly
 * waiting work counts; cancelled/terminal tasks are excluded from ordering.
 */
export const QUEUE_ELIGIBLE_STATUSES: readonly TaskStatus[] = ["queued"];

export function isQueueEligible(status: TaskStatus): boolean {
  return QUEUE_ELIGIBLE_STATUSES.includes(status);
}

export function isRetryable(status: TaskStatus): boolean {
  return RETRYABLE_STATUSES.includes(status);
}

export function isUserCancellable(status: TaskStatus): boolean {
  return USER_CANCELLABLE_STATUSES.includes(status);
}

export function isUserCancelRequestable(status: TaskStatus): boolean {
  return USER_CANCEL_REQUESTABLE_STATUSES.includes(status);
}
