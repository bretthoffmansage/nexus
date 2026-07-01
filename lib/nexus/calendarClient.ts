import { api } from "@/convex/_generated/api";

/** Client boundary for Nexus Calendar scheduled tasks. */
export const nexusCalendar = {
  listEventsForRange: api.scheduledEvents.listMyScheduledEventsForRange,
  getEvent: api.scheduledEvents.getMyScheduledEvent,
  getEventResult: api.scheduledEvents.getMyScheduledEventTaskResult,
  createEvent: api.scheduledEvents.createMyScheduledEvent,
  updateEvent: api.scheduledEvents.updateMyScheduledEvent,
  deleteEvent: api.scheduledEvents.deleteMyScheduledEvent,
  listAllowedTools: api.scheduledEvents.listAllowedScheduledTools,
} as const;

export type CalendarEventStatus =
  | "scheduled"
  | "due"
  | "dispatching"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "deleted";

export function calendarStatusLabel(status: CalendarEventStatus): string {
  switch (status) {
    case "scheduled":
      return "Scheduled";
    case "due":
      return "Due";
    case "dispatching":
      return "Dispatching";
    case "queued":
      return "Queued";
    case "running":
      return "Running";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    case "deleted":
      return "Deleted";
    default:
      return status;
  }
}

export function calendarStatusIcon(status: CalendarEventStatus): string {
  switch (status) {
    case "scheduled":
      return "🕐";
    case "due":
      return "⏳";
    case "dispatching":
    case "queued":
      return "📋";
    case "running":
      return "▶";
    case "completed":
      return "✓";
    case "failed":
      return "⚠";
    case "cancelled":
      return "⊘";
    default:
      return "•";
  }
}

export function monthDateRange(year: number, monthIndex: number): {
  startDate: string;
  endDate: string;
} {
  const month = String(monthIndex + 1).padStart(2, "0");
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return {
    startDate: `${year}-${month}-01`,
    endDate: `${year}-${month}-${String(lastDay).padStart(2, "0")}`,
  };
}
