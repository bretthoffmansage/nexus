import type { AdapterReadResult, ToolAdapterMeta } from "@/lib/adapters/types";

export const documentsAdapterMeta: ToolAdapterMeta = {
  toolId: "documents",
  availability: "connector_required",
  authority: "claudia_connector",
  futureConvexCollection: "documents",
  futureClaudiaTaskKind: "documents.sync",
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
    reason: "Document library is served from Claudia local storage via the Connector.",
    data: [],
  };
}
