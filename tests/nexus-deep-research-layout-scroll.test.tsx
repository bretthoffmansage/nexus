// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResearchWorkspace } from "@/components/workspace/port/ResearchWorkspace";
import { nexusDeepResearch } from "@/lib/nexus/deepResearchClient";

const authState = vi.hoisted(() => ({
  isLoading: false,
  isAuthenticated: true,
  isRefreshing: false,
}));

const queryResults = vi.hoisted(() => new Map<unknown, unknown>());
const mutationFn = vi.hoisted(() => vi.fn());

vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex/react")>()),
  useQuery: (fn: unknown, args: unknown) => {
    if (args === "skip") return undefined;
    if (queryResults.has(fn)) return queryResults.get(fn);
    return undefined;
  },
  useMutation: () => mutationFn,
  useConvexAuth: () => ({ ...authState }),
}));

const ROOT = path.resolve(__dirname, "..");
const CSS = readFileSync(path.join(ROOT, "styles/legacy-port.css"), "utf8");

// A report long enough to overflow any bounded viewport; the sentinel final
// line lets us assert the very end of the report is still reachable in the DOM.
const REPORT_FINAL_LINE = "FINAL-REPORT-LINE-SENTINEL";
const LONG_REPORT = [
  "# Deep Research Findings",
  ...Array.from({ length: 200 }, (_, i) => `Paragraph ${i + 1} of the long research report body.`),
  REPORT_FINAL_LINE,
].join("\n\n");

const LONG_REQUEST = `${"Investigate ".repeat(400)}please.`;

const COMPLETED_TASK_ID = "task_long_report" as never;

function seedCompletedLongReport() {
  queryResults.set(nexusDeepResearch.listMyDeepResearchTasks, {
    tasks: [
      {
        id: COMPLETED_TASK_ID,
        requestedToolId: "research.hermes_deep_research",
        requestText: LONG_REQUEST,
        status: "completed",
        queueSequence: 1,
        attemptNumber: 1,
        createdAt: 1,
        updatedAt: 2,
        queuedAt: 1,
        claimedAt: null,
        startedAt: null,
        completedAt: 2,
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
    id: COMPLETED_TASK_ID,
    requestedToolId: "research.hermes_deep_research",
    requestText: LONG_REQUEST,
    status: "completed",
    createdAt: 1,
    updatedAt: 2,
  });
  queryResults.set(nexusDeepResearch.getMyTaskResult, {
    answerText: LONG_REPORT,
    format: "markdown",
    model: "claudia-default",
    durationMs: 42000,
  });
  queryResults.set(nexusDeepResearch.listMyTaskSources, []);
  queryResults.set(nexusDeepResearch.listMyTaskProgress, []);
}

beforeEach(() => {
  queryResults.clear();
  mutationFn.mockClear();
  authState.isLoading = false;
  authState.isAuthenticated = true;
  authState.isRefreshing = false;
});

describe("Deep Research layout — right-panel scroll containment", () => {
  it("renders the whole long report so its final line stays reachable inside the right panel", () => {
    seedCompletedLongReport();
    const { container } = render(<ResearchWorkspace />);

    const rightPanel = container.querySelector<HTMLElement>(".research-jobs");
    expect(rightPanel).not.toBeNull();
    // The full report — including its final line — must live in the DOM (not
    // clipped away) and belong to the right scroll region.
    expect(rightPanel?.textContent).toContain(REPORT_FINAL_LINE);
    expect(rightPanel?.querySelector(".research-report-body")).not.toBeNull();
  });

  it("keeps the current research run in the scrollable right-side region", () => {
    seedCompletedLongReport();
    const { container } = render(<ResearchWorkspace />);

    const rightPanel = container.querySelector<HTMLElement>(".research-jobs");
    expect(rightPanel?.textContent).toContain("Current research");
    expect(rightPanel?.querySelector(".research-current-panel")).not.toBeNull();
    // Recent Research moved into the History drawer; the inline list is gone
    // from the right result panel (no duplicate list, scroll containment intact).
    expect(rightPanel?.textContent).not.toContain("Recent research");
    expect(rightPanel?.querySelector(".research-job-list")).toBeNull();
  });

  it("keeps the report out of the stationary left request panel", () => {
    seedCompletedLongReport();
    const { container } = render(<ResearchWorkspace />);

    const leftPanel = container.querySelector<HTMLElement>(".research-settings");
    expect(leftPanel).not.toBeNull();
    // The left panel owns the form only — the report never bleeds into it.
    expect(leftPanel?.textContent).not.toContain(REPORT_FINAL_LINE);
    expect(leftPanel?.querySelector(".research-form")).not.toBeNull();
  });
});

describe("Deep Research layout — CSS scroll invariants", () => {
  const researchRootRule =
    CSS.match(/\.legacy-port-research\.legacy-port-workspace\s*\{[\s\S]*?\n\}/)?.[0] ?? "";

  it("binds the page root to the available AppShell viewport height", () => {
    expect(researchRootRule).toMatch(/flex:\s*1/);
    expect(researchRootRule).toMatch(/min-height:\s*0/);
    expect(researchRootRule).toMatch(/height:\s*100%/);
    expect(researchRootRule).toMatch(/display:\s*flex/);
    expect(researchRootRule).toMatch(/flex-direction:\s*column/);
    expect(researchRootRule).toMatch(/overflow:\s*hidden/);
  });

  it("hands height from nexus-tool-page to the research workspace root", () => {
    expect(researchRootRule).toMatch(/height:\s*100%/);
    expect(CSS).toMatch(/\.nexus-tool-page\s*\{[\s\S]*?overflow:\s*hidden/);
  });

  it("gives the right research panel an independent desktop scroll", () => {
    const desktop = CSS.match(/@media\s*\(min-width:\s*901px\)\s*\{[\s\S]*?\n\}/);
    expect(desktop).not.toBeNull();
    const block = desktop![0];
    expect(block).toMatch(/\.research-panel-layout\s*\{[^}]*min-height:\s*0/);
    expect(block).toMatch(/grid-template-rows:\s*minmax\(0,\s*1fr\)/);
    // The scroll now lives on the lower response panel; the right column is a
    // bounded flex stack so the Request card + metadata row stay fixed on top.
    expect(block).toMatch(/\.research-response-panel\s*\{[^}]*overflow-y:\s*auto/);
    expect(block).toMatch(/\.research-response-panel\s*\{[^}]*flex:\s*1/);
    expect(block).toMatch(/\.research-response-panel\s*\{[^}]*min-height:\s*0/);
    expect(block).toMatch(/\.research-jobs\s*\{[^}]*overflow:\s*hidden/);
    expect(block).toMatch(/\.research-settings\s*\{[^}]*overflow-y:\s*auto/);
  });

  it("lets the completed report flow in the continuous scroll instead of a nested capped scrollbar", () => {
    const reportBody = CSS.match(/\.research-report-body\s*\{[^}]*\}/);
    expect(reportBody).not.toBeNull();
    // No hard height cap that would create a second, competing scrollbar.
    expect(reportBody![0]).not.toMatch(/max-height/);
    // Long tokens still wrap so a report can never widen the page.
    expect(reportBody![0]).toMatch(/overflow-wrap:\s*anywhere/);
  });

  it("collapses to a single column and uses one section scroll on narrow screens", () => {
    const narrow = CSS.match(/@media\s*\(max-width:\s*900px\)\s*\{[\s\S]*?\n\}/);
    expect(narrow).not.toBeNull();
    expect(narrow![0]).toMatch(/\.research-panel-layout/);
    expect(narrow![0]).toMatch(/grid-template-columns:\s*1fr/);
    expect(narrow![0]).toMatch(/\.legacy-port-research\.legacy-port-workspace[\s\S]*overflow-y:\s*auto/);
  });
});
