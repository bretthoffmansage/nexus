"use client";

import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import {
  CalendarEventDialog,
  type CalendarDialogMode,
} from "@/components/workspace/port/CalendarEventDialog";
import {
  calendarStatusIcon,
  monthDateRange,
  nexusCalendar,
  type CalendarEventStatus,
} from "@/lib/nexus/calendarClient";
import { formatLocalDateInput } from "@/lib/nexus/calendarTimezone";
import { useNexusAuthReadiness } from "@/lib/nexus/useNexusAuthReadiness";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function buildMonthCells(date: Date): Array<{ day: number | null; key: string; localDate?: string }> {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ day: number | null; key: string; localDate?: string }> = [];
  for (let i = 0; i < firstDay; i += 1) {
    cells.push({ day: null, key: `pad-${i}` });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const localDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push({ day, key: `day-${day}`, localDate });
  }
  return cells;
}

/** Nexus Calendar — persistent per-user scheduled tasks. */
export function CalendarWorkspace() {
  const { isLoading, isAuthenticated, readyForPrivateQueries: ready } = useNexusAuthReadiness();
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [dialog, setDialog] = useState<CalendarDialogMode>({ kind: "closed" });

  const range = monthDateRange(currentDate.getFullYear(), currentDate.getMonth());
  const events = useQuery(
    nexusCalendar.listEventsForRange,
    ready ? { startDate: range.startDate, endDate: range.endDate } : "skip",
  );

  const cells = useMemo(() => buildMonthCells(currentDate), [currentDate]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, NonNullable<typeof events>>();
    for (const event of events ?? []) {
      const list = map.get(event.localScheduledDate) ?? [];
      list.push(event);
      map.set(event.localScheduledDate, list);
    }
    return map;
  }, [events]);

  const openCreate = (localDate: string) => {
    if (!ready) return;
    setDialog({ kind: "create", localDate });
  };

  const openView = (eventId: Id<"nexusScheduledEvents">) => {
    setDialog({ kind: "view", eventId });
  };

  if (isLoading) {
    return <section className="legacy-port-workspace legacy-port-calendar">Loading…</section>;
  }

  if (!isAuthenticated) {
    return (
      <section className="legacy-port-workspace legacy-port-calendar">
        <p>Sign in to use your private Nexus calendar.</p>
      </section>
    );
  }

  return (
    <section className="legacy-port-workspace legacy-port-calendar" aria-labelledby="cal-heading">
      <header className="legacy-port-head">
        <h1 id="cal-heading">Calendar</h1>
        <p className="legacy-port-subhead">Schedule one-time Nexus tasks on your private calendar</p>
      </header>

      <div className="cal-toolbar">
        <div className="cal-toolbar-nav">
          <button
            type="button"
            className="cal-nav"
            aria-label="Previous month"
            onClick={() =>
              setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
            }
          >
            ←
          </button>
          <button
            type="button"
            className="cal-nav cal-today-btn"
            onClick={() => setCurrentDate(new Date())}
          >
            Today
          </button>
          <span className="cal-title">
            {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
          </span>
          <button
            type="button"
            className="cal-nav"
            aria-label="Next month"
            onClick={() =>
              setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
            }
          >
            →
          </button>
        </div>
        <div className="cal-toolbar-right">
          <button
            type="button"
            className="cal-add-btn cal-add-btn-text"
            id="cal-add"
            disabled={!ready}
            onClick={() => openCreate(formatLocalDateInput(new Date()))}
          >
            <span className="cal-add-plus">+</span>
            <span className="cal-add-label">New</span>
          </button>
        </div>
      </div>

      <div className="cal-quickadd-row" id="cal-quickadd-row">
        <button
          type="button"
          className="cal-quickadd-input cal-quickadd-trigger"
          disabled={!ready}
          onClick={() => openCreate(formatLocalDateInput(new Date()))}
        >
          Schedule a task…
        </button>
      </div>

      <div className="cal-month-grid" role="grid" aria-label="Month view">
        {WEEKDAYS.map((label) => (
          <div key={label} className="cal-dow" role="columnheader">
            {label}
          </div>
        ))}
        {cells.map((cell) => {
          const dayEvents = cell.localDate ? eventsByDate.get(cell.localDate) ?? [] : [];
          return (
            <div
              key={cell.key}
              className={`cal-day-cell${cell.day ? "" : " cal-day-cell--pad"}`}
              role="gridcell"
              onClick={() => cell.localDate && openCreate(cell.localDate)}
              onKeyDown={(e) => {
                if (cell.localDate && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  openCreate(cell.localDate);
                }
              }}
              tabIndex={cell.day ? 0 : -1}
            >
              {cell.day ? <span className="cal-day-num">{cell.day}</span> : null}
              {dayEvents.length > 0 ? (
                <ul className="cal-day-events">
                  {dayEvents.slice(0, 3).map((event) => (
                    <li key={event.id}>
                      <button
                        type="button"
                        className={`cal-event-chip cal-event-chip--${event.scheduleStatus}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          openView(event.id);
                        }}
                      >
                        <span className="cal-event-icon" aria-hidden="true">
                          {calendarStatusIcon(event.scheduleStatus as CalendarEventStatus)}
                        </span>
                        <span className="cal-event-title">{event.title}</span>
                      </button>
                    </li>
                  ))}
                  {dayEvents.length > 3 ? (
                    <li className="cal-event-more">+{dayEvents.length - 3} more</li>
                  ) : null}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>

      <CalendarEventDialog
        mode={dialog}
        ready={ready}
        onClose={() => setDialog({ kind: "closed" })}
        onEdit={(eventId) => setDialog({ kind: "edit", eventId })}
      />
    </section>
  );
}
