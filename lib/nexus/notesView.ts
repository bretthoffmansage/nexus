import type { ChecklistItem, NoteType } from "@/convex/lib/notesConfig";

export type NexusNoteView = {
  id: string;
  title: string;
  content: string;
  noteType: NoteType;
  checklistItems: ChecklistItem[];
  labels: string[];
  pinned: boolean;
  archived: boolean;
  dueAtUtc: number | null;
  dueLocalDate: string | null;
  dueLocalTime: string | null;
  timezone: string | null;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
};

export type DueState = "none" | "upcoming" | "due" | "overdue";

const DAY_MS = 24 * 60 * 60 * 1000;

export function dueStateForNote(
  note: Pick<NexusNoteView, "dueAtUtc">,
  now = Date.now(),
): DueState {
  if (note.dueAtUtc == null) return "none";
  if (note.dueAtUtc < now) return "overdue";
  if (note.dueAtUtc - now <= DAY_MS) return "due";
  return "upcoming";
}

export function dueStateLabel(state: DueState): string | null {
  switch (state) {
    case "overdue":
      return "Overdue";
    case "due":
      return "Due soon";
    case "upcoming":
      return "Upcoming";
    default:
      return null;
  }
}

export function sortNotesForDisplay(notes: readonly NexusNoteView[]): NexusNoteView[] {
  return [...notes].sort((a, b) => {
    if (!a.archived && !b.archived) {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const aDue = a.dueAtUtc ?? Number.POSITIVE_INFINITY;
      const bDue = b.dueAtUtc ?? Number.POSITIVE_INFINITY;
      const aOverdue = a.dueAtUtc != null && a.dueAtUtc < Date.now();
      const bOverdue = b.dueAtUtc != null && b.dueAtUtc < Date.now();
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
      if (aDue !== bDue) return aDue - bDue;
    }
    if (a.archived && b.archived) {
      const aArchived = a.archivedAt ?? a.updatedAt;
      const bArchived = b.archivedAt ?? b.updatedAt;
      if (aArchived !== bArchived) return bArchived - aArchived;
    }
    return b.updatedAt - a.updatedAt;
  });
}

export function filterNotesBySearch(
  notes: readonly NexusNoteView[],
  query: string,
): NexusNoteView[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...notes];
  return notes.filter((note) => {
    if (note.title.toLowerCase().includes(q)) return true;
    if (note.content.toLowerCase().includes(q)) return true;
    if (note.labels.some((label) => label.toLowerCase().includes(q))) return true;
    if (note.checklistItems.some((item) => item.text.toLowerCase().includes(q))) return true;
    return false;
  });
}

export function filterNotesByLabel(
  notes: readonly NexusNoteView[],
  label: string | null,
): NexusNoteView[] {
  if (!label) return [...notes];
  const target = label.toLowerCase();
  return notes.filter((note) =>
    note.labels.some((entry) => entry.toLowerCase() === target),
  );
}

export function collectNoteLabels(notes: readonly NexusNoteView[]): string[] {
  const labels = new Set<string>();
  for (const note of notes) {
    for (const label of note.labels) labels.add(label);
  }
  return [...labels].sort((a, b) => a.localeCompare(b));
}

export function notePreviewText(note: NexusNoteView, max = 140): string {
  if (note.noteType === "checklist") {
    const first = note.checklistItems.find((item) => item.text.trim());
    const base = first?.text ?? note.title;
    if (!base) return "";
    return base.length <= max ? base : `${base.slice(0, max).trimEnd()}…`;
  }
  const base = note.content || note.title;
  if (!base) return "";
  return base.length <= max ? base : `${base.slice(0, max).trimEnd()}…`;
}
