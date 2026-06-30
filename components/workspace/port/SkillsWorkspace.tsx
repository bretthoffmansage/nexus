"use client";

import { ToolAvailabilityBanner } from "@/components/workspace/ToolAvailabilityBanner";

/** Skills editor shell — filesystem-backed skills remain local (D3). */
export function SkillsWorkspace() {
  return (
    <section className="legacy-port-workspace legacy-port-skills" aria-labelledby="skills-heading">
      <ToolAvailabilityBanner availability="local_only" />
      <header className="legacy-port-head">
        <h1 id="skills-heading">Skills</h1>
        <p className="legacy-port-subhead">SKILL.md library and builtin tool sections</p>
      </header>
      <div className="skills-split">
        <div className="skills-list legacy-port-empty">
          <p>No skills loaded in hosted Nexus. Skills are managed on Claudia local storage.</p>
        </div>
        <div className="skills-editor legacy-port-empty">
          <p>Markdown editor and audit tools require the legacy local console.</p>
        </div>
      </div>
    </section>
  );
}
