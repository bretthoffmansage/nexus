"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import {
  nexusChat,
  newIdempotencyKey,
  P5_TASK_VIEWS,
  taskExecutionNote,
  taskStatusLabel,
  type TaskView,
} from "@/lib/nexus/p5Client";

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function TaskDetail({ taskId }: { taskId: Id<"nexusTasks"> }) {
  const task = useQuery(nexusChat.getMyTask, { taskId });
  const progress = useQuery(nexusChat.listMyTaskProgress, { taskId });
  const result = useQuery(nexusChat.getMyTaskResult, { taskId });
  const sources = useQuery(nexusChat.listMyTaskSources, { taskId });
  const cancelTask = useMutation(nexusChat.cancelTask);
  const retryTask = useMutation(nexusChat.retryTask);
  const [busy, setBusy] = useState(false);

  if (task === undefined) {
    return <p className="legacy-port-empty">Loading task…</p>;
  }

  const canCancel = task.status === "queued";
  const canRetry = task.status === "failed" || task.status === "cancelled";

  return (
    <div className="nexus-task-detail">
      <h2>Request</h2>
      <p className="nexus-task-request">{task.requestText}</p>

      <dl className="nexus-task-meta">
        <div>
          <dt>Status</dt>
          <dd>
            <span className="nexus-tool-chip">{taskStatusLabel(task.status)}</span>
          </dd>
        </div>
        <div>
          <dt>Execution</dt>
          <dd>{taskExecutionNote(task.status)}</dd>
        </div>
        <div>
          <dt>Submitted</dt>
          <dd>{formatTime(task.createdAt)}</dd>
        </div>
        <div>
          <dt>Tool</dt>
          <dd>
            <span className="nexus-tool-chip nexus-tool-chip-muted">{task.requestedToolId}</span>
          </dd>
        </div>
        <div>
          <dt>Conversation</dt>
          <dd>
            <Link href="/">Open in chat</Link>
          </dd>
        </div>
        {task.attemptNumber > 1 ? (
          <div>
            <dt>Attempt</dt>
            <dd>#{task.attemptNumber}</dd>
          </div>
        ) : null}
      </dl>

      <div className="nexus-task-actions">
        <button
          type="button"
          className="legacy-port-btn"
          disabled={!canCancel || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await cancelTask({ taskId });
            } finally {
              setBusy(false);
            }
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          className="legacy-port-btn legacy-port-btn-primary"
          disabled={!canRetry || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await retryTask({ taskId, idempotencyKey: newIdempotencyKey() });
            } finally {
              setBusy(false);
            }
          }}
        >
          Retry
        </button>
      </div>

      {result?.answerText ? (
        <>
          <h2>Answer</h2>
          <div className="nexus-answer-panel">
            <div className="nexus-answer-body">{result.answerText}</div>
          </div>
        </>
      ) : null}

      {sources && sources.length > 0 ? (
        <>
          <h2>Sources</h2>
          <ul className="nexus-source-list">
            {sources.map((source) => (
              <li key={source.id} className="nexus-source-mini">
                <strong>{source.title}</strong>
                {source.provenanceLabel ? <span> · {source.provenanceLabel}</span> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h2>Progress</h2>
      <ul className="nexus-progress-list">
        {(progress ?? []).map((event) => (
          <li key={event.id}>
            <span className="nexus-tool-chip nexus-tool-chip-muted">{event.eventType}</span>
            {event.message ? <span> {event.message}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The signed-in user's private P5 tasks, with status views and detail. */
export function MyTasksPanel() {
  const [view, setView] = useState<TaskView["key"]>("all");
  const [selectedTaskId, setSelectedTaskId] = useState<Id<"nexusTasks"> | null>(null);

  const counts = useQuery(nexusChat.myTaskCounts, {});
  const allData = useQuery(nexusChat.listMyTasks, view === "all" ? { limit: 50 } : "skip");
  const statusData = useQuery(
    nexusChat.listMyTasksByStatus,
    view === "all" ? "skip" : { status: view, limit: 50 },
  );
  const tasks = (view === "all" ? allData?.tasks : statusData?.tasks) ?? [];
  const loading = view === "all" ? allData === undefined : statusData === undefined;

  function countFor(key: TaskView["key"]): number | null {
    if (!counts) return null;
    if (key === "all") return counts.total;
    return counts[key];
  }

  return (
    <div className="tasks-layout">
      <div className="tasks-list">
        <div className="nexus-task-views" role="tablist" aria-label="Task status">
          {P5_TASK_VIEWS.map((v) => {
            const count = countFor(v.key);
            return (
              <button
                key={v.key}
                type="button"
                role="tab"
                aria-selected={view === v.key}
                className={`nexus-task-view${view === v.key ? " is-active" : ""}`}
                onClick={() => setView(v.key)}
              >
                {v.label}
                {count !== null ? <span className="nexus-task-view-count"> {count}</span> : null}
              </button>
            );
          })}
        </div>

        {loading ? (
          <p className="legacy-port-empty">Loading your tasks…</p>
        ) : tasks.length === 0 ? (
          <p className="legacy-port-empty">No tasks in this view yet.</p>
        ) : (
          <ul className="nexus-task-rows">
            {tasks.map((task) => (
              <li key={task.id}>
                <button
                  type="button"
                  className={`nexus-task-row${task.id === selectedTaskId ? " is-active" : ""}`}
                  onClick={() => setSelectedTaskId(task.id)}
                >
                  <span className="nexus-task-row-text">{task.requestText}</span>
                  <span className="nexus-task-row-meta">
                    <span className="nexus-tool-chip">{taskStatusLabel(task.status)}</span>
                    <span>{formatTime(task.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <aside className="tasks-editor">
        {selectedTaskId ? (
          <TaskDetail taskId={selectedTaskId} />
        ) : (
          <p className="legacy-port-empty">Select a request to see its status, result, and sources.</p>
        )}
      </aside>
    </div>
  );
}
