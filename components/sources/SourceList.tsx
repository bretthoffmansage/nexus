import type { NexusSource } from "@/lib/types/presentation";
import { SourceCard } from "@/components/sources/SourceCard";

type SourceListProps = {
  sources: NexusSource[];
  emptyLabel?: string;
};

export function SourceList({
  sources,
  emptyLabel = "Sources will appear here when a knowledge request completes.",
}: SourceListProps) {
  if (!sources.length) {
    return <p className="nexus-empty-copy">{emptyLabel}</p>;
  }

  return (
    <ul className="nexus-source-list">
      {sources.map((source) => (
        <li key={source.id}>
          <SourceCard source={source} />
        </li>
      ))}
    </ul>
  );
}
