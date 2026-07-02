"use client";

import { ClaudiaSystemStatusPanel } from "@/components/status/ClaudiaSystemStatusPanel";

export function StatusWorkspace() {
  return (
    <section
      className="legacy-port-workspace legacy-port-status legacy-port-status-centered"
      aria-labelledby="status-heading"
    >
      <header className="legacy-port-head">
        <h1 id="status-heading">Status</h1>
        <p className="legacy-port-subhead">Claudia system connectivity and service health</p>
      </header>
      <ClaudiaSystemStatusPanel />
    </section>
  );
}
