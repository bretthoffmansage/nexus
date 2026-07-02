"use client";

import { useQuery } from "convex/react";
import {
  accessModeLabel,
  type SkillsCatalogEntry,
  type SkillsCurrentAvailability,
} from "@/convex/lib/nexusSkillsCatalog";
import { nexusSkills } from "@/lib/nexus/skillsClient";
import { useNexusAuthReadiness } from "@/lib/nexus/useNexusAuthReadiness";

function availabilityClass(status: SkillsCurrentAvailability): string {
  return `skills-catalog-status skills-catalog-status--${status}`;
}

function SkillsToolCard({ tool }: { tool: SkillsCatalogEntry }) {
  return (
    <article className="skills-catalog-card" aria-labelledby={`skill-${tool.toolId}`}>
      <header className="skills-catalog-card-header">
        <h3 id={`skill-${tool.toolId}`} className="skills-catalog-card-title">
          {tool.displayName}
        </h3>
        <span className={availabilityClass(tool.currentAvailability)}>{tool.availabilityLabel}</span>
      </header>
      <p className="skills-catalog-card-description">{tool.shortDescription}</p>
      <dl className="skills-catalog-card-meta">
        <div>
          <dt>Tool</dt>
          <dd className="skills-catalog-tool-id">{tool.toolId}</dd>
        </div>
        <div>
          <dt>Surfaces</dt>
          <dd>{tool.accessModes.map(accessModeLabel).join(" · ")}</dd>
        </div>
        <div>
          <dt>Input</dt>
          <dd>
            {tool.inputType === "no_input_action"
              ? "No-input scheduled action"
              : tool.inputType === "library_upload"
                ? "Library document upload"
                : "Text request"}
          </dd>
        </div>
      </dl>
    </article>
  );
}

/** Read-only catalog of Nexus-accessible system tools. */
export function SkillsWorkspace() {
  const { ready } = useNexusAuthReadiness();
  const catalog = useQuery(nexusSkills.listCatalog, ready ? {} : "skip");

  return (
    <section className="skills-catalog-workspace" aria-labelledby="skills-heading">
      <header className="skills-catalog-header">
        <h1 id="skills-heading">Skills</h1>
        <p className="skills-catalog-subtitle">Tools and capabilities available to Nexus</p>
        <p className="skills-catalog-intro">
          Skills are the approved system tools Nexus can use through Chat, Calendar, Library, or
          the Claudia Connector.
        </p>
      </header>

      {!ready || catalog === undefined ? (
        <p className="skills-catalog-loading" role="status">
          Loading catalog…
        </p>
      ) : catalog.sections.length === 0 ? (
        <p className="skills-catalog-empty" role="status">
          No Nexus tools are configured yet.
        </p>
      ) : (
        <div className="skills-catalog-sections">
          {catalog.sections.map((section) => (
            <section
              key={section.id}
              className="skills-catalog-section"
              aria-labelledby={`skills-section-${section.id}`}
            >
              <h2 id={`skills-section-${section.id}`} className="skills-catalog-section-title">
                {section.label}
              </h2>
              <div className="skills-catalog-grid">
                {section.tools.map((tool) => (
                  <SkillsToolCard key={tool.toolId} tool={tool} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
