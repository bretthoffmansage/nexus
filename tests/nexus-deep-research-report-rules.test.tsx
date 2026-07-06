// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildDeepResearchEnvelope,
  buildDeepResearchTaskMetadata,
  DEEP_RESEARCH_MAX_REQUEST_LENGTH,
  DEEP_RESEARCH_TOOL_ID,
  DEEP_RESEARCH_TASK_KIND,
} from "@/convex/lib/deepResearchConfig";
import {
  composeDeepResearchRequestText,
  DEFAULT_DEEP_RESEARCH_REPORT_RULES,
  DEEP_RESEARCH_RULES_DIVIDER,
  DEEP_RESEARCH_RULES_HEADING,
  validateComposedDeepResearchRequest,
} from "@/lib/nexus/deepResearchRequestCompose";
import {
  loadReportRulesDraft,
  resetReportRulesDraft,
  saveReportRulesDraft,
} from "@/lib/nexus/deepResearchSession";
import { ResearchWorkspace } from "@/components/workspace/port/ResearchWorkspace";
import { ResearchModelSelector } from "@/components/workspace/port/ResearchModelSelector";
import { nexusDeepResearch } from "@/lib/nexus/deepResearchClient";
import { CLAUDIA_DEFAULT_MODEL_VALUE } from "@/lib/nexus/deepResearchModelCatalog";

const ROOT = path.resolve(import.meta.dirname, "..");

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

const LONG_MODEL: Array<{ id: string; name: string; provider: string }> = [
  {
    id: "anthropic/claude-sonnet-4.6",
    name: "Claude Sonnet 4.6 with an intentionally long display label for layout testing",
    provider: "anthropic",
  },
];

beforeEach(() => {
  queryResults.clear();
  mutationFn.mockReset();
  localStorage.clear();
  queryResults.set(nexusDeepResearch.listMyDeepResearchTasks, { tasks: [], nextCursor: null });
  queryResults.set(nexusDeepResearch.connectorStatus, { state: "online_idle" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, models: LONG_MODEL }) }) as Response),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("Deep Research report rules and model UI cleanup", () => {
  describe("report rules defaults and draft", () => {
    it("initializes new requests with the exact default Report rules text", async () => {
      render(<ResearchWorkspace />);
      await waitFor(() => expect(global.fetch).toHaveBeenCalled());
      expect(screen.getByLabelText("Report rules")).toHaveValue(DEFAULT_DEEP_RESEARCH_REPORT_RULES);
    });

    it("allows editing and clearing the rules", () => {
      render(<ResearchWorkspace />);
      const field = screen.getByLabelText("Report rules");
      fireEvent.change(field, { target: { value: "Custom rule" } });
      expect(field).toHaveValue("Custom rule");
      fireEvent.change(field, { target: { value: "" } });
      expect(field).toHaveValue("");
    });

    it("preserves edited rules across rerender via draft storage", () => {
      saveReportRulesDraft("Persisted rules");
      const { unmount } = render(<ResearchWorkspace />);
      expect(screen.getByLabelText("Report rules")).toHaveValue("Persisted rules");
      unmount();
      render(<ResearchWorkspace />);
      expect(screen.getByLabelText("Report rules")).toHaveValue("Persisted rules");
      expect(loadReportRulesDraft()).toBe("Persisted rules");
    });

    it("does not overwrite an edited draft when reset helper is not called", () => {
      saveReportRulesDraft("Edited once");
      resetReportRulesDraft();
      expect(loadReportRulesDraft()).toBe(DEFAULT_DEEP_RESEARCH_REPORT_RULES);
      saveReportRulesDraft("Edited twice");
      expect(loadReportRulesDraft()).toBe("Edited twice");
    });
  });

  describe("request composition", () => {
    it("appends the exact divider and heading with correct newlines", () => {
      const composed = composeDeepResearchRequestText(
        "Find me 10 websites that use similar language as ours in our calls",
        DEFAULT_DEEP_RESEARCH_REPORT_RULES,
      );
      expect(composed).toBe(
        `Find me 10 websites that use similar language as ours in our calls\n${DEEP_RESEARCH_RULES_DIVIDER}\n${DEEP_RESEARCH_RULES_HEADING}\n${DEFAULT_DEEP_RESEARCH_REPORT_RULES}`,
      );
    });

    it("trims research request and rules before composing", () => {
      const composed = composeDeepResearchRequestText("  hello  ", "  rule  ");
      expect(composed).toBe(`hello\n${DEEP_RESEARCH_RULES_DIVIDER}\n${DEEP_RESEARCH_RULES_HEADING}\nrule`);
    });

    it("omits rules block when rules are blank after trim", () => {
      expect(composeDeepResearchRequestText("hello", "   ")).toBe("hello");
    });

    it("rejects blank research request even when rules are present", () => {
      const result = validateComposedDeepResearchRequest("   ", "rule");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("empty");
    });

    it("keeps metadata at exactly five keys with no reportRules field", () => {
      const metadata = buildDeepResearchTaskMetadata("nexus-research_abcdefgh", "nexus-research-run_abcdefgh");
      expect(Object.keys(metadata).sort()).toEqual([
        "explicitUserAction",
        "idempotencyKey",
        "kind",
        "researchRequestId",
        "sourcePage",
      ]);
      const envelope = buildDeepResearchEnvelope({
        requestText: composeDeepResearchRequestText("task", "rule"),
        researchRequestId: "nexus-research_abcdefgh",
        idempotencyKey: "nexus-research-run_abcdefgh",
      });
      expect(envelope.ok).toBe(true);
      if (!envelope.ok) return;
      expect(envelope.envelope.taskMetadata).toEqual(metadata);
      expect(JSON.stringify(envelope.envelope)).not.toContain("reportRules");
    });
  });

  describe("composed length validation", () => {
    it("accepts exactly 8000 composed characters", () => {
      const rules = "x".repeat(100);
      const request = "y".repeat(
        DEEP_RESEARCH_MAX_REQUEST_LENGTH -
          (`\n${DEEP_RESEARCH_RULES_DIVIDER}\n${DEEP_RESEARCH_RULES_HEADING}\n`.length + rules.length),
      );
      const result = validateComposedDeepResearchRequest(request, rules);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.length).toBe(DEEP_RESEARCH_MAX_REQUEST_LENGTH);
    });

    it("rejects composed payloads over 8000 characters", () => {
      const request = "a".repeat(DEEP_RESEARCH_MAX_REQUEST_LENGTH);
      const result = validateComposedDeepResearchRequest(request, "extra");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("too_large");
    });
  });

  describe("submission wiring", () => {
    it("submits the composed requestText without model or metadata fields", async () => {
      render(<ResearchWorkspace />);
      await screen.findByRole("option", { name: /Claude Sonnet/ });
      fireEvent.change(screen.getByLabelText("Research request"), {
        target: { value: "Primary task" },
      });
      fireEvent.change(screen.getByLabelText("Report rules"), {
        target: { value: "Rule one" },
      });
      fireEvent.change(screen.getByRole("combobox"), {
        target: { value: "anthropic/claude-sonnet-4.6" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Research" }));

      await waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1));
      const args = mutationFn.mock.calls[0][0];
      expect(args.requestText).toBe(
        composeDeepResearchRequestText("Primary task", "Rule one"),
      );
      expect(args.requestedModelId).toBeUndefined();
      expect(Object.keys(args)).toEqual(["requestText", "researchRequestId", "idempotencyKey"]);
    });

    it("does not submit on page load", async () => {
      render(<ResearchWorkspace />);
      await waitFor(() => expect(global.fetch).toHaveBeenCalled());
      expect(mutationFn).not.toHaveBeenCalled();
    });
  });

  describe("model layout and authority", () => {
    it("bounds the model select within the panel styles", () => {
      const css = readFileSync(path.join(ROOT, "styles/legacy-port.css"), "utf8");
      expect(css).toContain(".research-model-selector");
      expect(css).toContain("max-width: 100%");
      expect(css).toContain(".research-settings");
      expect(css).toContain("min-width: 0");
    });

    it("renders the model control without expanding the workspace root", () => {
      const { container } = render(
        <ResearchModelSelector
          value={CLAUDIA_DEFAULT_MODEL_VALUE}
          onChange={() => undefined}
          models={LONG_MODEL as never}
          loading={false}
          error={false}
        />,
      );
      const select = container.querySelector(".research-model-field") as HTMLSelectElement;
      expect(select).toBeTruthy();
      expect(select.className).toContain("research-model-field");
    });

    it("does not send model values through buildDeepResearchEnvelope when omitted", () => {
      const built = buildDeepResearchEnvelope({
        requestText: "task",
        researchRequestId: "nexus-research_abcdefgh",
        idempotencyKey: "nexus-research-run_abcdefgh",
      });
      expect(built.ok).toBe(true);
      if (!built.ok) return;
      expect(built.envelope.requestedModelId).toBeUndefined();
      expect(built.envelope.requestedToolId).toBe(DEEP_RESEARCH_TOOL_ID);
      expect(built.envelope.taskKind).toBe(DEEP_RESEARCH_TASK_KIND);
    });
  });

  describe("page copy", () => {
    it("shows the updated subtitle and omits the legacy model explanation line", async () => {
      render(<ResearchWorkspace />);
      await waitFor(() => expect(global.fetch).toHaveBeenCalled());
      expect(screen.getByText("Hermes agent + Web, Transcript, Knowledge Vault runtime")).toBeInTheDocument();
      expect(screen.queryByText(/Run governed, multi-source research through Claudia/i)).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Claudia selects and validates the model for each run/i),
      ).not.toBeInTheDocument();
    });
  });

  describe("layout", () => {
    it("renders report rules below the primary request with a smaller textarea", () => {
      const src = readFileSync(
        path.join(ROOT, "components/workspace/DeepResearchRequestFields.tsx"),
        "utf8",
      );
      expect(src.indexOf("research-request-input")).toBeLessThan(
        src.indexOf("research-report-rules-input"),
      );
      expect(src).toContain("reportRulesRows = 4");
      expect(src).toContain("researchRequestRows = 8");
    });
  });
});
