"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import {
  accessModeLabel,
  buildSkillsCatalogSections,
  type SkillsCatalogEntry,
  type SkillsCurrentAvailability,
} from "@/convex/lib/nexusSkillsCatalog";
import { nexusSkills } from "@/lib/nexus/skillsClient";
import { useNexusAuthReadiness } from "@/lib/nexus/useNexusAuthReadiness";

export const SKILLS_CATALOG_PENDING_AVAILABILITY_LABEL = "Checking availability…";

function availabilityClass(status: SkillsCurrentAvailability): string {
  return `skills-catalog-status skills-catalog-status--${status}`;
}

function SkillsToolCard({
  tool,
  availabilityPending = false,
}: {
  tool: SkillsCatalogEntry;
  availabilityPending?: boolean;
}) {
  return (
    <article className="skills-catalog-card" aria-labelledby={`skill-${tool.toolId}`}>
      <div className="skills-catalog-card-body">
        <h3 id={`skill-${tool.toolId}`} className="skills-catalog-card-title">
          {tool.displayName}
        </h3>
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
      </div>
      <footer className="skills-catalog-card-footer">
        <span
          className={
            availabilityPending
              ? "skills-catalog-status skills-catalog-status--connector_required"
              : availabilityClass(tool.currentAvailability)
          }
        >
          {availabilityPending ? SKILLS_CATALOG_PENDING_AVAILABILITY_LABEL : tool.availabilityLabel}
        </span>
      </footer>
    </article>
  );
}

/** Read-only catalog of Nexus-accessible system tools. */
export function SkillsWorkspace() {
  const { isLoading: authLoading, readyForPrivateQueries } = useNexusAuthReadiness();
  const catalog = useQuery(nexusSkills.listCatalog, readyForPrivateQueries ? {} : "skip");
  const availabilityPending = readyForPrivateQueries && catalog === undefined;

  const staticSections = useMemo(
    () =>
      buildSkillsCatalogSections({
        connectorConfigured: false,
        connectorOnline: false,
        allowedToolIds: [],
      }),
    [],
  );

  const sections = catalog?.sections ?? (readyForPrivateQueries ? staticSections : null);

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

      {authLoading || !readyForPrivateQueries ? (
        <p className="skills-catalog-loading" role="status">
          Loading catalog…
        </p>
      ) : sections === null || sections.length === 0 ? (
        <p className="skills-catalog-empty" role="status">
          No Nexus tools are configured yet.
        </p>
      ) : (
        <div className="skills-catalog-sections">
          {sections.map((section) => (
            <section
              key={section.id}
              className={`skills-catalog-section${
                section.tools.length > 1 ? " skills-catalog-section--span-wide" : ""
              }`}
              aria-labelledby={`skills-section-${section.id}`}
              data-tool-count={section.tools.length}
            >
              <h2 id={`skills-section-${section.id}`} className="skills-catalog-section-title">
                {section.label}
              </h2>
              <div className="skills-catalog-grid">
                {section.tools.map((tool) => (
                  <SkillsToolCard
                    key={tool.toolId}
                    tool={tool}
                    availabilityPending={availabilityPending}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
