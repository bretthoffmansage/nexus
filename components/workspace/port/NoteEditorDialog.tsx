"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChecklistItem, NoteType } from "@/convex/lib/notesConfig";
import { NOTES_LIMITS } from "@/convex/lib/notesConfig";
import { LibraryConfirmDialog } from "@/components/workspace/port/LibraryConfirmDialog";
import { detectBrowserTimeZone, formatLocalDateInput } from "@/lib/nexus/calendarTimezone";
import type { NexusNoteView } from "@/lib/nexus/notesView";

export type NoteEditorDraft = {
  noteType: NoteType;
  title: string;
  content: string;
  checklistItems: ChecklistItem[];
  labelsText: string;
  pinned: boolean;
  dueEnabled: boolean;
  dueLocalDate: string;
  dueLocalTime: string;
  timezone: string;
};

type NoteEditorDialogProps = {
  open: boolean;
  mode: "create" | "edit";
  initial?: NexusNoteView | null;
  defaultNoteType?: NoteType;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (draft: NoteEditorDraft) => Promise<void>;
};

function emptyDraft(noteType: NoteType = "note"): NoteEditorDraft {
  return {
    noteType,
    title: "",
    content: "",
    checklistItems: [],
    labelsText: "",
    pinned: false,
    dueEnabled: false,
    dueLocalDate: formatLocalDateInput(new Date()),
    dueLocalTime: "09:00",
    timezone: detectBrowserTimeZone(),
  };
}

function draftFromNote(note: NexusNoteView): NoteEditorDraft {
  return {
    noteType: note.noteType,
    title: note.title,
    content: note.content,
    checklistItems: note.checklistItems,
    labelsText: note.labels.join(", "),
    pinned: note.pinned,
    dueEnabled: note.dueAtUtc != null,
    dueLocalDate: note.dueLocalDate ?? formatLocalDateInput(new Date()),
    dueLocalTime: note.dueLocalTime ?? "09:00",
    timezone: note.timezone ?? detectBrowserTimeZone(),
  };
}

export function NoteEditorDialog({
  open,
  mode,
  initial,
  defaultNoteType = "note",
  busy,
  error,
  onClose,
  onSave,
}: NoteEditorDialogProps) {
  const [draft, setDraft] = useState<NoteEditorDraft>(emptyDraft());

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setDraft(draftFromNote(initial));
      return;
    }
    const base = emptyDraft(defaultNoteType);
    if (defaultNoteType === "checklist") {
      base.checklistItems = [
        { id: crypto.randomUUID(), text: "", completed: false, order: 0 },
      ];
    }
    setDraft(base);
  }, [open, initial, defaultNoteType]);

  if (!open) return null;

  const addChecklistItem = () => {
    setDraft((prev) => ({
      ...prev,
      checklistItems: [
        ...prev.checklistItems,
        {
          id: crypto.randomUUID(),
          text: "",
          completed: false,
          order: prev.checklistItems.length,
        },
      ],
    }));
  };

  const updateChecklistItem = (id: string, text: string) => {
    setDraft((prev) => ({
      ...prev,
      checklistItems: prev.checklistItems.map((item) =>
        item.id === id ? { ...item, text } : item,
      ),
    }));
  };

  const removeChecklistItem = (id: string) => {
    setDraft((prev) => ({
      ...prev,
      checklistItems: prev.checklistItems
        .filter((item) => item.id !== id)
        .map((item, index) => ({ ...item, order: index })),
    }));
  };

  const title = mode === "create" ? "New note" : "Edit note";

  return (
    <div className="nexus-notes-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="notes-editor-title">
      <div className="nexus-notes-editor-card">
        <header className="nexus-notes-editor-head">
          <h2 id="notes-editor-title">{title}</h2>
          <button type="button" className="legacy-port-btn" onClick={onClose} disabled={busy}>
            Close
          </button>
        </header>

        <div className="nexus-notes-editor-type">
          <label>
            <input
              type="radio"
              name="note-type"
              checked={draft.noteType === "note"}
              onChange={() => setDraft((prev) => ({ ...prev, noteType: "note" }))}
            />
            Plain note
          </label>
          <label>
            <input
              type="radio"
              name="note-type"
              checked={draft.noteType === "checklist"}
              onChange={() =>
                setDraft((prev) => ({
                  ...prev,
                  noteType: "checklist",
                  checklistItems:
                    prev.checklistItems.length > 0
                      ? prev.checklistItems
                      : [
                          {
                            id: crypto.randomUUID(),
                            text: "",
                            completed: false,
                            order: 0,
                          },
                        ],
                }))
              }
            />
            Checklist
          </label>
        </div>

        <label className="nexus-notes-editor-field">
          Title
          <input
            type="text"
            value={draft.title}
            maxLength={NOTES_LIMITS.maxTitleLength}
            onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
          />
        </label>

        {draft.noteType === "note" ? (
          <label className="nexus-notes-editor-field">
            Content
            <textarea
              rows={6}
              value={draft.content}
              maxLength={NOTES_LIMITS.maxContentLength}
              onChange={(event) => setDraft((prev) => ({ ...prev, content: event.target.value }))}
            />
          </label>
        ) : (
          <div className="nexus-notes-editor-field">
            <span>Checklist items</span>
            <ul className="nexus-notes-checklist-editor">
              {draft.checklistItems.map((item) => (
                <li key={item.id}>
                  <input
                    type="text"
                    value={item.text}
                    maxLength={NOTES_LIMITS.maxChecklistItemLength}
                    placeholder="List item"
                    onChange={(event) => updateChecklistItem(item.id, event.target.value)}
                  />
                  <button
                    type="button"
                    className="legacy-port-btn"
                    onClick={() => removeChecklistItem(item.id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="legacy-port-btn" onClick={addChecklistItem}>
              Add item
            </button>
          </div>
        )}

        <label className="nexus-notes-editor-field">
          Labels
          <input
            type="text"
            value={draft.labelsText}
            placeholder="Comma-separated labels"
            onChange={(event) => setDraft((prev) => ({ ...prev, labelsText: event.target.value }))}
          />
        </label>

        <fieldset className="nexus-notes-editor-due">
          <label>
            <input
              type="checkbox"
              checked={draft.dueEnabled}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, dueEnabled: event.target.checked }))
              }
            />
            Due date and time
          </label>
          {draft.dueEnabled ? (
            <div className="nexus-notes-editor-due-fields">
              <input
                type="date"
                value={draft.dueLocalDate}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, dueLocalDate: event.target.value }))
                }
              />
              <input
                type="time"
                value={draft.dueLocalTime}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, dueLocalTime: event.target.value }))
                }
              />
              <input
                type="text"
                value={draft.timezone}
                onChange={(event) => setDraft((prev) => ({ ...prev, timezone: event.target.value }))}
                aria-label="Timezone"
              />
            </div>
          ) : null}
        </fieldset>

        <label className="nexus-notes-editor-pin">
          <input
            type="checkbox"
            checked={draft.pinned}
            onChange={(event) => setDraft((prev) => ({ ...prev, pinned: event.target.checked }))}
          />
          Pin note
        </label>

        {error ? (
          <p className="nexus-notes-error" role="alert">
            {error}
          </p>
        ) : null}

        <footer className="nexus-notes-editor-actions">
          <button type="button" className="legacy-port-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="legacy-port-btn legacy-port-btn-primary"
            disabled={busy}
            onClick={() => void onSave(draft)}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </footer>
      </div>
    </div>
  );
}

export function labelsFromDraft(labelsText: string): string[] {
  return labelsText
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);
}

export function dueFromDraft(draft: NoteEditorDraft) {
  if (!draft.dueEnabled) {
    return {
      dueLocalDate: null,
      dueLocalTime: null,
      timezone: null,
    };
  }
  return {
    dueLocalDate: draft.dueLocalDate,
    dueLocalTime: draft.dueLocalTime,
    timezone: draft.timezone,
  };
}
