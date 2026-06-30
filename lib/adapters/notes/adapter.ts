import type { AdapterReadResult, ToolAdapterMeta } from "@/lib/adapters/types";

export const notesAdapterMeta: ToolAdapterMeta = {
  toolId: "notes",
  availability: "connector_required",
  authority: "claudia_connector",
  futureConvexCollection: "notes",
  futureClaudiaTaskKind: "notes.sync",
};

export type NoteRecord = {
  id: string;
  title: string;
  body: string;
  dueAt?: string;
  reminderAt?: string;
  archived?: boolean;
};

export async function listNotes(): Promise<AdapterReadResult<NoteRecord[]>> {
  return {
    ok: false,
    availability: "connector_required",
    reason: "Notes are stored in Claudia and require the Console Connector.",
    data: [],
  };
}
