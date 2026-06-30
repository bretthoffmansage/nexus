import type { AdapterReadResult, ToolAdapterMeta } from "@/lib/adapters/types";

export const researchAdapterMeta: ToolAdapterMeta = {
  toolId: "research",
  availability: "connector_required",
  authority: "claudia_connector",
  futureClaudiaTaskKind: "research.job",
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
    reason: "Deep Research jobs run on Claudia and stream through the Connector.",
    data: [],
  };
}
