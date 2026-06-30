"use client";

import { useState } from "react";
import { ToolAvailabilityBanner } from "@/components/workspace/ToolAvailabilityBanner";
import { researchAdapterMeta } from "@/lib/adapters/research/adapter";

/** Ported from legacy_local_console/static/js/research/panel.js */
export function ResearchWorkspace() {
  const [settingsCollapsed, setSettingsCollapsed] = useState(false);

  return (
    <section className="legacy-port-workspace legacy-port-research" aria-labelledby="research-heading">
      <ToolAvailabilityBanner availability={researchAdapterMeta.availability} />
      <header className="legacy-port-head">
        <h1 id="research-heading">Deep Research</h1>
        <p className="legacy-port-subhead">Multi-round research jobs and report viewer</p>
      </header>

      <div className="research-panel-layout">
        <aside className="research-settings">
          <button
            type="button"
            className="research-settings-toggle"
            onClick={() => setSettingsCollapsed((v) => !v)}
          >
            {settingsCollapsed ? "Show settings" : "Hide settings"}
          </button>
          {!settingsCollapsed ? (
            <form className="research-form" onSubmit={(e) => e.preventDefault()}>
              <label>
                Topic
                <input type="text" disabled placeholder="Research question…" />
              </label>
              <label>
                Max rounds
                <input type="number" disabled defaultValue={0} />
              </label>
              <label>
                Model
                <select disabled>
                  <option>Connector required</option>
                </select>
              </label>
              <button type="submit" className="legacy-port-btn legacy-port-btn-primary" disabled>
                Start research
              </button>
            </form>
          ) : null}
        </aside>

        <div className="research-jobs">
          <h2 className="research-section-title">Active jobs</h2>
          <div className="research-job-list legacy-port-empty">
            <p>No research jobs. Jobs run on Claudia and appear here when the Connector is linked.</p>
          </div>
          <h2 className="research-section-title">Past jobs</h2>
          <div className="research-job-list legacy-port-empty">
            <p>Completed reports will render in the legacy report viewer layout.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
