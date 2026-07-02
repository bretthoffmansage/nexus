import type { AdapterReadResult, ToolAdapterMeta } from "@/lib/adapters/types";

export const calendarAdapterMeta: ToolAdapterMeta = {
  toolId: "calendar",
  availability: "available",
  authority: "convex",
  futureConvexCollection: "nexusScheduledEvents",
};

export type CalendarView = "month" | "week" | "agenda";

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end?: string;
};

/** Legacy adapter stubs — calendar data is served from Convex scheduled events. */
export async function listCalendars(): Promise<
  AdapterReadResult<{ href: string; name: string; color?: string }[]>
> {
  return { ok: true, availability: "available", data: [{ href: "nexus", name: "My schedule" }] };
}

export async function listEvents(view: CalendarView): Promise<AdapterReadResult<CalendarEvent[]>> {
  void view;
  return { ok: true, availability: "available", data: [] };
}
