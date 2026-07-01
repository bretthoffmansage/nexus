import { P5_LIMITS, P5_SUPPORTED_TOOL_IDS } from "./p5config";

/** Nexus Calendar scheduled-task dispatch — single configuration surface. */
export const CALENDAR_SCHEDULE = {
  /** Recurring dispatcher interval (see convex/crons.ts). */
  schedulerIntervalSeconds: 60,
  /** Maximum due events dispatched per scheduler pass. */
  maxDispatchPerRun: 25,
  /** Maximum events reconciled per pass. */
  maxReconcilePerRun: 50,
  /** Stale dispatching claim recovery after this many ms. */
  dispatchClaimTimeoutMs: 5 * 60 * 1000,
  maxTitleLength: 200,
  maxDescriptionLength: 1_000,
  maxTaskRequestLength: P5_LIMITS.maxRequestLength,
  /** Tools users may schedule explicitly (read-only P5 tools only in v1). */
  allowedScheduledToolIds: [...P5_SUPPORTED_TOOL_IDS] as const,
  defaultToolId: P5_SUPPORTED_TOOL_IDS[0],
  /** Minute-level scheduling precision (see spec). */
  schedulingPrecisionMs: 60 * 1000,
} as const;

export type CalendarAllowedToolId = (typeof CALENDAR_SCHEDULE.allowedScheduledToolIds)[number];

export function isAllowedScheduledToolId(value: string): value is CalendarAllowedToolId {
  return (CALENDAR_SCHEDULE.allowedScheduledToolIds as readonly string[]).includes(value);
}

export function scheduledEventIdempotencyKey(eventId: string): string {
  return `schedule:${eventId}`;
}
