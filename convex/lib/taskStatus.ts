import { v } from "convex/values";
import { NEXUS_ERROR_CODES, nexusError } from "./errors";

/**
 * Centralized task status lifecycle. Status strings must never be scattered
 * through UI and Convex code — import from here.
 *
 * P5 user-reachable states are only `queued` and the terminal user actions
 * (`cancelled`). The worker states (`claimed`, `running`, `completed`,
 * `failed`, `cancel_requested`) are reserved for the future Console Connector
 * (P6+) and are defined now so the transition validator already understands
 * them. The browser may never drive a reserved worker transition.
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
 * P5 cancellation policy: a `queued` task may go directly to `cancelled`
 * (no worker holds it). A future claimed/running task will instead move to
 * `cancel_requested` and the worker finalizes it to `cancelled`.
 */
const ALLOWED_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  queued: ["claimed", "cancel_requested", "cancelled"],
  cancel_requested: ["cancelled"],
  claimed: ["running", "cancel_requested"],
  running: ["completed", "failed", "cancel_requested"],
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

/** Statuses a user may cancel directly in P5 (no worker holds the task). */
export const USER_CANCELLABLE_STATUSES: readonly TaskStatus[] = ["queued"];

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
