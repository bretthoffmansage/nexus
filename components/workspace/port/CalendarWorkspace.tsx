"use client";

import { useMemo, useState } from "react";
import { ToolAvailabilityBanner } from "@/components/workspace/ToolAvailabilityBanner";
import { calendarAdapterMeta, type CalendarView } from "@/lib/adapters/calendar/adapter";

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

function buildMonthCells(date: Date): Array<{ day: number | null; key: string }> {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ day: number | null; key: string }> = [];
  for (let i = 0; i < firstDay; i += 1) {
    cells.push({ day: null, key: `pad-${i}` });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ day, key: `day-${day}` });
  }
  return cells;
}

/** Ported from legacy_local_console/static/js/calendar.js toolbar and grid layout. */
export function CalendarWorkspace() {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [view, setView] = useState<CalendarView>("month");
  const disconnected = calendarAdapterMeta.availability !== "available";

  const cells = useMemo(() => buildMonthCells(currentDate), [currentDate]);

  return (
    <section className="legacy-port-workspace legacy-port-calendar" aria-labelledby="cal-heading">
      <ToolAvailabilityBanner availability={calendarAdapterMeta.availability} />
      <header className="legacy-port-head">
        <h1 id="cal-heading">Calendar</h1>
        <p className="legacy-port-subhead">Events, reminders, and CalDAV sync</p>
      </header>

      <div className="cal-toolbar">
        <div className="cal-toolbar-nav">
          <button
            type="button"
            className="cal-nav"
            disabled={disconnected}
            aria-label="Previous"
            onClick={() =>
              setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
            }
          >
            ←
          </button>
          <button
            type="button"
            className="cal-nav cal-today-btn"
            disabled={disconnected}
            onClick={() => setCurrentDate(new Date())}
          >
            Today
          </button>
          <span className="cal-title">
            {view === "agenda"
              ? "Upcoming"
              : `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`}
          </span>
          <button
            type="button"
            className="cal-nav"
            disabled={disconnected}
            aria-label="Next"
            onClick={() =>
              setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
            }
          >
            →
          </button>
        </div>
        <div className="cal-toolbar-right">
          <div className="cal-view-toggle" role="tablist" aria-label="Calendar view">
            {(["month", "week", "agenda"] as CalendarView[]).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                className={`cal-view-btn${view === v ? " active" : ""}`}
                onClick={() => setView(v)}
              >
                {v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          <button type="button" className="cal-nav" disabled title="Calendar settings">
            ⚙
          </button>
          <button type="button" className="cal-nav" disabled title="Refresh from database">
            ↻
          </button>
          <button type="button" className="cal-add-btn cal-add-btn-text" disabled id="cal-add">
            <span className="cal-add-plus">+</span>
            <span className="cal-add-label">New</span>
          </button>
        </div>
      </div>

      <div className="cal-quickadd-row" id="cal-quickadd-row">
        <input
          id="cal-quickadd"
          className="cal-quickadd-input"
          placeholder="Quick add event…"
          disabled
          aria-disabled="true"
        />
        <span className="cal-quickadd-hint" aria-hidden="true">
          <span className="qa-hint-accent">Quick add</span> — return home to Ithaca 1pm tmrw
        </span>
      </div>

      {view === "month" ? (
        <div className="cal-month-grid" role="grid" aria-label="Month view">
          {WEEKDAYS.map((label) => (
            <div key={label} className="cal-dow" role="columnheader">
              {label}
            </div>
          ))}
          {cells.map((cell) => (
            <div
              key={cell.key}
              className={`cal-day-cell${cell.day ? "" : " cal-day-cell--pad"}`}
              role="gridcell"
            >
              {cell.day ? <span className="cal-day-num">{cell.day}</span> : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="cal-empty-state">
          <div className="cal-empty-title">
            {view === "week" ? "Week view" : "Agenda"}
          </div>
          <div className="cal-empty-msg">
            Calendar data requires the Console Connector. View switching is preserved; events load
            from Claudia when connected.
          </div>
        </div>
      )}

      <div className="cal-empty-state" style={{ marginTop: "1rem" }}>
        <div className="cal-empty-title">No calendars yet</div>
        <div className="cal-empty-msg">
          Create a local calendar, import an .ics file, or sync via CalDAV — available on Claudia
          through the Connector.
        </div>
        <div className="cal-empty-actions">
          <button type="button" className="cal-btn cal-btn-primary" disabled>
            Open Settings
          </button>
          <button type="button" className="cal-btn" disabled>
            New calendar
          </button>
          <button type="button" className="cal-btn" disabled>
            Import .ics
          </button>
        </div>
      </div>
    </section>
  );
}
