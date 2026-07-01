"use client";

import { MyTasksPanel } from "@/components/workspace/port/MyTasksPanel";
import { ToolAvailabilityBanner } from "@/components/workspace/ToolAvailabilityBanner";
import { tasksAdapterMeta } from "@/lib/adapters/tasks/adapter";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type TasksWorkspaceProps = {
  /** True when the signed-in user may read their own task records. */
  canQuery?: boolean;
};

/**
 * P5: the Tasks workspace now shows the signed-in user's own persisted
 * knowledge-request tasks (queued/cancelled/etc.) from Convex. The ported
 * legacy scheduled-prompt editor is preserved below as a separate,
 * connector-required future feature.
 */
export function TasksWorkspace({ canQuery = false }: TasksWorkspaceProps) {
  return (
    <section className="legacy-port-workspace legacy-port-tasks" aria-labelledby="tasks-heading">
      <ToolAvailabilityBanner availability={tasksAdapterMeta.availability} />
      <header className="legacy-port-head legacy-port-head--split">
        <div>
          <h1 id="tasks-heading">Tasks</h1>
          <p className="legacy-port-subhead">Your private knowledge requests and their queue status</p>
        </div>
      </header>

      {canQuery ? (
        <MyTasksPanel />
      ) : (
        <p className="legacy-port-empty">
          Your task history is available to approved knowledge readers.
        </p>
      )}

      <details className="legacy-port-scheduled">
        <summary>Scheduled recurring prompts</summary>
        <ToolAvailabilityBanner availability="execution_connector_required" />
        <div className="tasks-layout">
          <div className="tasks-list legacy-port-empty">
            <p>
              Recurring schedules execute on Claudia and require the Console Connector. P5 persists
              one-off requests; recurring scheduling arrives in a later phase.
            </p>
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
      </details>
    </section>
  );
}
