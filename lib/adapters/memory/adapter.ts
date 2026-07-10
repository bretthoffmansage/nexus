import type { AdapterReadResult, ToolAdapterMeta } from "@/lib/adapters/types";

export const memoryAdapterMeta: ToolAdapterMeta = {
  toolId: "memory",
  availability: "connector_required",
  authority: "claudia_connector",
  futureClaudiaTaskKind: "memory.sync",
};

export type MemoryRecord = {
  id: string;
  category: string;
  content: string;
  updatedAt?: string;
};

export const MEMORY_CATEGORIES = [
  "all",
  "fact",
  "identity",
  "preference",
  "contact",
  "project",
  "goal",
  "task",
] as const;

export async function listMemories(): Promise<AdapterReadResult<MemoryRecord[]>> {
  return {
    ok: false,
    availability: "connector_required",
    reason: "Brain memories remain on the local system; Nexus does not copy memory data into Convex.",
    data: [],
  };
}
