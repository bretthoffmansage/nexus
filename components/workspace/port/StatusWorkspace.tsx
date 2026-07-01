"use client";

import { ToolAvailabilityBanner } from "@/components/workspace/ToolAvailabilityBanner";
import { ClaudiaPresenceLive } from "@/components/status/ClaudiaPresenceLive";
import { DiagnosticsPanel } from "@/components/diagnostics/DiagnosticsPanel";

/** Ported status ideas from legacy claudiaDashboard.js without local service control. */
export function StatusWorkspace() {
  return (
    <section className="legacy-port-workspace legacy-port-status" aria-labelledby="status-heading">
      <ToolAvailabilityBanner availability="partially_available" />
      <header className="legacy-port-head">
        <h1 id="status-heading">Status</h1>
        <p className="legacy-port-subhead">Connector presence and Nexus diagnostics</p>
      </header>
      <div className="status-cards">
        <ClaudiaPresenceLive />
        <DiagnosticsPanel />
      </div>
      <p className="legacy-port-note">
        Requests and history are stored securely in Nexus. Execution begins when the Claudia
        Connector is online and claims queued work through the trusted Connector protocol. The local
        Claudia Control Center retains service start/stop authority; hosted Nexus shows connectivity
        state only.
      </p>
    </section>
  );
}
