import type { AdapterReadResult, ToolAdapterMeta } from "@/lib/adapters/types";

/**
 * P5: task PERSISTENCE is live in Convex (create/queue/read/cancel/retry of the
 * signed-in user's own tasks). EXECUTION of queued work still requires the
 * future Console Connector — the adapter reports that split honestly.
 */
export const tasksAdapterMeta: ToolAdapterMeta = {
  toolId: "tasks",
  availability: "persistence_available",
  authority: "convex",
  futureConvexCollection: "nexusTasks",
  futureClaudiaTaskKind: "tasks.scheduled",
};

/** Legacy recurring "scheduled tasks" are a separate, not-yet-built feature. */
export type ScheduledTask = {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
};

export async function listScheduledTasks(): Promise<AdapterReadResult<ScheduledTask[]>> {
  return {
    ok: false,
    availability: "execution_connector_required",
    reason:
      "Scheduled recurring prompts execute on the local system and require the Console Connector. P5 persists one-off knowledge requests; recurring scheduling arrives in a later phase.",
    data: [],
  };
}
