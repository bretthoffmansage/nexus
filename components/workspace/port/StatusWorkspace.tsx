"use client";

import { SystemStatusPanel } from "@/components/status/SystemStatusPanel";

export function StatusWorkspace() {
  return (
    <section
      className="legacy-port-workspace legacy-port-status legacy-port-status-centered"
      aria-labelledby="status-heading"
    >
      <header className="legacy-port-head">
        <h1 id="status-heading">Status</h1>
        <p className="legacy-port-subhead">Nexus system connectivity and service health</p>
      </header>
      <SystemStatusPanel />
    </section>
  );
}
