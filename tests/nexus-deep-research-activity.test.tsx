// @vitest-environment jsdom
import { render, screen, fireEvent, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResearchWorkspace } from "@/components/workspace/port/ResearchWorkspace";
import { nexusDeepResearch } from "@/lib/nexus/deepResearchClient";

const authState = vi.hoisted(() => ({ isLoading: false, isAuthenticated: true, isRefreshing: false }));
const queryResults = vi.hoisted(() => new Map<unknown, unknown>());
const mutationFn = vi.hoisted(() => vi.fn());

vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex/react")>()),
  useQuery: (fn: unknown, args: unknown) => {
    if (args === "skip") return undefined;
    return queryResults.has(fn) ? queryResults.get(fn) : undefined;
  },
  useMutation: () => mutationFn,
  useConvexAuth: () => ({ ...authState }),
}));

const CATALOG = { ok: true, cacheStatus: "fresh", models: [] };

const TECHNICAL_ONLY = [
  { id: "e1", sequence: 1, eventType: "task_created", createdAt: 1, metadata: null },
  { id: "e2", sequence: 2, eventType: "task_started", createdAt: 2, metadata: null },
  { id: "e3", sequence: 3, eventType: "tool_progress", message: "searching", createdAt: 3, metadata: null },
];

function act(id: string, sequence: number, message: string, status = "running", worker = "hermes") {
  return {
    id,
    sequence,
    eventType: "worker_activity",
    message,
    createdAt: sequence,
    metadata: { status, worker, surface: "deep_research" },
  };
}

// Nine activity events so the 8-line Deep Research window drops the oldest.
const ACTIVITY_EVENTS = [
  ...TECHNICAL_ONLY,
  act("a1", 4, "Planning the research approach…", "started", "system"),
  act("a2", 5, "Searching available research sources…"),
  act("a3", 6, "Reviewing transcripts with the Cursor worker…", "running", "cursor_cli"),
  act("a4", 7, "Received 5 transcript sources.", "running", "system"),
  act("a5", 8, "Searching the SAGE Knowledge Vault…"),
  act("a6", 9, "Reviewing retrieved evidence…"),
  act("a7", 10, "Drafting the final report…"),
  act("a8", 11, "Reviewed 12 research sources."),
  act("a9", 12, "Finalizing the report…"),
];

function seed({
  status,
  errorMessage = null,
  result = null,
  progress = ACTIVITY_EVENTS,
  requestText = "Research question",
}: {
  status: string;
  errorMessage?: string | null;
  result?: unknown;
  progress?: unknown[];
  requestText?: string;
}) {
  const task = {
    id: "task_1",
    requestedToolId: "research.hermes_deep_research",
    requestText,
    status,
    queueSequence: 1,
    attemptNumber: 1,
    createdAt: 1000,
    updatedAt: 1000,
    completedAt: status === "completed" ? 2000 : null,
    errorCode: null,
    errorMessage,
    researchRequestId: "nexus-research_1",
    requestedModelId: null,
    idempotencyKey: "nexus-research-run_1",
    fromCalendar: false,
  };
  queryResults.set(nexusDeepResearch.listMyDeepResearchTasks, { tasks: [task], nextCursor: null });
  queryResults.set(nexusDeepResearch.connectorStatus, { state: "online_idle" });
  queryResults.set(nexusDeepResearch.getMyTask, task);
  queryResults.set(nexusDeepResearch.getMyTaskResult, result);
  queryResults.set(nexusDeepResearch.listMyTaskSources, []);
  queryResults.set(nexusDeepResearch.listMyTaskProgress, progress);
}

const activityRegion = () => screen.queryByRole("status", { name: "Research activity" });
const progressHeading = () => screen.queryByRole("heading", { name: "Progress" });

beforeEach(() => {
  queryResults.clear();
  mutationFn.mockReset();
  authState.isLoading = false;
  authState.isAuthenticated = true;
  authState.isRefreshing = false;
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => CATALOG }) as unknown as Response));
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("Deep Research — live activity readback while running", () => {
  it("shows the latest eight activity lines and supersedes the technical Progress list", () => {
    seed({ status: "running" });
    render(<ResearchWorkspace />);
    const region = activityRegion();
    expect(region).toBeInTheDocument();
    // Rich activity present → the verbose technical Progress chip list is hidden.
    expect(progressHeading()).not.toBeInTheDocument();
    const lines = within(region!).getAllByRole("listitem").map((li) => li.textContent);
    // Latest eight, in order — including the broker-forwarded Hermes tool activity.
    expect(lines).toEqual([
      "Searching available research sources…",
      "Reviewing transcripts with the Cursor worker…",
      "Received 5 transcript sources.",
      "Searching the SAGE Knowledge Vault…",
      "Reviewing retrieved evidence…",
      "Drafting the final report…",
      "Reviewed 12 research sources.",
      "Finalizing the report…",
    ]);
    expect(lines).toHaveLength(8);
    // The dropped oldest line is not shown.
    expect(screen.queryByText("Planning the research approach…")).toBeNull();
  });

  it("falls back to the technical Progress list when no activity events exist", () => {
    seed({ status: "running", progress: TECHNICAL_ONLY });
    render(<ResearchWorkspace />);
    expect(activityRegion()).not.toBeInTheDocument();
    expect(progressHeading()).toBeInTheDocument();
  });
});

describe("Deep Research — activity visibility by terminal state", () => {
  it("hides activity once the run is successfully completed", () => {
    seed({ status: "completed", result: { answerText: "Final report.", format: "markdown" } });
    render(<ResearchWorkspace />);
    expect(activityRegion()).not.toBeInTheDocument();
    expect(progressHeading()).not.toBeInTheDocument();
    expect(screen.getByText(/Final report\./)).toBeInTheDocument();
  });

  it("retains activity for a failed run alongside the failure detail", () => {
    seed({ status: "failed", errorMessage: "Research tool policy validation failed." });
    render(<ResearchWorkspace />);
    expect(activityRegion()).toBeInTheDocument();
    expect(screen.getByText("Research tool policy validation failed.")).toBeInTheDocument();
  });
});

describe("Deep Research — historical tasks", () => {
  it("hides activity for a successfully completed historical task", () => {
    seed({
      status: "completed",
      requestText: "Completed historical run",
      result: { answerText: "Historical report.", format: "markdown" },
    });
    render(<ResearchWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    fireEvent.click(screen.getByRole("button", { name: /Completed historical run/ }));
    expect(activityRegion()).not.toBeInTheDocument();
    expect(screen.getByText(/Historical report\./)).toBeInTheDocument();
  });

  it("shows stored activity for a failed historical task", () => {
    seed({ status: "failed", requestText: "Failed historical run", errorMessage: "It failed." });
    render(<ResearchWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    fireEvent.click(screen.getByRole("button", { name: /Failed historical run/ }));
    expect(activityRegion()).toBeInTheDocument();
  });

  it("is presentation-only — renders activity without issuing a mutation", () => {
    seed({ status: "running" });
    render(<ResearchWorkspace />);
    expect(mutationFn).not.toHaveBeenCalled();
  });
});
