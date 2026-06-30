"use client";

import { useState } from "react";
import { ToolAvailabilityBanner } from "@/components/workspace/ToolAvailabilityBanner";
import { emailAdapterMeta } from "@/lib/adapters/email/adapter";

const FOLDERS = ["INBOX", "Sent", "Drafts", "Archive", "Trash"];

/** Ported from legacy_local_console/static/js/emailInbox.js + emailLibrary layout. */
export function EmailWorkspace() {
  const [folder, setFolder] = useState("INBOX");
  const disconnected = emailAdapterMeta.availability !== "available";

  return (
    <section className="legacy-port-workspace legacy-port-email" aria-labelledby="email-heading">
      <ToolAvailabilityBanner availability={emailAdapterMeta.availability} />
      <header className="legacy-port-head legacy-port-head--split">
        <div>
          <h1 id="email-heading">Email</h1>
          <p className="legacy-port-subhead">Inbox, folders, and compose</p>
        </div>
        <button type="button" className="legacy-port-btn legacy-port-btn-primary" disabled>
          Compose
        </button>
      </header>

      <div className="email-workspace-grid">
        <aside className="email-folder-pane" aria-label="Folders">
          <label className="email-folder-label" htmlFor="email-folder-select">
            Folder
          </label>
          <select
            id="email-folder-select"
            className="email-folder-select"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            disabled={disconnected}
          >
            {FOLDERS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <ul className="email-folder-list">
            {FOLDERS.map((f) => (
              <li key={f}>
                <button
                  type="button"
                  className={`email-folder-item${folder === f ? " active" : ""}`}
                  onClick={() => setFolder(f)}
                  disabled={disconnected}
                >
                  {f}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="email-list-pane legacy-port-empty" role="list">
          <p>No messages loaded for {folder}. Email accounts connect through Claudia.</p>
        </div>

        <div className="email-read-pane">
          <div className="email-read-header">
            <h2 className="email-read-subject">Select a message</h2>
          </div>
          <div className="email-read-body legacy-port-empty">
            <p>Reading pane preserved from legacy layout. Reply and forward actions require Connector.</p>
          </div>
          <div className="email-read-actions">
            <button type="button" className="legacy-port-btn" disabled>
              Reply
            </button>
            <button type="button" className="legacy-port-btn" disabled>
              Forward
            </button>
            <button type="button" className="legacy-port-btn" disabled>
              Archive
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
