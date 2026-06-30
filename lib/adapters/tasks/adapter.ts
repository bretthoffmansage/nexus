import type { AdapterReadResult, ToolAdapterMeta } from "@/lib/adapters/types";

export const tasksAdapterMeta: ToolAdapterMeta = {
  toolId: "tasks",
  availability: "connector_required",
  authority: "claudia_connector",
  futureConvexCollection: "nexusTasks",
  futureClaudiaTaskKind: "tasks.scheduled",
};

export type ScheduledTask = {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
};

export async function listScheduledTasks(): Promise<AdapterReadResult<ScheduledTask[]>> {
  return {
    ok: false,
    availability: "connector_required",
    reason: "Scheduled tasks execute on Claudia; P5 will add Nexus task persistence.",
    data: [],
  };
}
