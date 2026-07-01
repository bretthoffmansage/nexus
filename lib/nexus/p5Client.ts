import { api } from "@/convex/_generated/api";
import type { TaskStatus } from "@/convex/lib/taskStatus";

/**
 * Coherent client boundary for P5 persistence.
 *
 * Components import typed application-level operations from here instead of
 * reaching into low-level Convex function references directly. The browser can
 * only ever reference the PUBLIC functions exposed below — never the internal
 * worker mutations (result writes, transitions, assistant messages).
 */
export const nexusChat = {
  // Conversations
  listMyConversations: api.conversations.listMyConversations,
  getConversationTranscript: api.conversations.getConversationTranscript,
  createConversation: api.conversations.createConversation,
  renameMyConversation: api.conversations.renameMyConversation,
  archiveMyConversation: api.conversations.archiveMyConversation,
  reopenMyConversation: api.conversations.reopenMyConversation,
  deleteMyConversation: api.conversations.deleteMyConversation,
  // Tasks
  submitRequest: api.tasks.submitKnowledgeRequest,
  listMyTasks: api.tasks.listMyTasks,
  listMyTasksByStatus: api.tasks.listMyTasksByStatus,
  getMyTask: api.tasks.getMyTask,
  myTaskCounts: api.tasks.myTaskCounts,
  cancelTask: api.tasks.cancelMyTask,
  retryTask: api.tasks.retryMyTask,
  // Task detail children
  listMyTaskProgress: api.taskProgress.listMyTaskProgress,
  getMyTaskResult: api.taskResults.getMyTaskResult,
  listMyTaskSources: api.taskSources.listMyTaskSources,
  // P6 — truthful, content-free Connector presence for ordinary users.
  connectorStatus: api.connectorRegistry.getConnectorStatusPublic,
} as const;

/** A fresh, URL-safe idempotency key for a single submission attempt. */
export function newIdempotencyKey(): string {
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  return `nx-${uuid}`;
}

/** Human-readable label for a task status. */
export function taskStatusLabel(status: TaskStatus): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "cancel_requested":
      return "Cancelling";
    case "cancelled":
      return "Cancelled";
    case "claimed":
      return "Claimed";
    case "running":
      return "Running";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

/**
 * Truthful execution-status line. P5 persists and queues work, but no worker
 * exists yet, so queued work honestly waits for the future Console Connector.
 */
export function taskExecutionNote(status: TaskStatus): string {
  switch (status) {
    case "queued":
      return "Queued — waiting for the Claudia Connector.";
    case "cancel_requested":
      return "Cancellation requested.";
    case "cancelled":
      return "Cancelled before execution.";
    case "claimed":
    case "running":
      return "In progress.";
    case "completed":
      return "Completed.";
    case "failed":
      return "Failed.";
    default:
      return "";
  }
}

export type TaskView = {
  key: "all" | TaskStatus;
  label: string;
};

/** Tabs for the Tasks workspace. */
export const P5_TASK_VIEWS: TaskView[] = [
  { key: "all", label: "All" },
  { key: "queued", label: "Queued" },
  { key: "running", label: "Running" },
  { key: "completed", label: "Completed" },
  { key: "failed", label: "Failed" },
  { key: "cancelled", label: "Cancelled" },
];
