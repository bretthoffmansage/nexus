import type { AdapterReadResult, ToolAdapterMeta } from "@/lib/adapters/types";

export const calendarAdapterMeta: ToolAdapterMeta = {
  toolId: "calendar",
  availability: "connector_required",
  authority: "claudia_connector",
  futureConvexCollection: "calendarEvents",
  futureClaudiaTaskKind: "calendar.sync",
};

export type CalendarView = "month" | "week" | "agenda";

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end?: string;
  calendarHref?: string;
};

export async function listCalendars(): Promise<
  AdapterReadResult<{ href: string; name: string; color?: string }[]>
> {
  return {
    ok: false,
    availability: "connector_required",
    reason: "Calendar data requires the Console Connector and Claudia local calendar store.",
    data: [],
  };
}

export async function listEvents(view: CalendarView): Promise<AdapterReadResult<CalendarEvent[]>> {
  void view;
  return {
    ok: false,
    availability: "connector_required",
    reason: "Events are loaded from Claudia through the Console Connector.",
    data: [],
  };
}
