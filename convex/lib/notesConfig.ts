import {
  formatLocalDateTime,
  isValidIanaTimeZone,
  isValidLocalDate,
  isValidLocalTime,
  localDateTimeToUtcMs,
} from "./calendarTimezone";

/** Bounded limits for Nexus Notes — single source of truth. */
export const NOTES_LIMITS = {
  maxTitleLength: 200,
  maxContentLength: 10_000,
  maxChecklistItems: 100,
  maxChecklistItemLength: 500,
  maxLabels: 20,
  maxLabelLength: 50,
  maxBatchSize: 50,
} as const;

export const NOTE_TYPES = ["note", "checklist"] as const;
export type NoteType = (typeof NOTE_TYPES)[number];

export type ChecklistItem = {
  id: string;
  text: string;
  completed: boolean;
  order: number;
};

export type DueInput = {
  dueLocalDate?: string | null;
  dueLocalTime?: string | null;
  timezone?: string | null;
};

export type NormalizedNoteInput = {
  title: string;
  content: string;
  noteType: NoteType;
  checklistItems: ChecklistItem[];
  labels: string[];
  pinned: boolean;
  dueAtUtc: number | null;
  dueLocalDate: string | null;
  dueLocalTime: string | null;
  timezone: string | null;
};

export function normalizeLabels(labels: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of labels) {
    const label = raw.trim();
    if (!label) continue;
    const clipped = label.slice(0, NOTES_LIMITS.maxLabelLength);
    const key = clipped.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clipped);
    if (out.length >= NOTES_LIMITS.maxLabels) break;
  }
  return out;
}

export function normalizeChecklistItems(items: readonly ChecklistItem[]): ChecklistItem[] {
  const sorted = [...items]
    .map((item, index) => ({
      id: item.id.trim(),
      text: item.text.trim().slice(0, NOTES_LIMITS.maxChecklistItemLength),
      completed: Boolean(item.completed),
      order: Number.isFinite(item.order) ? item.order : index,
    }))
    .filter((item) => item.id && item.text)
    .sort((a, b) => a.order - b.order)
    .slice(0, NOTES_LIMITS.maxChecklistItems);
  return sorted.map((item, index) => ({ ...item, order: index }));
}

export function resolveDueFields(input: DueInput): Pick<
  NormalizedNoteInput,
  "dueAtUtc" | "dueLocalDate" | "dueLocalTime" | "timezone"
> {
  const dueLocalDate = input.dueLocalDate?.trim() || null;
  const dueLocalTime = input.dueLocalTime?.trim() || null;
  const timezone = input.timezone?.trim() || null;
  if (!dueLocalDate || !dueLocalTime || !timezone) {
    return {
      dueAtUtc: null,
      dueLocalDate: null,
      dueLocalTime: null,
      timezone: null,
    };
  }
  if (
    !isValidLocalDate(dueLocalDate) ||
    !isValidLocalTime(dueLocalTime) ||
    !isValidIanaTimeZone(timezone)
  ) {
    throw new Error("invalid_due_datetime");
  }
  return {
    dueAtUtc: localDateTimeToUtcMs(dueLocalDate, dueLocalTime, timezone),
    dueLocalDate,
    dueLocalTime,
    timezone,
  };
}

export function noteHasContent(input: {
  title: string;
  content: string;
  noteType: NoteType;
  checklistItems: readonly ChecklistItem[];
}): boolean {
  if (input.title.trim()) return true;
  if (input.noteType === "note" && input.content.trim()) return true;
  if (input.noteType === "checklist" && input.checklistItems.some((item) => item.text.trim())) {
    return true;
  }
  return false;
}

export function normalizeNoteInput(input: {
  title: string;
  content: string;
  noteType: NoteType;
  checklistItems: readonly ChecklistItem[];
  labels: readonly string[];
  pinned: boolean;
  due: DueInput;
}): NormalizedNoteInput {
  const title = input.title.trim().slice(0, NOTES_LIMITS.maxTitleLength);
  const content = input.content.trim().slice(0, NOTES_LIMITS.maxContentLength);
  const noteType = input.noteType;
  const checklistItems =
    noteType === "checklist" ? normalizeChecklistItems(input.checklistItems) : [];
  const labels = normalizeLabels(input.labels);
  const due = resolveDueFields(input.due);
  const normalized: NormalizedNoteInput = {
    title,
    content: noteType === "note" ? content : "",
    noteType,
    checklistItems,
    labels,
    pinned: Boolean(input.pinned),
    ...due,
  };
  if (!noteHasContent(normalized)) {
    throw new Error("blank_note");
  }
  if (noteType === "checklist" && checklistItems.length === 0) {
    throw new Error("blank_checklist");
  }
  return normalized;
}

export function formatDueForDisplay(note: {
  dueAtUtc?: number | null;
  timezone?: string | null;
}): { localDate: string; localTime: string } | null {
  if (note.dueAtUtc == null || !note.timezone) return null;
  try {
    const formatted = formatLocalDateTime(note.dueAtUtc, note.timezone);
    return {
      localDate: formatted.localScheduledDate,
      localTime: formatted.localScheduledTime,
    };
  } catch {
    return null;
  }
}
