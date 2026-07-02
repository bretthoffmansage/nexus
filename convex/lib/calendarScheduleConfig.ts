import { P5_LIMITS } from "./p5config";

/** Nexus Calendar scheduled-task dispatch — scheduler cadence and limits only. */
export const CALENDAR_SCHEDULE = {
  /** Recurring dispatcher interval (see convex/crons.ts). */
  schedulerIntervalMinutes: 5,
  schedulerIntervalSeconds: 5 * 60,
  /** Maximum due events dispatched per scheduler pass. */
  maxDispatchPerRun: 25,
  /** Maximum events reconciled per pass. */
  maxReconcilePerRun: 50,
  /** Stale dispatching claim recovery after this many ms. */
  dispatchClaimTimeoutMs: 5 * 60 * 1000,
  maxTitleLength: 200,
  maxDescriptionLength: 1_000,
  maxTaskRequestLength: P5_LIMITS.maxRequestLength,
  /** Normal dispatch precision bound (one scheduler interval; see spec). */
  schedulingPrecisionMs: 5 * 60 * 1000,
} as const;

export function scheduledEventIdempotencyKey(eventId: string): string {
  return `schedule:${eventId}`;
}
