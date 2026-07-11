import type { AdapterReadResult, ToolAdapterMeta } from "@/lib/adapters/types";

export const researchAdapterMeta: ToolAdapterMeta = {
  toolId: "research",
  availability: "available",
  authority: "claudia_connector",
  futureSystemTaskKind: "deep_research",
};

export type ResearchJob = {
  id: string;
  title: string;
  status: "queued" | "running" | "completed" | "failed";
  updatedAt?: string;
};

export async function listResearchJobs(): Promise<AdapterReadResult<ResearchJob[]>> {
  return {
    ok: false,
    availability: "connector_required",
    reason: "Deep Research jobs run on the local system and stream through the Connector.",
    data: [],
  };
}
