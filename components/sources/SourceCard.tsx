import type { NexusSource } from "@/lib/types/presentation";

type SourceCardProps = {
  source: NexusSource;
};

export function SourceCard({ source }: SourceCardProps) {
  // The provenance label is intentionally not rendered — it typically duplicates
  // the raw document id already shown in Location, adding a redundant line.
  const hasFooter = Boolean(source.toolId || source.retrievedAt || source.href);

  return (
    <article className="nexus-source-card">
      <header className="nexus-source-card-head">
        <h3 className="nexus-source-card-title">{source.title}</h3>
        {source.sourceType ? (
          <span className="nexus-source-type">{source.sourceType}</span>
        ) : null}
      </header>
      {source.location ? (
        <p className="nexus-source-meta">
          <span className="nexus-source-label">Location</span> {source.location}
        </p>
      ) : null}
      {source.excerpt ? <p className="nexus-source-excerpt">{source.excerpt}</p> : null}
      {hasFooter ? (
        <footer className="nexus-source-footer">
          {source.toolId ? <span>Tool: {source.toolId}</span> : null}
          {source.retrievedAt ? <span>Retrieved: {source.retrievedAt}</span> : null}
          {source.href ? (
            <a href={source.href} className="nexus-source-link">
              Reference
            </a>
          ) : null}
        </footer>
      ) : null}
    </article>
  );
}
