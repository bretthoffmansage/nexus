import type { AdapterReadResult, ToolAdapterMeta } from "@/lib/adapters/types";

export const documentsAdapterMeta: ToolAdapterMeta = {
  toolId: "documents",
  availability: "available",
  authority: "convex",
  futureConvexCollection: "nexusLibraryDocuments",
  futureClaudiaTaskKind: "obsidian.dropzone.process_document",
};

export type DocumentRecord = {
  id: string;
  title: string;
  language?: string;
  updatedAt?: string;
  archived?: boolean;
};

export async function listDocuments(): Promise<AdapterReadResult<DocumentRecord[]>> {
  return {
    ok: false,
    availability: "connector_required",
    reason: "Document library is served from the system's local storage via the Connector.",
    data: [],
  };
}
