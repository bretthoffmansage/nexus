// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  WorkerActivityFeed,
  type ProgressEventRow,
} from "@/components/status/WorkerActivityFeed";
import { WORKER_ACTIVITY_LIMITS } from "@/convex/lib/p5config";

let seq = 0;
function activity(message: string, extra?: Partial<ProgressEventRow>): ProgressEventRow {
  seq += 1;
  return {
    id: `e${seq}`,
    sequence: seq,
    eventType: "worker_activity",
    message,
    createdAt: 1_000 + seq,
    metadata: { status: "running", worker: "cursor_cli" },
    ...extra,
  };
}

describe("WorkerActivityFeed", () => {
  it("renders only the latest four events in chronological order", () => {
    seq = 0;
    const events = [
      activity("Planning the research approach…"),
      activity("Searching the public web…"),
      activity("Searching Membership.io transcripts…"),
      activity("Waiting for transcript retrieval…"),
    ];
    render(<WorkerActivityFeed events={events} label="Research activity" />);
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual([
      "Planning the research approach…",
      "Searching the public web…",
      "Searching Membership.io transcripts…",
      "Waiting for transcript retrieval…",
    ]);
  });

  it("honors a larger visibleCount (Deep Research shows up to eight)", () => {
    seq = 0;
    const events = Array.from({ length: 10 }, (_, i) => activity(`line ${i + 1}`));
    render(<WorkerActivityFeed events={events} label="Research activity" visibleCount={8} />);
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toHaveLength(8);
    // Latest eight (lines 3..10); the two oldest are dropped.
    expect(items[0]).toBe("line 3");
    expect(items[7]).toBe("line 10");
    expect(screen.queryByText("line 1")).toBeNull();
    expect(screen.queryByText("line 2")).toBeNull();
  });

  it("drops the oldest visible line when a fifth event arrives", () => {
    seq = 0;
    const events = [
      activity("Planning the research approach…"),
      activity("Searching the public web…"),
      activity("Searching Membership.io transcripts…"),
      activity("Waiting for transcript retrieval…"),
      activity("Received 5 transcript sources."),
    ];
    render(<WorkerActivityFeed events={events} label="Research activity" />);
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toHaveLength(4);
    // Oldest line is gone; newest is at the bottom.
    expect(items).toEqual([
      "Searching the public web…",
      "Searching Membership.io transcripts…",
      "Waiting for transcript retrieval…",
      "Received 5 transcript sources.",
    ]);
    expect(screen.queryByText("Planning the research approach…")).toBeNull();
  });

  it("orders by sequence regardless of array order", () => {
    const events: ProgressEventRow[] = [
      { id: "b", sequence: 2, eventType: "worker_activity", message: "second", createdAt: 2, metadata: null },
      { id: "a", sequence: 1, eventType: "worker_activity", message: "first", createdAt: 1, metadata: null },
      { id: "c", sequence: 3, eventType: "worker_activity", message: "third", createdAt: 3, metadata: null },
    ];
    render(<WorkerActivityFeed events={events} label="Retrieval activity" />);
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual(["first", "second", "third"]);
  });

  it("only renders worker_activity events, ignoring technical progress rows", () => {
    seq = 0;
    const events: ProgressEventRow[] = [
      { id: "t1", sequence: 1, eventType: "task_claimed", message: "Claimed.", createdAt: 1, metadata: null },
      { id: "t2", sequence: 2, eventType: "tool_progress", message: "retrieving", createdAt: 2, metadata: null },
      activity("Searching approved vault notes…"),
    ];
    render(<WorkerActivityFeed events={events} label="Retrieval activity" />);
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual(["Searching approved vault notes…"]);
  });

  it("renders the fallback when there are no worker_activity events", () => {
    const events: ProgressEventRow[] = [
      { id: "t1", sequence: 1, eventType: "task_started", message: "Started.", createdAt: 1, metadata: null },
    ];
    render(
      <WorkerActivityFeed
        events={events}
        label="Research activity"
        fallback={<p data-testid="fallback">technical progress</p>}
      />,
    );
    expect(screen.getByTestId("fallback")).toBeInTheDocument();
    expect(screen.queryByLabelText("Research activity")).toBeNull();
  });

  it("renders nothing (no fallback) for undefined events", () => {
    const { container } = render(
      <WorkerActivityFeed events={undefined} label="Retrieval activity" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("clamps overly long messages defensively", () => {
    seq = 0;
    const long = "x".repeat(5000);
    render(<WorkerActivityFeed events={[activity(long)]} label="Retrieval activity" />);
    const text = screen.getByRole("listitem").textContent ?? "";
    expect(text.length).toBeLessThanOrEqual(WORKER_ACTIVITY_LIMITS.maxMessageLength);
  });

  it("never executes raw HTML in a message", () => {
    seq = 0;
    const evil = '<img src=x onerror="window.__pwned=1"> and <script>alert(1)</script>';
    const { container } = render(
      <WorkerActivityFeed events={[activity(evil)]} label="Retrieval activity" />,
    );
    // No live nodes were created — the payload is rendered as inert text.
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByRole("listitem").textContent).toContain("onerror");
  });

  it("exposes an accessible live region labelled by surface", () => {
    seq = 0;
    render(<WorkerActivityFeed events={[activity("Drafting the final report…")]} label="Research activity" />);
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveAttribute("aria-label", "Research activity");
  });
});
