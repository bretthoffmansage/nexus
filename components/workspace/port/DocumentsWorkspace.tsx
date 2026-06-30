"use client";

import { useState } from "react";
import { ToolAvailabilityBanner } from "@/components/workspace/ToolAvailabilityBanner";
import { documentsAdapterMeta } from "@/lib/adapters/documents/adapter";

const TABS = ["Documents", "Sessions", "Archived"] as const;

/** Ported from legacy_local_console/static/js/documentLibrary.js library shell. */
export function DocumentsWorkspace() {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>("Documents");
  const [search, setSearch] = useState("");
  const disconnected = documentsAdapterMeta.availability !== "available";

  return (
    <section className="legacy-port-workspace legacy-port-documents" aria-labelledby="doclib-heading">
      <ToolAvailabilityBanner availability={documentsAdapterMeta.availability} />
      <header className="legacy-port-head">
        <h1 id="doclib-heading">Library</h1>
        <p className="legacy-port-subhead">Documents, versions, and active editor</p>
      </header>

      <div className="doclib-toolbar">
        <div className="doclib-tabs" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              className={`doclib-tab${activeTab === tab ? " active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
        <input
          type="search"
          className="doclib-search"
          placeholder="Search library…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={disconnected}
          aria-label="Search documents"
        />
        <button type="button" className="legacy-port-btn" disabled>
          New document
        </button>
      </div>

      <div className="doclib-split">
        <div className="doclib-list legacy-port-empty" role="list">
          <p>No documents in hosted Nexus. Library data remains on Claudia.</p>
        </div>
        <div className="doclib-editor-pane">
          <div className="doc-editor-topbar">
            <span className="doc-editor-title">No document selected</span>
            <button type="button" className="doc-action-icon-btn" disabled>
              Save
            </button>
            <button type="button" className="doc-action-icon-btn" disabled>
              Versions
            </button>
          </div>
          <textarea
            className="doc-editor-body"
            placeholder="Document editor opens when a library item is selected on Claudia…"
            disabled
            aria-disabled="true"
          />
        </div>
      </div>
    </section>
  );
}
