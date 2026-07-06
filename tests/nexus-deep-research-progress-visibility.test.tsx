// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResearchWorkspace } from "@/components/workspace/port/ResearchWorkspace";
import { nexusDeepResearch } from "@/lib/nexus/deepResearchClient";
import { isSuccessfullyCompletedResearchTask } from "@/lib/nexus/deepResearchView";

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

const PROGRESS_EVENTS = [
  { id: "e1", eventType: "task_created" },
  { id: "e2", eventType: "task_queued" },
  { id: "e3", eventType: "task_claimed" },
  { id: "e4", eventType: "task_started" },
  { id: "e5", eventType: "tool_progress", message: "searching" },
  { id: "e6", eventType: "tool_progress", message: "reading" },
  { id: "e7", eventType: "task_completed" },
];

type SeedOpts = {
  status: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  result?: unknown;
  progress?: Array<{ id: string; eventType: string; message?: string }>;
  requestText?: string;
};

function seed({
  status,
  errorCode = null,
  errorMessage = null,
  result = null,
  progress = PROGRESS_EVENTS,
  requestText = "Research question",
}: SeedOpts) {
  const task = {
    id: "task_1",
    requestedToolId: "research.hermes_deep_research",
    requestText,
    status,
    queueSequence: 1,
    attemptNumber: 1,
    createdAt: 1000,
    updatedAt: 1000,
    queuedAt: 1000,
    claimedAt: null,
    startedAt: null,
    completedAt: status === "completed" ? 2000 : null,
    failedAt: null,
    cancelledAt: null,
    resultSummary: null,
    errorCode,
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

const progressHeading = () => screen.queryByRole("heading", { name: "Progress" });

beforeEach(() => {
  queryResults.clear();
  mutationFn.mockReset();
  authState.isLoading = false;
  authState.isAuthenticated = true;
  authState.isRefreshing = false;
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => CATALOG }) as unknown as Response),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("Deep Research Progress — visible while not successfully completed", () => {
  it("shows Progress for a queued run", () => {
    seed({ status: "queued" });
    render(<ResearchWorkspace />);
    expect(progressHeading()).toBeInTheDocument();
    expect(screen.getByText("task_created")).toBeInTheDocument();
  });

  it("shows Progress for a running run", () => {
    seed({ status: "running" });
    render(<ResearchWorkspace />);
    expect(progressHeading()).toBeInTheDocument();
  });

  it("keeps tool-progress rows visible during execution", () => {
    seed({ status: "running" });
    render(<ResearchWorkspace />);
    expect(progressHeading()).toBeInTheDocument();
    expect(screen.getAllByText("tool_progress").length).toBeGreaterThanOrEqual(1);
  });

  it("shows Progress for a failed run", () => {
    seed({ status: "failed", errorMessage: "Research tool policy validation failed." });
    render(<ResearchWorkspace />);
    expect(progressHeading()).toBeInTheDocument();
    // Failure detail preserved alongside Progress.
    expect(screen.getByText("Research tool policy validation failed.")).toBeInTheDocument();
  });

  it("shows Progress for a blocked run", () => {
    seed({ status: "failed", errorCode: "research_disabled", errorMessage: "Deep Research is disabled." });
    render(<ResearchWorkspace />);
    expect(progressHeading()).toBeInTheDocument();
  });

  it("shows Progress for a cancelled run", () => {
    seed({ status: "cancelled" });
    render(<ResearchWorkspace />);
    expect(progressHeading()).toBeInTheDocument();
  });

  it("does not hide Progress when a task_completed event exists but the task is not successful", () => {
    // Status is still running even though a stray task_completed checkpoint exists.
    seed({ status: "running", progress: PROGRESS_EVENTS });
    render(<ResearchWorkspace />);
    expect(progressHeading()).toBeInTheDocument();
    expect(screen.getByText("task_completed")).toBeInTheDocument();
  });
});

describe("Deep Research Progress — hidden once successfully completed", () => {
  it("hides the Progress heading and every checkpoint row", () => {
    seed({
      status: "completed",
      result: { answerText: "Final report body.", format: "markdown" },
    });
    render(<ResearchWorkspace />);
    expect(progressHeading()).not.toBeInTheDocument();
    expect(screen.queryByText("task_created")).not.toBeInTheDocument();
    expect(screen.queryByText("tool_progress")).not.toBeInTheDocument();
    expect(screen.queryByText("task_completed")).not.toBeInTheDocument();
  });

  it("keeps the completed report fully rendered after Progress is hidden", () => {
    seed({
      status: "completed",
      result: { answerText: "The completed report content.", format: "markdown" },
    });
    render(<ResearchWorkspace />);
    expect(screen.getByText(/The completed report content\./)).toBeInTheDocument();
    expect(progressHeading()).not.toBeInTheDocument();
  });

  it("does not mutate or delete task/progress data when rendering a completed run", () => {
    seed({
      status: "completed",
      result: { answerText: "Body", format: "markdown" },
    });
    render(<ResearchWorkspace />);
    // Presentation-only: no mutation is issued, and the stored progress query
    // still holds all seeded events.
    expect(mutationFn).not.toHaveBeenCalled();
    expect(queryResults.get(nexusDeepResearch.listMyTaskProgress)).toHaveLength(PROGRESS_EVENTS.length);
  });
});

describe("Deep Research Progress — historical tasks opened from History", () => {
  it("hides Progress for a successfully completed historical task", () => {
    seed({
      status: "completed",
      requestText: "Completed historical run",
      result: { answerText: "Historical report body.", format: "markdown" },
    });
    render(<ResearchWorkspace />);

    fireEvent.click(screen.getByRole("button", { name: "History" }));
    fireEvent.click(screen.getByRole("button", { name: /Completed historical run/ }));

    expect(screen.getByText(/Historical report body\./)).toBeInTheDocument();
    expect(progressHeading()).not.toBeInTheDocument();
  });

  it("still shows Progress for a failed historical task", () => {
    seed({
      status: "failed",
      requestText: "Failed historical run",
      errorMessage: "It failed for a reason.",
    });
    render(<ResearchWorkspace />);

    fireEvent.click(screen.getByRole("button", { name: "History" }));
    fireEvent.click(screen.getByRole("button", { name: /Failed historical run/ }));

    expect(progressHeading()).toBeInTheDocument();
    expect(screen.getByText("It failed for a reason.")).toBeInTheDocument();
  });
});

describe("isSuccessfullyCompletedResearchTask — canonical success predicate", () => {
  it("is true only for a completed status with no failure/blocked outcome", () => {
    expect(isSuccessfullyCompletedResearchTask({ taskStatus: "completed" })).toBe(true);
    expect(isSuccessfullyCompletedResearchTask({ taskStatus: "running" })).toBe(false);
    expect(isSuccessfullyCompletedResearchTask({ taskStatus: "queued" })).toBe(false);
    expect(isSuccessfullyCompletedResearchTask({ taskStatus: "failed" })).toBe(false);
    expect(
      isSuccessfullyCompletedResearchTask({ taskStatus: "failed", errorCode: "research_disabled" }),
    ).toBe(false);
    expect(isSuccessfullyCompletedResearchTask({ taskStatus: "cancelled" })).toBe(false);
    expect(isSuccessfullyCompletedResearchTask({ taskStatus: null })).toBe(false);
  });
});
