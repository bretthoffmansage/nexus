"use client";

import Link from "next/link";
import type { Id } from "@/convex/_generated/dataModel";
import type { TaskStatus } from "@/convex/lib/taskStatus";
import {
  deepResearchLifecycleLabel,
  deriveDeepResearchLifecycle,
} from "@/lib/nexus/deepResearchView";

export type ResearchHistoryTask = {
  id: Id<"nexusTasks">;
  requestText: string;
  status: TaskStatus;
  errorCode: string | null;
  createdAt: number;
  fromCalendar?: boolean;
};

type ResearchHistoryPanelProps = {
  tasks: ResearchHistoryTask[];
  selectedTaskId: Id<"nexusTasks"> | null;
  loading: boolean;
  authenticated: boolean;
  onSelect: (taskId: Id<"nexusTasks">) => void;
};

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function requestPreview(text: string, max = 120): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max).trimEnd()}…`;
}

/**
 * Deep Research History — reuses the Chat History drawer/panel styling and
 * interaction (read-only review of past research runs). Presentational only:
 * the workspace owns the single `listMyDeepResearchTasks` query and passes the
 * rows in, so there is no second history authority and no duplicate query.
 *
 * Historical research is strictly read-only. Selecting an item opens that run's
 * result in the right panel — it never continues, appends to, or reuses the run.
 */
export function ResearchHistoryPanel({
  tasks,
  selectedTaskId,
  loading,
  authenticated,
  onSelect,
}: ResearchHistoryPanelProps) {
  return (
    <aside className="nexus-chat-history-panel" aria-labelledby="research-history-title">
      <h2 className="nexus-chat-history-title" id="research-history-title">
        Research history
      </h2>

      <div
        className="nexus-chat-history-list-wrap"
        role="region"
        aria-label="Research history"
      >
        {loading ? (
          <p className="nexus-chat-history-empty" aria-live="polite">
            Loading research history…
          </p>
        ) : !authenticated ? (
          <p className="nexus-chat-history-empty">Sign in to view research history.</p>
        ) : tasks.length === 0 ? (
          <p className="nexus-chat-history-empty">No research runs yet.</p>
        ) : (
          <ul className="research-history-list">
            {tasks.map((task) => {
              const isActive = selectedTaskId === task.id;
              return (
                <li key={task.id}>
                  <button
                    type="button"
                    className={`research-history-item${
                      isActive ? " research-history-item--active" : ""
                    }`}
                    aria-current={isActive ? "true" : undefined}
                    onClick={() => onSelect(task.id)}
                  >
                    <span className="research-history-title">
                      {requestPreview(task.requestText)}
                    </span>
                    <span className="research-history-meta">
                      {deepResearchLifecycleLabel(
                        deriveDeepResearchLifecycle({
                          taskStatus: task.status,
                          errorCode: task.errorCode,
                        }),
                      )}{" "}
                      · {formatTime(task.createdAt)}
                      {task.fromCalendar ? " · Calendar" : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="nexus-chat-history-foot">
        <Link href="/tasks" className="nexus-chat-history-link">
          View all tasks
        </Link>
      </div>
    </aside>
  );
}
