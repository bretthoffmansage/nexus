// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResearchWorkspace } from "@/components/workspace/port/ResearchWorkspace";
import { nexusDeepResearch } from "@/lib/nexus/deepResearchClient";
import { buildDeepResearchTaskMetadata } from "@/convex/lib/deepResearchConfig";
import { composeDeepResearchRequestText as compose } from "@/lib/nexus/deepResearchRequestCompose";

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

const CATALOG = {
  ok: true,
  cacheStatus: "fresh",
  models: [
    {
      id: "anthropic/claude-sonnet-4.6",
      name: "Claude Sonnet 4.6",
      provider: "anthropic",
      contextWindow: 200000,
      pricing: { input: "0.000003", output: "0.000015" },
      capabilities: ["text"],
    },
  ],
};

function taskRow(overrides: Record<string, unknown>) {
  return {
    id: "task_seed",
    requestedToolId: "research.hermes_deep_research",
    requestText: "Seed request",
    status: "completed",
    queueSequence: 1,
    attemptNumber: 1,
    createdAt: 1000,
    updatedAt: 1000,
    queuedAt: 1000,
    claimedAt: null,
    startedAt: null,
    completedAt: 1000,
    failedAt: null,
    cancelledAt: null,
    resultSummary: null,
    errorCode: null,
    errorMessage: null,
    researchRequestId: "nexus-research_seed",
    requestedModelId: null,
    idempotencyKey: "nexus-research-run_seed",
    fromCalendar: false,
    ...overrides,
  };
}

function seedList(tasks: Array<Record<string, unknown>>) {
  queryResults.set(nexusDeepResearch.listMyDeepResearchTasks, { tasks, nextCursor: null });
  queryResults.set(nexusDeepResearch.connectorStatus, { state: "online_idle" });
}

function seedDetail(task: Record<string, unknown> | null, result: unknown = null) {
  queryResults.set(nexusDeepResearch.getMyTask, task);
  queryResults.set(nexusDeepResearch.getMyTaskResult, result);
  queryResults.set(nexusDeepResearch.listMyTaskSources, []);
  queryResults.set(nexusDeepResearch.listMyTaskProgress, []);
}

beforeEach(() => {
  queryResults.clear();
  mutationFn.mockReset();
  mutationFn.mockResolvedValue({
    taskId: "task_new",
    duplicate: false,
    status: "queued",
    queueSequence: 9,
    attemptNumber: 1,
  });
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

async function typeRequest(value: string) {
  fireEvent.change(screen.getByLabelText("Research request"), { target: { value } });
}

describe("Deep Research — buttons", () => {
  it("does not render the left New request button", () => {
    seedList([]);
    seedDetail(null);
    render(<ResearchWorkspace />);
    expect(screen.queryByRole("button", { name: "New request" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Research" })).toBeInTheDocument();
  });

  it("shows Try again (not Start new run) for a failed run", () => {
    const failed = taskRow({ id: "task_failed", status: "failed", errorMessage: "Research tool policy validation failed." });
    seedList([failed]);
    seedDetail(failed);
    render(<ResearchWorkspace />);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start new run" })).not.toBeInTheDocument();
    // Detailed failure message preserved.
    expect(screen.getByText("Research tool policy validation failed.")).toBeInTheDocument();
  });

  it("does not show Try again for a completed run", () => {
    const done = taskRow({ id: "task_done", status: "completed" });
    seedList([done]);
    seedDetail(done, { answerText: "Report body", format: "markdown" });
    render(<ResearchWorkspace />);
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start new run" })).not.toBeInTheDocument();
  });
});

describe("Deep Research — standalone submission", () => {
  it("mints a fresh researchRequestId + idempotencyKey and sends exactly the contract keys", async () => {
    localStorage.setItem("nexus.deepResearch.researchRequestId", "nexus-research_STALE");
    localStorage.setItem("nexus.deepResearch.idempotencyKey", "nexus-research-run_STALE");
    seedList([]);
    seedDetail(null);
    render(<ResearchWorkspace />);
    await typeRequest("What drives retention?");
    fireEvent.click(screen.getByRole("button", { name: "Research" }));

    await waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1));
    const args = mutationFn.mock.calls[0][0] as Record<string, string>;
    // New identifiers, not the stale stored ones.
    expect(args.researchRequestId).not.toBe("nexus-research_STALE");
    expect(args.idempotencyKey).not.toBe("nexus-research-run_STALE");
    expect(args.researchRequestId).toMatch(/^nexus-research_/);
    expect(args.idempotencyKey).toMatch(/^nexus-research-run_/);
    // No continuation metadata — only the three allowed submission fields.
    expect(Object.keys(args).sort()).toEqual(["idempotencyKey", "requestText", "researchRequestId"]);
    // The current left-form request is what gets submitted (composed with rules).
    expect(args.requestText).toContain("What drives retention?");
  });

  it("does not reuse a selected historical task's identifiers on a new submission", async () => {
    const past = taskRow({
      id: "task_past",
      status: "failed",
      errorMessage: "old failure",
      researchRequestId: "nexus-research_past",
      idempotencyKey: "nexus-research-run_past",
    });
    seedList([past]);
    seedDetail(past);
    render(<ResearchWorkspace />);

    // Open history and select the past run (right panel shows it read-only).
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    fireEvent.click(screen.getByRole("button", { name: /Seed request/ }));

    await typeRequest("A brand new question");
    fireEvent.click(screen.getByRole("button", { name: "Research" }));

    await waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1));
    const args = mutationFn.mock.calls[0][0] as Record<string, string>;
    expect(args.researchRequestId).not.toBe("nexus-research_past");
    expect(args.idempotencyKey).not.toBe("nexus-research-run_past");
    expect(args.requestText).toContain("A brand new question");
  });

  it("creates exactly one task per intentional click (no duplicate on double-click)", async () => {
    seedList([]);
    seedDetail(null);
    render(<ResearchWorkspace />);
    await typeRequest("One click only");
    const btn = screen.getByRole("button", { name: "Research" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1));
  });

  it("clears historical selection and shows the new task, closing History", async () => {
    const past = taskRow({ id: "task_past", status: "completed" });
    seedList([past]);
    seedDetail(past, { answerText: "old report", format: "markdown" });
    render(<ResearchWorkspace />);

    const toggle = screen.getByRole("button", { name: "History" });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    await typeRequest("Fresh run");
    fireEvent.click(screen.getByRole("button", { name: "Research" }));

    await waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1));
    // History closes on submission.
    await waitFor(() => expect(toggle).toHaveAttribute("aria-expanded", "false"));
  });
});

describe("Deep Research — retry", () => {
  it("re-submits the failed task's request content with new identifiers, without mutating it", async () => {
    const failedText = compose("Investigate topic X", "No secrets");
    const failed = taskRow({
      id: "task_failed",
      status: "failed",
      errorMessage: "Research tool policy validation failed.",
      requestText: failedText,
      researchRequestId: "nexus-research_failed",
      idempotencyKey: "nexus-research-run_failed",
    });
    seedList([failed]);
    seedDetail(failed);
    render(<ResearchWorkspace />);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1));
    const args = mutationFn.mock.calls[0][0] as Record<string, string>;
    // Same request content (composed request + report rules) preserved verbatim.
    expect(args.requestText).toBe(failedText);
    expect(args.requestText.split("RULES FOR REPORT:").length - 1).toBe(1);
    // Brand-new execution identity — never reuses the failed run's identifiers.
    expect(args.researchRequestId).not.toBe("nexus-research_failed");
    expect(args.idempotencyKey).not.toBe("nexus-research-run_failed");
    expect(args.researchRequestId).toMatch(/^nexus-research_/);
    expect(args.idempotencyKey).toMatch(/^nexus-research-run_/);
    // Only the three submission fields — no failed task id, no continuation.
    expect(Object.keys(args).sort()).toEqual(["idempotencyKey", "requestText", "researchRequestId"]);
  });

  it("does not create duplicate retries on double-click", async () => {
    const failed = taskRow({ id: "task_failed", status: "failed", errorMessage: "boom" });
    seedList([failed]);
    seedDetail(failed);
    render(<ResearchWorkspace />);
    const btn = screen.getByRole("button", { name: "Try again" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1));
  });

  it("keeps the failed run listed in History (immutable, retryable from there)", () => {
    const failed = taskRow({ id: "task_failed", status: "failed", errorMessage: "boom", requestText: "Retryable request text" });
    seedList([failed]);
    seedDetail(failed);
    const { container } = render(<ResearchWorkspace />);
    // The failed run is listed in the history drawer panel.
    const drawer = container.querySelector("#research-history-panel");
    expect(drawer?.textContent).toContain("Retryable request text");
  });
});

describe("Deep Research — history", () => {
  it("removes the inline Recent Research list from the right result panel", () => {
    const done = taskRow({ id: "task_done", status: "completed" });
    seedList([done]);
    seedDetail(done, { answerText: "body", format: "markdown" });
    const { container } = render(<ResearchWorkspace />);
    const rightPanel = container.querySelector(".research-jobs");
    expect(rightPanel?.textContent).not.toContain("Recent research");
    expect(rightPanel?.querySelector(".research-job-list")).toBeNull();
  });

  it("renders a History trigger wired to the Chat-style drawer shell", () => {
    seedList([]);
    seedDetail(null);
    const { container } = render(<ResearchWorkspace />);
    const toggle = screen.getByRole("button", { name: "History" });
    expect(toggle).toHaveAttribute("aria-controls", "research-history-panel");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    // Reuses the proven Chat history drawer shell.
    const shell = container.querySelector("#research-history-panel");
    expect(shell).not.toBeNull();
    expect(shell?.className).toContain("nexus-chat-history-shell");
  });

  it("lists direct and Calendar-created research, newest first, in the drawer", () => {
    const calendarTask = taskRow({
      id: "task_cal",
      requestText: "Calendar sourced research",
      createdAt: 3000,
      fromCalendar: true,
    });
    const directTask = taskRow({
      id: "task_direct",
      requestText: "Direct page research",
      createdAt: 2000,
      fromCalendar: false,
    });
    // Query returns newest-first; the UI preserves that order.
    seedList([calendarTask, directTask]);
    seedDetail(calendarTask, { answerText: "b", format: "markdown" });
    const { container } = render(<ResearchWorkspace />);
    const items = container.querySelectorAll("#research-history-panel .research-history-item");
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain("Calendar sourced research");
    expect(items[0].textContent).toContain("Calendar"); // source indicator
    expect(items[1].textContent).toContain("Direct page research");
  });

  it("opening history preserves the current unsent draft and creates no task", async () => {
    const past = taskRow({ id: "task_past", status: "completed", requestText: "Past run" });
    seedList([past]);
    seedDetail(past, { answerText: "old", format: "markdown" });
    render(<ResearchWorkspace />);

    fireEvent.change(screen.getByLabelText("Research request"), { target: { value: "My unsent draft" } });
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    const item = screen.getByRole("button", { name: /Past run/ });
    fireEvent.click(item);

    // Draft is untouched; no task was created by selecting history.
    expect(screen.getByLabelText("Research request")).toHaveValue("My unsent draft");
    expect(mutationFn).not.toHaveBeenCalled();
    // No continuation affordances exist.
    expect(screen.queryByRole("button", { name: /Continue|Reply|Resume|Reopen|Follow-?up|Add to/i })).not.toBeInTheDocument();
  });

  it("shows a bounded empty history state", () => {
    seedList([]);
    seedDetail(null);
    const { container } = render(<ResearchWorkspace />);
    const drawer = container.querySelector("#research-history-panel");
    expect(drawer?.textContent).toContain("No research runs yet.");
  });
});

describe("Deep Research — metadata contract", () => {
  it("bakes exactly the five governed metadata keys", () => {
    const md = buildDeepResearchTaskMetadata("nexus-research_x1234567", "nexus-research-run_y1234567");
    expect(Object.keys(md).sort()).toEqual([
      "explicitUserAction",
      "idempotencyKey",
      "kind",
      "researchRequestId",
      "sourcePage",
    ]);
    expect(md.kind).toBe("deep_research");
    expect(md.sourcePage).toBe("nexus_deep_research");
    expect(md.explicitUserAction).toBe("research");
  });
});
