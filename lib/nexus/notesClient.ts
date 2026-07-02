import { api } from "@/convex/_generated/api";

/** Client boundary for Nexus-owned Notes. */
export const nexusNotes = {
  listMyNotes: api.notes.listMyNotes,
  createMyNote: api.notes.createMyNote,
  updateMyNote: api.notes.updateMyNote,
  setMyNotePinned: api.notes.setMyNotePinned,
  setMyNotesArchived: api.notes.setMyNotesArchived,
  deleteMyNotes: api.notes.deleteMyNotes,
  toggleMyChecklistItem: api.notes.toggleMyChecklistItem,
} as const;

export type { NoteType, ChecklistItem } from "@/convex/lib/notesConfig";
