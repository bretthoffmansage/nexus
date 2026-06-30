"use client";

import { ToolAvailabilityBanner } from "@/components/workspace/ToolAvailabilityBanner";
import { tasksAdapterMeta } from "@/lib/adapters/tasks/adapter";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Ported from legacy_local_console/static/js/tasks.js scheduled task UI shell. */
export function TasksWorkspace() {
  return (
    <section className="legacy-port-workspace legacy-port-tasks" aria-labelledby="tasks-heading">
      <ToolAvailabilityBanner availability={tasksAdapterMeta.availability} />
      <header className="legacy-port-head legacy-port-head--split">
        <div>
          <h1 id="tasks-heading">Tasks</h1>
          <p className="legacy-port-subhead">Scheduled recurring prompts and run history</p>
        </div>
        <button type="button" className="legacy-port-btn legacy-port-btn-primary" disabled>
          New task
        </button>
      </header>

      <div className="tasks-layout">
        <div className="tasks-list legacy-port-empty">
          <p>No scheduled tasks loaded. Scheduling executes on Claudia; P5 adds Nexus task persistence.</p>
        </div>
        <aside className="tasks-editor">
          <h2>Task editor</h2>
          <label>
            Name
            <input type="text" disabled placeholder="Weekly summary" />
          </label>
          <label>
            Prompt
            <textarea disabled rows={6} placeholder="Task prompt…" />
          </label>
          <fieldset className="tasks-schedule-fieldset" disabled>
            <legend>Schedule</legend>
            {DAYS.map((day) => (
              <label key={day} className="tasks-day-chip">
                <input type="checkbox" disabled /> {day}
              </label>
            ))}
          </fieldset>
          <button type="button" className="legacy-port-btn" disabled>
            Save task
          </button>
        </aside>
      </div>
    </section>
  );
}
