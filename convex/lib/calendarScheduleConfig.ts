import {
  CALENDAR_DEFAULT_SCHEDULED_TOOL_ID,
  CALENDAR_SCHEDULED_TOOL_IDS,
  isCalendarScheduledToolId,
} from "./calendarScheduledTools";
import { P5_LIMITS } from "./p5config";

/** Nexus Calendar scheduled-task dispatch — single configuration surface. */
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
  /** Tools users may schedule (see `calendarScheduledTools.ts`). */
  allowedScheduledToolIds: CALENDAR_SCHEDULED_TOOL_IDS,
  defaultToolId: CALENDAR_DEFAULT_SCHEDULED_TOOL_ID,
  /** Normal dispatch precision bound (one scheduler interval; see spec). */
  schedulingPrecisionMs: 5 * 60 * 1000,
} as const;

export type CalendarAllowedToolId = (typeof CALENDAR_SCHEDULE.allowedScheduledToolIds)[number];

export function isAllowedScheduledToolId(value: string): value is CalendarAllowedToolId {
  return isCalendarScheduledToolId(value);
}

export function scheduledEventIdempotencyKey(eventId: string): string {
  return `schedule:${eventId}`;
}
