"use client";

import type { ReactNode } from "react";
import {
  WORKER_ACTIVITY_LIMITS,
  isWorkerActivityStatus,
} from "@/convex/lib/p5config";

/**
 * Shape of a task-progress row as returned by `taskProgress.listMyTaskProgress`.
 * Only the fields this feed reads are declared; everything else is ignored.
 */
export type ProgressEventRow = {
  id: string;
  sequence: number;
  eventType: string;
  message: string | null;
  createdAt: number;
  metadata?: Record<string, string | number | boolean | null> | null;
};

type WorkerActivityFeedProps = {
  /** Raw progress rows for one owned task/message (already access-checked upstream). */
  events: readonly ProgressEventRow[] | undefined;
  /** Section label — "Research activity" (Deep Research) or "Retrieval activity" (Chat). */
  label: string;
  /** Latest-N window. Defaults to the governed visible line count (4). */
  visibleCount?: number;
  /** Rendered when there are no worker-activity events (e.g. a technical progress fallback). */
  fallback?: ReactNode;
};

/**
 * Compact, live worker-activity readback.
 *
 * Renders ONLY the latest `visibleCount` (default 4) `worker_activity` events in
 * chronological order — a fifth arriving event pushes the oldest visible line
 * out. It renders message text only (never raw payload, never HTML), clamps
 * length defensively, ignores unknown metadata, and shows nothing (or the
 * provided fallback) when there is no activity. It is per-task: the caller
 * passes exactly one task's rows, so activity never leaks across tasks/users.
 */
export function WorkerActivityFeed({
  events,
  label,
  visibleCount = WORKER_ACTIVITY_LIMITS.visibleLineCount,
  fallback = null,
}: WorkerActivityFeedProps) {
  const window = Math.max(1, visibleCount);
  const activity = (events ?? [])
    .filter(
      (e): e is ProgressEventRow & { message: string } =>
        e.eventType === "worker_activity" &&
        typeof e.message === "string" &&
        e.message.trim().length > 0,
    )
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .slice(-window);

  if (activity.length === 0) return <>{fallback}</>;

  return (
    <div
      className="nexus-activity-feed"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span className="nexus-section-label nexus-activity-label">{label}</span>
      <ul className="nexus-activity-list">
        {activity.map((event) => {
          const status = statusFor(event);
          return (
            <li
              key={event.id}
              className={`nexus-activity-line${status ? ` is-${status}` : ""}`}
            >
              <span className="nexus-activity-dot" aria-hidden="true" />
              <span className="nexus-activity-text">{clampMessage(event.message)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Read a safe, allowlisted status from bounded metadata for styling only. */
function statusFor(event: ProgressEventRow): string | null {
  const raw = event.metadata?.status;
  return typeof raw === "string" && isWorkerActivityStatus(raw) ? raw : null;
}

/** Defense-in-depth: single-line, length-clamped display text. */
function clampMessage(message: string): string {
  const oneLine = message.replace(/\s+/g, " ").trim();
  const max = WORKER_ACTIVITY_LIMITS.maxMessageLength;
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}
