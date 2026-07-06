import type { TaskStatus } from "@/convex/lib/taskStatus";
import {
  DEEP_RESEARCH_FALLBACK_BLOCKED_MESSAGE,
  isDeepResearchBlockedCode,
} from "@/convex/lib/deepResearchConfig";

const ACTIVE_DEEP_RESEARCH_STATUSES: readonly TaskStatus[] = [
  "queued",
  "claimed",
  "running",
  "cancel_requested",
];

export type DeepResearchLifecycleState =
  | "draft"
  | "queued"
  | "preparing"
  | "running"
  | "blocked"
  | "failed"
  | "completed"
  | "cancelled";

export function deepResearchLifecycleLabel(state: DeepResearchLifecycleState): string {
  switch (state) {
    case "draft":
      return "Draft";
    case "queued":
      return "Queued";
    case "preparing":
      return "Preparing";
    case "running":
      return "Running";
    case "blocked":
      return "Blocked";
    case "failed":
      return "Failed";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
  }
}

export function deriveDeepResearchLifecycle(input: {
  taskStatus?: TaskStatus | null;
  errorCode?: string | null;
}): DeepResearchLifecycleState {
  if (!input.taskStatus) {
    return "draft";
  }
  switch (input.taskStatus) {
    case "queued":
      return "queued";
    case "claimed":
      return "preparing";
    case "running":
    case "cancel_requested":
      return "running";
    case "completed":
      return "completed";
    case "cancelled":
      return "cancelled";
    case "failed":
      return isDeepResearchBlockedCode(input.errorCode) ? "blocked" : "failed";
    default:
      return "draft";
  }
}

/**
 * Canonical "definitively successful" predicate for a Deep Research task.
 *
 * True only when the derived lifecycle is `completed` — i.e. the task status is
 * terminal `completed` with no blocked/failed/cancelled outcome. This is derived
 * from the canonical task status/errorCode, NOT from the presence of a
 * `task_completed` progress checkpoint, so a stray/early event can never flip it.
 * Use this (instead of ad-hoc string checks) wherever the UI must distinguish a
 * genuinely successful run — e.g. hiding the Progress checkpoint block.
 */
export function isSuccessfullyCompletedResearchTask(input: {
  taskStatus?: TaskStatus | null;
  errorCode?: string | null;
}): boolean {
  return deriveDeepResearchLifecycle(input) === "completed";
}

export function blockedResearchMessage(
  errorCode: string | null | undefined,
  errorMessage: string | null | undefined,
): string {
  if (errorMessage?.trim()) {
    return errorMessage.trim();
  }
  if (isDeepResearchBlockedCode(errorCode)) {
    return DEEP_RESEARCH_FALLBACK_BLOCKED_MESSAGE;
  }
  return DEEP_RESEARCH_FALLBACK_BLOCKED_MESSAGE;
}

export function formatResearchDuration(durationMs: number | null | undefined): string | null {
  if (durationMs === null || durationMs === undefined || !Number.isFinite(durationMs)) {
    return null;
  }
  const rounded = Math.max(0, Math.round(durationMs));
  if (rounded < 1000) {
    return `${rounded} ms`;
  }
  const totalSeconds = Math.round(rounded / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

export function isDeepResearchTaskActive(status: TaskStatus | null | undefined): boolean {
  return (
    status !== null &&
    status !== undefined &&
    (ACTIVE_DEEP_RESEARCH_STATUSES as readonly string[]).includes(status)
  );
}
