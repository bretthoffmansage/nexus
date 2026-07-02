// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { ResearchWorkspace } from "@/components/workspace/port/ResearchWorkspace";
import { nexusDeepResearch } from "@/lib/nexus/deepResearchClient";
import { composeDeepResearchRequestText } from "@/lib/nexus/deepResearchRequestCompose";

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
      capabilities: ["text", "tool_calling"],
    },
  ],
};

beforeEach(() => {
  queryResults.clear();
  mutationFn.mockReset();
  mutationFn.mockResolvedValue({
    taskId: "task_new",
    duplicate: false,
    status: "queued",
    queueSequence: 1,
    attemptNumber: 1,
  });
  queryResults.set(nexusDeepResearch.listMyDeepResearchTasks, { tasks: [], nextCursor: null });
  queryResults.set(nexusDeepResearch.connectorStatus, { state: "online_idle" });
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

describe("Deep Research model submission wiring", () => {
  it("does not submit a task on initial render (page refresh)", async () => {
    render(<ResearchWorkspace />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(mutationFn).not.toHaveBeenCalled();
  });

  it("never includes requestedModelId in task submission", async () => {
    render(<ResearchWorkspace />);
    await screen.findByRole("option", { name: /Claude Sonnet 4.6/ });

    fireEvent.change(screen.getByLabelText("Research request"), {
      target: { value: "What drives member retention?" },
    });
    fireEvent.change(screen.getByLabelText("Report rules"), { target: { value: "" } });
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "anthropic/claude-sonnet-4.6" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Research" }));

    await waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1));
    const args = mutationFn.mock.calls[0][0];
    expect(args.requestText).toBe("What drives member retention?");
    expect(args.requestedModelId).toBeUndefined();
  });

  it("submits composed requestText when report rules are present", async () => {
    render(<ResearchWorkspace />);
    await screen.findByRole("option", { name: /Claude Sonnet 4.6/ });

    fireEvent.change(screen.getByLabelText("Research request"), {
      target: { value: "Default model run" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Research" }));

    await waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(1));
    const args = mutationFn.mock.calls[0][0];
    expect(args.requestText).toBe(
      composeDeepResearchRequestText("Default model run", screen.getByLabelText("Report rules").textContent ?? ""),
    );
    expect(args.requestedModelId).toBeUndefined();
  });

  it("persists the model selection without submitting", async () => {
    const { unmount } = render(<ResearchWorkspace />);
    await screen.findByRole("option", { name: /Claude Sonnet 4.6/ });
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "anthropic/claude-sonnet-4.6" },
    });
    unmount();

    render(<ResearchWorkspace />);
    await screen.findByRole("option", { name: /Claude Sonnet 4.6/ });
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("anthropic/claude-sonnet-4.6");
    expect(mutationFn).not.toHaveBeenCalled();
  });
});
