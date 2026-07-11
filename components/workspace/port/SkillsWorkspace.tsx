"use client";

import { Component, type ReactNode, useMemo } from "react";
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

/** Presentation-only row layout for the Skills page (does not alter catalog metadata). */
const SKILLS_CATALOG_ROW_LAYOUT = [
  {
    id: "row-knowledge-research",
    heading: "Knowledge & Research",
    toolIds: ["vault.agentic_retrieval", "membership_io.transcript_retrieve"],
  },
  {
    id: "row-scheduled-maintenance",
    heading: "Scheduled Maintenance",
    toolIds: ["membership_io.catalog_refresh_and_vault_update", "vault.expansion_pass"],
  },
  {
    id: "row-library-documents",
    heading: "Library & Documents",
    toolIds: ["vault.dropzone.process_document", "research.hermes_deep_research"],
  },
] as const;

type SkillsCatalogRow = {
  id: string;
  heading: string;
  tools: SkillsCatalogEntry[];
};

function buildSkillsCatalogRows(
  sections: NonNullable<ReturnType<typeof buildSkillsCatalogSections>>,
): SkillsCatalogRow[] {
  const toolsById = new Map<string, SkillsCatalogEntry>();
  for (const section of sections) {
    for (const tool of section.tools) {
      toolsById.set(tool.toolId, tool);
    }
  }

  return SKILLS_CATALOG_ROW_LAYOUT.map((row) => ({
    id: row.id,
    heading: row.heading,
    tools: row.toolIds
      .map((toolId) => toolsById.get(toolId))
      .filter((tool): tool is SkillsCatalogEntry => tool !== undefined),
  })).filter((row) => row.tools.length > 0);
}

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
          <div className="skills-catalog-card-meta-item skills-catalog-card-meta-item--input">
            <dt>Input</dt>
            <dd className="skills-catalog-card-input-row">
              <span className="skills-catalog-card-input-value">
                {tool.inputType === "no_input_action"
                  ? "No-input scheduled action"
                  : tool.inputType === "library_upload"
                    ? "Library document upload"
                    : "Text request"}
              </span>
              <span
                className={
                  availabilityPending
                    ? "skills-catalog-status skills-catalog-status--connector_required"
                    : availabilityClass(tool.currentAvailability)
                }
              >
                {availabilityPending
                  ? SKILLS_CATALOG_PENDING_AVAILABILITY_LABEL
                  : tool.availabilityLabel}
              </span>
            </dd>
          </div>
        </dl>
      </div>
    </article>
  );
}

export const SKILLS_CATALOG_QUERY_ERROR_MESSAGE =
  "Could not load live availability. Showing the known catalog.";

function SkillsCatalogQueryBoundary({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback: ReactNode;
}) {
  return (
    <SkillsCatalogQueryBoundaryInner fallback={fallback}>{children}</SkillsCatalogQueryBoundaryInner>
  );
}

class SkillsCatalogQueryBoundaryInner extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function SkillsCatalogPanel({
  availabilityPending,
  sections,
}: {
  availabilityPending: boolean;
  sections: NonNullable<ReturnType<typeof buildSkillsCatalogSections>>;
}) {
  const rows = buildSkillsCatalogRows(sections);

  return (
    <div className="skills-catalog-rows">
      {rows.map((row) => (
        <section
          key={row.id}
          className="skills-catalog-row"
          aria-labelledby={`skills-row-${row.id}`}
          data-row-id={row.id}
        >
          <h2 id={`skills-row-${row.id}`} className="skills-catalog-row-title">
            {row.heading}
          </h2>
          <div className="skills-catalog-grid">
            {row.tools.map((tool) => (
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
  );
}

function SkillsCatalogContent({
  staticSections,
  readyForPrivateQueries,
}: {
  staticSections: ReturnType<typeof buildSkillsCatalogSections>;
  readyForPrivateQueries: boolean;
}) {
  const queryFailedFallback = (
    <>
      <p className="skills-catalog-error" role="alert">
        {SKILLS_CATALOG_QUERY_ERROR_MESSAGE}
      </p>
      <SkillsCatalogPanel availabilityPending={false} sections={staticSections} />
    </>
  );

  return (
    <SkillsCatalogQueryBoundary fallback={queryFailedFallback}>
      <SkillsCatalogLoaded
        staticSections={staticSections}
        readyForPrivateQueries={readyForPrivateQueries}
      />
    </SkillsCatalogQueryBoundary>
  );
}

function SkillsCatalogLoaded({
  staticSections,
  readyForPrivateQueries,
}: {
  staticSections: ReturnType<typeof buildSkillsCatalogSections>;
  readyForPrivateQueries: boolean;
}) {
  const catalog = useQuery(nexusSkills.listCatalog, readyForPrivateQueries ? {} : "skip");
  const availabilityPending = readyForPrivateQueries && catalog === undefined;
  const sections = catalog?.sections ?? staticSections;

  if (sections.length === 0) {
    return (
      <p className="skills-catalog-empty" role="status">
        No Nexus tools are configured yet.
      </p>
    );
  }

  return <SkillsCatalogPanel availabilityPending={availabilityPending} sections={sections} />;
}

/** Read-only catalog of Nexus-accessible system tools. */
export function SkillsWorkspace() {
  const { isLoading: authLoading, readyForPrivateQueries } = useNexusAuthReadiness();

  const staticSections = useMemo(
    () =>
      buildSkillsCatalogSections({
        connectorConfigured: false,
        connectorOnline: false,
        allowedToolIds: [],
      }),
    [],
  );

  return (
    <section className="skills-catalog-workspace" aria-labelledby="skills-heading">
      <header className="skills-catalog-header">
        <h1 id="skills-heading">Skills</h1>
        <p className="skills-catalog-subtitle">
          Tools and capabilities available to Nexus to use through Chat, Calendar, Library, or the
          Connector.
        </p>
      </header>

      {authLoading || !readyForPrivateQueries ? (
        <p className="skills-catalog-loading" role="status">
          Loading catalog…
        </p>
      ) : (
        <SkillsCatalogContent
          staticSections={staticSections}
          readyForPrivateQueries={readyForPrivateQueries}
        />
      )}
    </section>
  );
}
