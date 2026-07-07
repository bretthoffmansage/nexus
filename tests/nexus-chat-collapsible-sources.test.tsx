// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CollapsibleSources } from "@/components/sources/CollapsibleSources";
import { TYPE_ON_CHARS_PER_SECOND } from "@/lib/chat/typeOnSession";
import type { NexusSource } from "@/lib/types/presentation";

const SOURCES: NexusSource[] = [
  { id: "s1", title: "Vault note one", sourceType: "vault_note" },
  { id: "s2", title: "Transcript excerpt", sourceType: "transcript" },
];

describe("CollapsibleSources", () => {
  it("collapses the source list by default", () => {
    const { container } = render(<CollapsibleSources sources={SOURCES} />);
    const details = container.querySelector("details.nexus-sources-disclosure");
    expect(details).not.toBeNull();
    expect((details as HTMLDetailsElement).open).toBe(false);
    expect(screen.getByText("Sources")).toBeInTheDocument();
    expect(screen.getByText("Vault note one")).not.toBeVisible();
    expect(screen.getByText("Transcript excerpt")).not.toBeVisible();
  });

  it("reveals the source list when the disclosure is toggled open", async () => {
    const user = userEvent.setup();
    render(<CollapsibleSources sources={SOURCES} />);
    await user.click(screen.getByText("Sources"));
    expect(screen.getByText("Vault note one")).toBeVisible();
    expect(screen.getByText("Transcript excerpt")).toBeVisible();
  });

  it("renders nothing when there are no sources", () => {
    const { container } = render(<CollapsibleSources sources={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("Chat type-on animation speed", () => {
  it("runs at 2× the original 100 chars/second pace", () => {
    expect(TYPE_ON_CHARS_PER_SECOND).toBe(200);
  });
});
