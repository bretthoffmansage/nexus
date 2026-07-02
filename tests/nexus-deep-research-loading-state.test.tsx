// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/convex/_generated/api";
import { ResearchWorkspace } from "@/components/workspace/port/ResearchWorkspace";
import { nexusDeepResearch } from "@/lib/nexus/deepResearchClient";

const authState = vi.hoisted(() => ({
  isLoading: true,
  isAuthenticated: false,
  isRefreshing: false,
}));

const queryCalls = vi.hoisted(() => [] as Array<{ fn: unknown; args: unknown }>);
const queryResults = vi.hoisted(() => new Map<unknown, unknown>());
const mutationFn = vi.hoisted(() => vi.fn());

vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex/react")>()),
  useQuery: (fn: unknown, args: unknown) => {
    queryCalls.push({ fn, args });
    if (args === "skip") return undefined;
    if (queryResults.has(fn)) return queryResults.get(fn);
    return undefined;
  },
  useMutation: () => mutationFn,
  useConvexAuth: () => ({ ...authState }),
}));

function lastCallFor(fn: unknown) {
  const calls = queryCalls.filter((call) => call.fn === fn);
  return calls[calls.length - 1];
}

function seedEmptyHistory() {
  queryResults.set(nexusDeepResearch.listMyDeepResearchTasks, { tasks: [], nextCursor: null });
  queryResults.set(nexusDeepResearch.connectorStatus, { state: "offline" });
}

beforeEach(() => {
  queryCalls.length = 0;
  queryResults.clear();
  mutationFn.mockClear();
  authState.isLoading = true;
  authState.isAuthenticated = false;
  authState.isRefreshing = false;
});

describe("Deep Research loading state repair", () => {
  it("skips listMyDeepResearchTasks while Convex auth is initializing", () => {
    authState.isLoading = true;
    authState.isAuthenticated = false;
    render(<ResearchWorkspace />);
    expect(lastCallFor(nexusDeepResearch.listMyDeepResearchTasks)?.args).toBe("skip");
    expect(screen.getByText("Loading research state…")).toBeInTheDocument();
  });

  it("starts the list query after private-query readiness", () => {
    authState.isLoading = false;
    authState.isAuthenticated = true;
    seedEmptyHistory();
    render(<ResearchWorkspace />);
    expect(lastCallFor(nexusDeepResearch.listMyDeepResearchTasks)?.args).toEqual({ limit: 20 });
  });

  it("does not invoke the private list query when signed out", () => {
    authState.isLoading = false;
    authState.isAuthenticated = false;
    render(<ResearchWorkspace />);
    expect(lastCallFor(nexusDeepResearch.listMyDeepResearchTasks)?.args).toBe("skip");
    expect(screen.getAllByText("Sign in to view research history.")).toHaveLength(2);
  });

  it("resolves an empty task list to deliberate empty states", () => {
    authState.isLoading = false;
    authState.isAuthenticated = true;
    seedEmptyHistory();
    render(<ResearchWorkspace />);
    expect(screen.getByText("No research is currently running.")).toBeInTheDocument();
    expect(screen.getByText("No research runs yet.")).toBeInTheDocument();
    expect(screen.queryByText("Loading research state…")).not.toBeInTheDocument();
  });

  it("does not treat no active task as indefinite loading when detail query is skipped", () => {
    authState.isLoading = false;
    authState.isAuthenticated = true;
    seedEmptyHistory();
    render(<ResearchWorkspace />);
    expect(lastCallFor(nexusDeepResearch.getMyTask)?.args).toBe("skip");
    expect(screen.queryByText("Loading research state…")).not.toBeInTheDocument();
  });

  it("renders existing recent tasks and loads detail for a selected task", () => {
    authState.isLoading = false;
    authState.isAuthenticated = true;
    const taskId = "task_123" as never;
    queryResults.set(nexusDeepResearch.listMyDeepResearchTasks, {
      tasks: [
        {
          id: taskId,
          requestedToolId: "research.hermes_deep_research",
          requestText: "Summarize onboarding",
          status: "completed",
          queueSequence: 1,
          attemptNumber: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          queuedAt: Date.now(),
          claimedAt: null,
          startedAt: null,
          completedAt: Date.now(),
          failedAt: null,
          cancelledAt: null,
          resultSummary: null,
          errorCode: null,
          errorMessage: null,
          researchRequestId: "nexus-research_test",
          idempotencyKey: "nexus-research-run_test",
        },
      ],
      nextCursor: null,
    });
    queryResults.set(nexusDeepResearch.connectorStatus, { state: "offline" });
    queryResults.set(nexusDeepResearch.getMyTask, {
      id: taskId,
      requestedToolId: "research.hermes_deep_research",
      requestText: "Summarize onboarding",
      status: "completed",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    queryResults.set(nexusDeepResearch.getMyTaskResult, null);
    queryResults.set(nexusDeepResearch.listMyTaskSources, []);
    queryResults.set(nexusDeepResearch.listMyTaskProgress, []);

    render(<ResearchWorkspace />);
    expect(screen.getAllByText("Summarize onboarding").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("No research runs yet.")).not.toBeInTheDocument();
  });

  it("shows a bounded error when detail task data is unavailable after selection", () => {
    authState.isLoading = false;
    authState.isAuthenticated = true;
    const taskId = "task_missing" as never;
    queryResults.set(nexusDeepResearch.listMyDeepResearchTasks, {
      tasks: [
        {
          id: taskId,
          requestedToolId: "research.hermes_deep_research",
          requestText: "Missing detail",
          status: "completed",
          queueSequence: 1,
          attemptNumber: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          queuedAt: Date.now(),
          claimedAt: null,
          startedAt: null,
          completedAt: Date.now(),
          failedAt: null,
          cancelledAt: null,
          resultSummary: null,
          errorCode: null,
          errorMessage: null,
          researchRequestId: "nexus-research_test",
          idempotencyKey: "nexus-research-run_test",
        },
      ],
      nextCursor: null,
    });
    queryResults.set(nexusDeepResearch.connectorStatus, { state: "offline" });
    queryResults.set(nexusDeepResearch.getMyTask, null);

    render(<ResearchWorkspace />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load this research task.");
  });

  it("still renders task history when the Connector is offline", () => {
    authState.isLoading = false;
    authState.isAuthenticated = true;
    queryResults.set(nexusDeepResearch.listMyDeepResearchTasks, {
      tasks: [
        {
          id: "task_offline" as never,
          requestedToolId: "research.hermes_deep_research",
          requestText: "Offline history row",
          status: "queued",
          queueSequence: 1,
          attemptNumber: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          queuedAt: Date.now(),
          claimedAt: null,
          startedAt: null,
          completedAt: null,
          failedAt: null,
          cancelledAt: null,
          resultSummary: null,
          errorCode: null,
          errorMessage: null,
          researchRequestId: "nexus-research_test",
          idempotencyKey: "nexus-research-run_test",
        },
      ],
      nextCursor: null,
    });
    queryResults.set(nexusDeepResearch.connectorStatus, { state: "offline" });
    queryResults.set(nexusDeepResearch.getMyTask, {
      id: "task_offline",
      requestedToolId: "research.hermes_deep_research",
      requestText: "Offline history row",
      status: "queued",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    queryResults.set(nexusDeepResearch.getMyTaskResult, null);
    queryResults.set(nexusDeepResearch.listMyTaskSources, []);
    queryResults.set(nexusDeepResearch.listMyTaskProgress, []);

    render(<ResearchWorkspace />);
    expect(screen.getByText(/Connector offline/i)).toBeInTheDocument();
    expect(screen.getAllByText("Offline history row").length).toBeGreaterThanOrEqual(1);
  });

  it("does not submit research on page load", () => {
    authState.isLoading = false;
    authState.isAuthenticated = true;
    seedEmptyHistory();
    render(<ResearchWorkspace />);
    expect(mutationFn).not.toHaveBeenCalled();
    expect(api.deepResearch.submitDeepResearch).toBeTruthy();
  });
});
