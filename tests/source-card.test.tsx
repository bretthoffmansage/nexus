import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SourceCard } from "@/components/sources/SourceCard";

describe("SourceCard", () => {
  it("renders presentation fields without filesystem paths", () => {
    render(
      <SourceCard
        source={{
          id: "src-1",
          title: "Knowledge base article",
          sourceType: "vault",
          location: "sage://article/example",
          excerpt: "Bounded excerpt for display.",
          retrievedAt: "2026-06-30T12:00:00Z",
          toolId: "vault.agentic_retrieval",
          provenanceLabel: "Retrieved through Claudia",
        }}
      />,
    );

    expect(screen.getByText("Knowledge base article")).toBeInTheDocument();
    expect(screen.getByText(/vault\.agentic_retrieval/)).toBeInTheDocument();
    // Provenance label is no longer surfaced — it duplicated the doc id in Location.
    expect(screen.queryByText(/Retrieved through Claudia/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\/Users\//)).not.toBeInTheDocument();
  });
});
