import type { NexusSource } from "@/lib/types/presentation";
import { SourceList } from "@/components/sources/SourceList";

type CollapsibleSourcesProps = {
  sources: NexusSource[];
};

/**
 * Chat source disclosure: collapsed by default so large Knowledge Vault and
 * transcript source lists no longer fill the visible Chat area. Uses a native
 * `<details>`/`<summary>` so the toggle is keyboard- and screen-reader-friendly
 * with no extra client state.
 */
export function CollapsibleSources({ sources }: CollapsibleSourcesProps) {
  if (!sources.length) return null;

  return (
    <details className="nexus-sources-disclosure">
      <summary className="nexus-sources-summary">
        <span className="nexus-sources-caret" aria-hidden="true" />
        <span className="nexus-section-label">Sources</span>
      </summary>
      <div className="nexus-sources-disclosure-body">
        <SourceList sources={sources} emptyLabel="" />
      </div>
    </details>
  );
}
