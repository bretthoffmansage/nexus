"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { LibraryConfirmDialog } from "@/components/workspace/port/LibraryConfirmDialog";
import {
  dueFromDraft,
  labelsFromDraft,
  NoteEditorDialog,
  type NoteEditorDraft,
} from "@/components/workspace/port/NoteEditorDialog";
import { nexusNotes } from "@/lib/nexus/notesClient";
import {
  collectNoteLabels,
  dueStateForNote,
  dueStateLabel,
  filterNotesByLabel,
  filterNotesBySearch,
  notePreviewText,
  sortNotesForDisplay,
  type NexusNoteView,
} from "@/lib/nexus/notesView";
import { useNexusAuthReadiness } from "@/lib/nexus/useNexusAuthReadiness";

const VIEW_MODE_KEY = "nexus.notes.viewMode";

type ViewMode = "list" | "grid";

function loadViewMode(): ViewMode {
  if (typeof window === "undefined") return "list";
  try {
    const value = localStorage.getItem(VIEW_MODE_KEY);
    return value === "grid" ? "grid" : "list";
  } catch {
    return "list";
  }
}

function saveViewMode(mode: ViewMode): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(VIEW_MODE_KEY, mode);
  } catch {
    // Ignore preference persistence failures.
  }
}

function noteToMutationArgs(draft: NoteEditorDraft) {
  return {
    title: draft.title,
    content: draft.content,
    noteType: draft.noteType,
    checklistItems: draft.checklistItems,
    labels: labelsFromDraft(draft.labelsText),
    pinned: draft.pinned,
    due: dueFromDraft(draft),
  };
}

export function NotesWorkspace() {
  const { readyForPrivateQueries: ready } = useNexusAuthReadiness();
  const [archiveView, setArchiveView] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [labelFilter, setLabelFilter] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [createNoteType, setCreateNoteType] = useState<"note" | "checklist">("note");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
  const [editingNote, setEditingNote] = useState<NexusNoteView | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Id<"nexusNotes">[] | null>(null);

  useEffect(() => {
    setViewMode(loadViewMode());
  }, []);

  useEffect(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, [archiveView]);

  const notes = useQuery(nexusNotes.listMyNotes, ready ? { archived: archiveView } : "skip");
  const createNote = useMutation(nexusNotes.createMyNote);
  const updateNote = useMutation(nexusNotes.updateMyNote);
  const setPinned = useMutation(nexusNotes.setMyNotePinned);
  const setArchived = useMutation(nexusNotes.setMyNotesArchived);
  const deleteNotes = useMutation(nexusNotes.deleteMyNotes);
  const toggleChecklistItem = useMutation(nexusNotes.toggleMyChecklistItem);

  const sortedNotes = useMemo(
    () => sortNotesForDisplay((notes ?? []) as NexusNoteView[]),
    [notes],
  );
  const visibleNotes = useMemo(() => {
    const searched = filterNotesBySearch(sortedNotes, searchQuery);
    return filterNotesByLabel(searched, labelFilter);
  }, [sortedNotes, searchQuery, labelFilter]);
  const labelOptions = useMemo(() => collectNoteLabels(sortedNotes), [sortedNotes]);
  const pinnedNotes = useMemo(
    () => (!archiveView ? visibleNotes.filter((note) => note.pinned) : []),
    [archiveView, visibleNotes],
  );
  const regularNotes = useMemo(() => {
    if (archiveView) return visibleNotes;
    const pinned = new Set(pinnedNotes.map((note) => note.id));
    return visibleNotes.filter((note) => !pinned.has(note.id));
  }, [archiveView, pinnedNotes, visibleNotes]);

  const allVisibleSelected =
    visibleNotes.length > 0 && visibleNotes.every((note) => selectedIds.has(note.id));

  const openCreate = (noteType: "note" | "checklist" = "note") => {
    setCreateNoteType(noteType);
    setEditorMode("create");
    setEditingNote(null);
    setEditorError(null);
    setEditorOpen(true);
  };

  const openEdit = (note: NexusNoteView) => {
    setEditorMode("edit");
    setEditingNote(note);
    setEditorError(null);
    setEditorOpen(true);
  };

  const handleSave = useCallback(
    async (draft: NoteEditorDraft) => {
      setEditorBusy(true);
      setEditorError(null);
      try {
        const args = noteToMutationArgs(draft);
        if (editorMode === "create") {
          await createNote(args);
        } else if (editingNote?.id) {
          await updateNote({ noteId: editingNote.id as Id<"nexusNotes">, ...args });
        }
        setEditorOpen(false);
      } catch (error) {
        setEditorError(error instanceof Error ? error.message : "Could not save note");
      } finally {
        setEditorBusy(false);
      }
    },
    [createNote, editorMode, editingNote?.id, updateNote],
  );

  const toggleSelected = (noteId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(noteId)) next.delete(noteId);
      else next.add(noteId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(visibleNotes.map((note) => note.id)));
  };

  const selectedNoteIds = useMemo(
    () => [...selectedIds] as Id<"nexusNotes">[],
    [selectedIds],
  );

  const runBulkArchive = async () => {
    if (!selectedNoteIds.length) return;
    setActionBusy(true);
    try {
      await setArchived({ noteIds: selectedNoteIds, archived: !archiveView });
      setSelectMode(false);
      setSelectedIds(new Set());
    } finally {
      setActionBusy(false);
    }
  };

  const confirmBulkDelete = () => {
    if (!selectedNoteIds.length) return;
    setPendingDeleteIds(selectedNoteIds);
  };

  const runBulkDelete = async () => {
    if (!pendingDeleteIds?.length) return;
    setActionBusy(true);
    try {
      await deleteNotes({ noteIds: pendingDeleteIds });
      setPendingDeleteIds(null);
      setSelectMode(false);
      setSelectedIds(new Set());
    } finally {
      setActionBusy(false);
    }
  };

  const renderNoteCard = (note: NexusNoteView) => {
    const due = dueStateForNote(note);
    const dueLabel = dueStateLabel(due);
    const selected = selectedIds.has(note.id);
    return (
      <article
        key={note.id}
        className={`nexus-note-card${selected ? " nexus-note-card--selected" : ""}${
          viewMode === "grid" ? " nexus-note-card--grid" : ""
        }`}
      >
        <header className="nexus-note-card-head">
          {selectMode ? (
            <input
              type="checkbox"
              checked={selected}
              aria-label={`Select ${note.title || "note"}`}
              onChange={() => toggleSelected(note.id)}
            />
          ) : null}
          <button type="button" className="nexus-note-card-title" onClick={() => openEdit(note)}>
            {note.title || (note.noteType === "checklist" ? "Checklist" : "Untitled note")}
          </button>
          {!selectMode ? (
            <button
              type="button"
              className={`nexus-note-pin-btn${note.pinned ? " active" : ""}`}
              aria-label={note.pinned ? "Unpin note" : "Pin note"}
              onClick={() => void setPinned({ noteId: note.id as Id<"nexusNotes">, pinned: !note.pinned })}
            >
              Pin
            </button>
          ) : null}
        </header>

        {note.noteType === "checklist" ? (
          <ul className="nexus-note-checklist">
            {note.checklistItems.map((item) => (
              <li key={item.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={item.completed}
                    onChange={(event) =>
                      void toggleChecklistItem({
                        noteId: note.id as Id<"nexusNotes">,
                        itemId: item.id,
                        completed: event.target.checked,
                      })
                    }
                  />
                  <span className={item.completed ? "done" : undefined}>{item.text}</span>
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <p className="nexus-note-preview">{notePreviewText(note)}</p>
        )}

        {note.labels.length > 0 ? (
          <div className="nexus-note-labels">
            {note.labels.map((label) => (
              <span key={label} className="nexus-note-label">
                {label}
              </span>
            ))}
          </div>
        ) : null}

        <footer className="nexus-note-card-foot">
          {dueLabel ? <span className={`nexus-note-due nexus-note-due--${due}`}>{dueLabel}</span> : null}
          {!selectMode ? (
            <div className="nexus-note-card-actions">
              <button
                type="button"
                className="legacy-port-btn"
                onClick={() =>
                  void setArchived({
                    noteIds: [note.id as Id<"nexusNotes">],
                    archived: !archiveView,
                  })
                }
              >
                {archiveView ? "Unarchive" : "Archive"}
              </button>
              <button
                type="button"
                className="legacy-port-btn danger"
                onClick={() => setPendingDeleteIds([note.id as Id<"nexusNotes">])}
              >
                Delete
              </button>
            </div>
          ) : null}
        </footer>
      </article>
    );
  };

  const emptyMessage = !ready
    ? "Loading notes…"
    : searchQuery.trim()
      ? "No notes match your search"
      : archiveView
        ? "No archived notes"
        : "No notes yet";

  return (
    <section
      className="legacy-port-workspace legacy-port-notes legacy-port-notes-centered"
      aria-labelledby="notes-heading"
    >
      <header className="legacy-port-head nexus-notes-page-head">
        <div>
          <h1 id="notes-heading">Notes</h1>
          <p className="legacy-port-subhead">Quick notes, checklists, and reminders</p>
        </div>
        <div className="nexus-notes-head-actions">
          <button type="button" className="legacy-port-btn legacy-port-btn-primary" onClick={() => openCreate("note")}>
            New note
          </button>
          <button type="button" className="legacy-port-btn" onClick={() => openCreate("checklist")}>
            New checklist
          </button>
          <button
            type="button"
            className="legacy-port-btn"
            onClick={() => setArchiveView((value) => !value)}
          >
            {archiveView ? "Active" : "Archive"}
          </button>
          <button
            type="button"
            className="legacy-port-btn"
            aria-pressed={viewMode === "grid"}
            onClick={() => {
              const next = viewMode === "grid" ? "list" : "grid";
              setViewMode(next);
              saveViewMode(next);
            }}
          >
            {viewMode === "grid" ? "List" : "Grid"}
          </button>
        </div>
      </header>

      <div className="notes-pane legacy-port-pane">
        <div className="notes-search-bar">
          <input
            type="search"
            className="memory-search-input"
            placeholder="Search notes…"
            aria-label="Search notes"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          {labelOptions.length > 0 ? (
            <select
              className="nexus-notes-label-filter"
              aria-label="Filter by label"
              value={labelFilter ?? ""}
              onChange={(event) => setLabelFilter(event.target.value || null)}
            >
              <option value="">All labels</option>
              {labelOptions.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          ) : null}
          <button
            type="button"
            className="notes-select-trigger"
            onClick={() => {
              setSelectMode((value) => !value);
              setSelectedIds(new Set());
            }}
          >
            {selectMode ? "Done" : "Select"}
          </button>
        </div>

        {selectMode ? (
          <div className="memory-bulk-bar" id="notes-bulk-bar">
            <label className="memory-bulk-check-all">
              <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} /> All
            </label>
            <span>{selectedIds.size} selected</span>
            <button
              type="button"
              className="memory-toolbar-btn"
              disabled={!selectedIds.size || actionBusy}
              onClick={() => void runBulkArchive()}
            >
              {archiveView ? "Unarchive" : "Archive"}
            </button>
            <button
              type="button"
              className="memory-toolbar-btn danger"
              disabled={!selectedIds.size || actionBusy}
              onClick={confirmBulkDelete}
            >
              Delete
            </button>
          </div>
        ) : null}

        <div className={`notes-pane-body${viewMode === "grid" ? " notes-pane-body--grid" : ""}`}>
          {!ready || notes === undefined ? (
            <p className="legacy-port-empty">{emptyMessage}</p>
          ) : visibleNotes.length === 0 ? (
            <div className="legacy-port-empty">
              <p>{emptyMessage}</p>
              {!archiveView && !searchQuery.trim() ? (
                <button type="button" className="legacy-port-btn legacy-port-btn-primary" onClick={() => openCreate("note")}>
                  Create your first note
                </button>
              ) : null}
            </div>
          ) : (
            <>
              {!archiveView && pinnedNotes.length > 0 ? (
                <section className="nexus-notes-section">
                  <h2 className="nexus-notes-section-title">Pinned</h2>
                  <div className="nexus-notes-card-list">{pinnedNotes.map(renderNoteCard)}</div>
                </section>
              ) : null}
              <section className="nexus-notes-section">
                {!archiveView && pinnedNotes.length > 0 ? (
                  <h2 className="nexus-notes-section-title">Other notes</h2>
                ) : null}
                <div className="nexus-notes-card-list">{regularNotes.map(renderNoteCard)}</div>
              </section>
            </>
          )}
        </div>
      </div>

      <NoteEditorDialog
        open={editorOpen}
        mode={editorMode}
        initial={editingNote}
        defaultNoteType={createNoteType}
        busy={editorBusy}
        error={editorError}
        onClose={() => setEditorOpen(false)}
        onSave={handleSave}
      />

      {pendingDeleteIds ? (
        <LibraryConfirmDialog
          title={`Delete ${pendingDeleteIds.length} note${pendingDeleteIds.length === 1 ? "" : "s"}?`}
          busy={actionBusy}
          onNo={() => setPendingDeleteIds(null)}
          onYes={() => void runBulkDelete()}
        />
      ) : null}
    </section>
  );
}
