import type { ToolAdapterMeta } from "@/lib/adapters/types";

/** Nexus Notes are Convex-owned; no Connector required for CRUD. */
export const notesAdapterMeta: ToolAdapterMeta = {
  toolId: "notes",
  availability: "available",
  authority: "convex",
  futureConvexCollection: "nexusNotes",
};
