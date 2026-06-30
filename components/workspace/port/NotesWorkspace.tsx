"use client";

import { useState } from "react";
import { ToolAvailabilityBanner } from "@/components/workspace/ToolAvailabilityBanner";
import { notesAdapterMeta } from "@/lib/adapters/notes/adapter";

/** Ported from legacy_local_console/static/js/notes.js panel layout. */
export function NotesWorkspace() {
  const [archiveView, setArchiveView] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const disconnected = notesAdapterMeta.availability !== "available";

  return (
    <section className="legacy-port-workspace legacy-port-notes" aria-labelledby="notes-heading">
      <ToolAvailabilityBanner availability={notesAdapterMeta.availability} />
      <div className="notes-pane legacy-port-pane">
        <div className="notes-pane-header">
          <h1 id="notes-heading" className="notes-pane-title">
            Notes
          </h1>
          <button
            type="button"
            className="doc-action-icon-btn notes-header-text-btn"
            disabled={disconnected}
            onClick={() => setArchiveView((v) => !v)}
          >
            {archiveView ? "Active" : "Archive"}
          </button>
          <button type="button" className="doc-action-icon-btn notes-header-text-btn" disabled>
            Toggle
          </button>
        </div>
        <div className="notes-search-bar">
          <input
            type="text"
            className="memory-search-input"
            placeholder="Search notes…"
            disabled={disconnected}
            aria-label="Search notes"
          />
          <button
            type="button"
            className="notes-select-trigger"
            disabled={disconnected}
            onClick={() => setSelectMode((v) => !v)}
          >
            {selectMode ? "Done" : "Select"}
          </button>
        </div>
        {selectMode ? (
          <div className="memory-bulk-bar" id="notes-bulk-bar">
            <label className="memory-bulk-check-all">
              <input type="checkbox" disabled /> All
            </label>
            <button type="button" className="memory-toolbar-btn" disabled>
              Archive
            </button>
            <button type="button" className="memory-toolbar-btn danger" disabled>
              Delete
            </button>
          </div>
        ) : null}
        <div className="notes-pane-body legacy-port-empty">
          <p>No notes loaded. Notes and reminders are managed on Claudia and sync through the Connector.</p>
          <button type="button" className="legacy-port-btn" disabled>
            New note
          </button>
        </div>
      </div>
    </section>
  );
}
