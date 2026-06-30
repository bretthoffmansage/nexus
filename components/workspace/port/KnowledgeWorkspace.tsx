"use client";

import { ToolAvailabilityBanner } from "@/components/workspace/ToolAvailabilityBanner";

/** Cookbook browsing shell — local install/start actions disabled (D3). */
export function KnowledgeWorkspace() {
  return (
    <section className="legacy-port-workspace legacy-port-knowledge" aria-labelledby="cookbook-heading">
      <ToolAvailabilityBanner availability="local_only" />
      <header className="legacy-port-head">
        <h1 id="cookbook-heading">Cookbook</h1>
        <p className="legacy-port-subhead">Recipe library and serve workflows</p>
      </header>
      <div className="cookbook-grid legacy-port-empty">
        <p>Cookbook install and serve controls remain on the Claudia Mac legacy console.</p>
        <button type="button" className="legacy-port-btn" disabled>
          Browse recipes
        </button>
      </div>
    </section>
  );
}
