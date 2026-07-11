"use client";

import { ToolAvailabilityBanner } from "@/components/workspace/ToolAvailabilityBanner";

/**
 * Operations surface — raw terminal transport intentionally not ported (D4/D7).
 * Preserves transcript card layout ideas only.
 */
export function OperationsWorkspace() {
  return (
    <section className="legacy-port-workspace legacy-port-operations" aria-labelledby="ops-heading">
      <ToolAvailabilityBanner
        availability="deferred"
        detail="PTY, Hermes, and legacy CLI transport are not available on hosted Nexus. A governed Operations Terminal will ship through Nexus Control Center."
      />
      <header className="legacy-port-head">
        <h1 id="ops-heading">Operations</h1>
        <p className="legacy-port-subhead">Future governed operations terminal</p>
      </header>
      <div className="ops-transcript-shell legacy-port-empty">
        <p>
          Structured operation events will replace raw legacy terminal bytes. No command input is available
          in this package.
        </p>
      </div>
    </section>
  );
}
