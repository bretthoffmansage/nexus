// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResearchWorkspace } from "@/components/workspace/port/ResearchWorkspace";
import { nexusDeepResearch } from "@/lib/nexus/deepResearchClient";
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

const ROOT = path.resolve(__dirname, "..");
const CSS = readFileSync(path.join(ROOT, "styles/legacy-port.css"), "utf8");

// A composed canonical request (research request + Report rules) with clear line
// breaks so we can assert the modal preserves them and the panel clamps them.
const CANONICAL_REQUEST = compose(
  "Improve long-term retention for high-ticket coaching.\nLine two of the request.\nLine three.\nLine four should be clamped away in the preview.",
  "Do not include sensitive client information.",
);

function taskRow(overrides: Record<string, unknown>) {
  return {
    id: "task_seed",
    requestedToolId: "research.hermes_deep_research",
    requestText: CANONICAL_REQUEST,
    status: "completed",
    queueSequence: 1,
    attemptNumber: 1,
    createdAt: 1752000000000,
    updatedAt: 1752000100000,
    queuedAt: 1752000000000,
    claimedAt: null,
    startedAt: null,
    completedAt: 1752000100000,
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

function seedDetail(
  task: Record<string, unknown> | null,
  result: unknown = null,
  sources: unknown[] = [],
  progress: unknown[] = [],
) {
  queryResults.set(nexusDeepResearch.getMyTask, task);
  queryResults.set(nexusDeepResearch.getMyTaskResult, result);
  queryResults.set(nexusDeepResearch.listMyTaskSources, sources);
  queryResults.set(nexusDeepResearch.listMyTaskProgress, progress);
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
    vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, models: [] }) }) as unknown as Response),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const COMPLETED_RESULT = { answerText: "Report body text.", format: "markdown", model: "anthropic/claude-opus-4.6", durationMs: 388000 };

function requestCard(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>(".research-request-card");
  if (!el) throw new Error("request card not found");
  return el;
}
function responsePanel(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>(".research-response-panel");
  if (!el) throw new Error("response panel not found");
  return el;
}

describe("Deep Research — collapsed Request panel", () => {
  it("renders a Request panel using the selected task's canonical requestText", () => {
    const done = taskRow({});
    seedList([done]);
    seedDetail(done, COMPLETED_RESULT);
    const { container } = render(<ResearchWorkspace />);
    const card = requestCard(container);
    expect(within(card).getByText("Request")).toBeInTheDocument();
    // Canonical composed request (incl. Report rules) is the panel's source.
    expect(card.querySelector(".research-request-card-preview")?.textContent).toBe(CANONICAL_REQUEST);
  });

  it("clamps the preview to ~3 lines with no scrollbar and no growth", () => {
    const rule = CSS.match(/\.research-request-card-preview\s*\{[^}]*\}/)?.[0] ?? "";
    expect(rule).toMatch(/-webkit-line-clamp:\s*3/);
    expect(rule).toMatch(/display:\s*-webkit-box/);
    expect(rule).toMatch(/overflow:\s*hidden/); // no internal scrollbar; cannot grow
    expect(rule).not.toMatch(/overflow-y:\s*auto/);
    expect(rule).not.toMatch(/max-height/); // bounded purely by line count
  });

  it("does not duplicate the request body or Report rules in the lower response panel", () => {
    const done = taskRow({});
    seedList([done]);
    seedDetail(done, COMPLETED_RESULT);
    const { container } = render(<ResearchWorkspace />);
    const panel = responsePanel(container);
    expect(panel.textContent).not.toContain("Improve long-term retention");
    expect(panel.textContent).not.toContain("RULES FOR REPORT:");
    expect(panel.querySelector(".research-request-preview")).toBeNull();
  });

  it("shows only short requests compactly (fewer lines, no forced height)", () => {
    const done = taskRow({ requestText: "Short question." });
    seedList([done]);
    seedDetail(done, COMPLETED_RESULT);
    const { container } = render(<ResearchWorkspace />);
    expect(container.querySelector(".research-request-card-preview")?.textContent).toBe("Short question.");
  });
});

describe("Deep Research — windowless metadata row", () => {
  it("renders Submitted/Model/Duration directly beneath the Request card, not inside it", () => {
    const done = taskRow({});
    seedList([done]);
    seedDetail(done, COMPLETED_RESULT);
    const { container } = render(<ResearchWorkspace />);
    const block = container.querySelector<HTMLElement>(".research-request-block")!;
    const card = block.querySelector(".research-request-card")!;
    const meta = block.querySelector<HTMLElement>(".research-request-metabar")!;
    expect(meta).not.toBeNull();
    // DOM order: metadata row comes after the card, inside the same block.
    expect(card.compareDocumentPosition(meta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(meta.textContent).toContain("Submitted");
    expect(meta.textContent).toContain("Model");
    expect(meta.textContent).toContain("Duration");
    expect(meta.textContent).toContain("anthropic/claude-opus-4.6");
    // Not inside the Request card.
    expect(card.textContent).not.toContain("Submitted");
    expect(card.textContent).not.toContain("Model");
  });

  it("keeps Submitted/Model/Duration out of the lower response panel", () => {
    const done = taskRow({});
    seedList([done]);
    seedDetail(done, COMPLETED_RESULT);
    const { container } = render(<ResearchWorkspace />);
    const panel = responsePanel(container);
    expect(panel.textContent).not.toContain("Submitted");
    expect(panel.textContent).not.toContain("Duration");
    expect(panel.querySelector(".nexus-task-meta")).toBeNull();
  });

  it("styles the metadata row windowless (no border/background/shadow/radius)", () => {
    const rule = CSS.match(/\.research-request-metabar\s*\{[^}]*\}/)?.[0] ?? "";
    expect(rule).not.toMatch(/border/);
    expect(rule).not.toMatch(/background/);
    expect(rule).not.toMatch(/box-shadow/);
    expect(rule).not.toMatch(/radius/);
  });

  it("omits Duration for an active run with no completed duration", () => {
    const active = taskRow({ id: "task_active", status: "running", completedAt: null });
    seedList([active]);
    seedDetail(active, null); // no result yet
    const { container } = render(<ResearchWorkspace />);
    const meta = container.querySelector<HTMLElement>(".research-request-metabar")!;
    expect(meta.textContent).toContain("Submitted");
    expect(meta.textContent).not.toContain("Duration");
    expect(meta.textContent).not.toContain("Model");
  });
});

describe("Deep Research — Request detail modal", () => {
  function openModal(container: HTMLElement) {
    fireEvent.click(requestCard(container));
    return screen.getByRole("dialog");
  }

  it("opens the modal on click and shows the full canonical request incl. rules", () => {
    const done = taskRow({});
    seedList([done]);
    seedDetail(done, COMPLETED_RESULT);
    const { container } = render(<ResearchWorkspace />);
    expect(screen.queryByRole("dialog")).toBeNull(); // starts collapsed
    const dialog = openModal(container);
    expect(within(dialog).getByRole("heading", { name: "Request" })).toBeInTheDocument();
    expect(dialog.querySelector(".research-request-modal-pre")?.textContent).toBe(CANONICAL_REQUEST);
    expect(dialog.textContent).toContain("RULES FOR REPORT:");
  });

  it("has an independently scrollable content region and no editing controls", () => {
    const done = taskRow({});
    seedList([done]);
    seedDetail(done, COMPLETED_RESULT);
    const { container } = render(<ResearchWorkspace />);
    const dialog = openModal(container);
    expect(dialog.querySelector("textarea, input, [contenteditable='true']")).toBeNull();
    const bodyRule = CSS.match(/\.research-request-modal-body\s*\{[^}]*\}/)?.[0] ?? "";
    expect(bodyRule).toMatch(/overflow-y:\s*auto/);
  });

  it("does not duplicate Submitted/Model/Duration inside the modal", () => {
    const done = taskRow({});
    seedList([done]);
    seedDetail(done, COMPLETED_RESULT);
    const { container } = render(<ResearchWorkspace />);
    const dialog = openModal(container);
    expect(dialog.textContent).not.toContain("Submitted");
    expect(dialog.textContent).not.toContain("Duration");
    expect(dialog.textContent).not.toContain("anthropic/claude-opus-4.6");
  });

  it("closes via the X, restoring focus to the Request panel", () => {
    const done = taskRow({});
    seedList([done]);
    seedDetail(done, COMPLETED_RESULT);
    const { container } = render(<ResearchWorkspace />);
    const card = requestCard(container);
    fireEvent.click(card);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(card);
  });

  it("closes when the backdrop is clicked", () => {
    const done = taskRow({});
    seedList([done]);
    seedDetail(done, COMPLETED_RESULT);
    const { container } = render(<ResearchWorkspace />);
    fireEvent.click(requestCard(container));
    fireEvent.click(container.querySelector(".research-request-modal-backdrop")!);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes on Escape", () => {
    const done = taskRow({});
    seedList([done]);
    seedDetail(done, COMPLETED_RESULT);
    const { container } = render(<ResearchWorkspace />);
    const dialog = openModal(container);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not change the unsent draft or create/mutate a task", () => {
    const done = taskRow({});
    seedList([done]);
    seedDetail(done, COMPLETED_RESULT);
    const { container } = render(<ResearchWorkspace />);
    fireEvent.change(screen.getByLabelText("Research request"), { target: { value: "My unsent draft" } });
    fireEvent.click(requestCard(container));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByLabelText("Research request")).toHaveValue("My unsent draft");
    expect(mutationFn).not.toHaveBeenCalled();
  });
});

describe("Deep Research — new submission collapses the Request panel", () => {
  it("selects the new task, keeps the Request panel collapsed, and does not auto-open the modal", async () => {
    seedList([]);
    seedDetail(null);
    render(<ResearchWorkspace />);
    fireEvent.change(screen.getByLabelText("Research request"), { target: { value: "Fresh run question" } });
    fireEvent.click(screen.getByRole("button", { name: "Research" }));
    await waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1));
    // The modal never auto-opens after submission.
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Deep Research — historical tasks use the same layout", () => {
  it.each([
    ["completed", { status: "completed" }, COMPLETED_RESULT],
    ["failed", { status: "failed", errorMessage: "boom" }, null],
    ["calendar", { status: "completed", fromCalendar: true }, COMPLETED_RESULT],
  ])("renders the Request panel + windowless metadata for a %s task", (_label, over, result) => {
    const task = taskRow({ id: "task_hist", ...(over as object) });
    seedList([task]);
    seedDetail(task, result);
    const { container } = render(<ResearchWorkspace />);
    expect(container.querySelector(".research-request-card-preview")?.textContent).toBe(CANONICAL_REQUEST);
    expect(container.querySelector(".research-request-metabar")?.textContent).toContain("Submitted");
    // The historical run remains read-only inside the modal (no editing controls).
    fireEvent.click(requestCard(container));
    expect(screen.getByRole("dialog").querySelector("textarea, input")).toBeNull();
  });
});

describe("Deep Research — lower response panel contents", () => {
  it("keeps sources in the lower response panel (not in the Request panel)", () => {
    const done = taskRow({});
    seedList([done]);
    seedDetail(done, COMPLETED_RESULT, [
      { id: "s1", title: "Pod K Nov 11 2024", sourceType: "membership_transcript", locator: null },
    ]);
    const { container } = render(<ResearchWorkspace />);
    const panel = responsePanel(container);
    expect(panel.textContent).toContain("Sources retrieved this run");
    expect(panel.textContent).toContain("Pod K Nov 11 2024");
    expect(container.querySelector(".research-request-block")?.textContent).not.toContain("Pod K Nov 11 2024");
  });

  it("shows failure + retry + progress in the lower panel for a failed run", () => {
    const failed = taskRow({ id: "task_failed", status: "failed", errorMessage: "Research failed detail." });
    seedList([failed]);
    seedDetail(failed, null, [], [{ id: "p1", eventType: "task_failed", message: "stopped" }]);
    const { container } = render(<ResearchWorkspace />);
    const panel = responsePanel(container);
    expect(panel.textContent).toContain("Research failed detail.");
    expect(within(panel).getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(panel.textContent).toContain("Progress");
  });
});
