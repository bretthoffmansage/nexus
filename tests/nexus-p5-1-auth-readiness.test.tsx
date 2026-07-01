import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * P5.1 — Convex authentication readiness guard.
 *
 * These tests drive realistic `useConvexAuth()` transitions (loading →
 * unauthenticated → authenticated → sign-out → re-sign-in) through a manually
 * controlled mock, proving every P5 private query/mutation is skipped until
 * Convex itself confirms the auth token — not just source-code assertions.
 */

const authState = vi.hoisted(() => ({
  isLoading: true,
  isAuthenticated: false,
  isRefreshing: false,
}));

/** Every useQuery(fn, args) call observed, in order, across the whole test. */
const queryCalls = vi.hoisted(
  () => [] as Array<{ fn: unknown; args: unknown }>,
);

/** Canned results a test can register for a given query function reference. */
const queryResults = vi.hoisted(() => new Map<unknown, unknown>());

const mutationFn = vi.hoisted(() => vi.fn(async () => ({})));

vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex/react")>()),
  useQuery: (fn: unknown, args: unknown) => {
    queryCalls.push({ fn, args });
    if (args === "skip") return undefined;
    return queryResults.get(fn);
  },
  useMutation: () => mutationFn,
  useConvexAuth: () => ({ ...authState }),
}));

import type { Id } from "@/convex/_generated/dataModel";
import {
  ChatSessionProvider,
  useChatSession,
} from "@/components/chat/ChatSessionContext";
import { NexusChatWorkspace } from "@/components/chat/NexusChatWorkspace";
import { TaskHistorySection } from "@/components/history/TaskHistorySection";
import { MyTasksPanel } from "@/components/workspace/port/MyTasksPanel";
import { nexusChat } from "@/lib/nexus/p5Client";

function lastCallFor(fn: unknown) {
  const calls = queryCalls.filter((c) => c.fn === fn);
  return calls[calls.length - 1];
}

beforeEach(() => {
  queryCalls.length = 0;
  queryResults.clear();
  mutationFn.mockClear();
  authState.isLoading = true;
  authState.isAuthenticated = false;
});

describe("P5.1 — TaskHistorySection readiness", () => {
  it("1. skips listMyConversations while Convex auth is loading", () => {
    authState.isLoading = true;
    authState.isAuthenticated = false;
    render(
      <ChatSessionProvider canSubmit>
        <TaskHistorySection />
      </ChatSessionProvider>,
    );
    expect(lastCallFor(nexusChat.listMyConversations)?.args).toBe("skip");
  });

  it("2. skips listMyConversations while unauthenticated (not loading)", () => {
    authState.isLoading = false;
    authState.isAuthenticated = false;
    render(
      <ChatSessionProvider canSubmit>
        <TaskHistorySection />
      </ChatSessionProvider>,
    );
    expect(lastCallFor(nexusChat.listMyConversations)?.args).toBe("skip");
  });

  it("3. runs listMyConversations once Convex reports authenticated", () => {
    authState.isLoading = false;
    authState.isAuthenticated = true;
    render(
      <ChatSessionProvider canSubmit>
        <TaskHistorySection />
      </ChatSessionProvider>,
    );
    expect(lastCallFor(nexusChat.listMyConversations)?.args).toEqual({ limit: 30 });
  });

  it("4-5. shows a loading state (never a false 'No requests yet') before readiness", () => {
    authState.isLoading = true;
    authState.isAuthenticated = false;
    render(
      <ChatSessionProvider canSubmit>
        <TaskHistorySection />
      </ChatSessionProvider>,
    );
    expect(screen.getByText("Loading history…")).toBeInTheDocument();
    expect(screen.queryByText(/No requests yet/i)).not.toBeInTheDocument();
  });

  it("10. stops issuing listMyConversations once Convex reports sign-out", () => {
    authState.isLoading = false;
    authState.isAuthenticated = true;
    const { rerender } = render(
      <ChatSessionProvider canSubmit>
        <TaskHistorySection />
      </ChatSessionProvider>,
    );
    expect(lastCallFor(nexusChat.listMyConversations)?.args).toEqual({ limit: 30 });

    authState.isAuthenticated = false;
    rerender(
      <ChatSessionProvider canSubmit>
        <TaskHistorySection />
      </ChatSessionProvider>,
    );
    expect(lastCallFor(nexusChat.listMyConversations)?.args).toBe("skip");
  });
});

describe("P5.1 — NexusChatWorkspace readiness", () => {
  function ChatHarness() {
    const session = useChatSession();
    return (
      <>
        <button
          type="button"
          onClick={() =>
            session?.selectConversation("convo_a" as Id<"nexusConversations">)
          }
        >
          select conversation
        </button>
        <NexusChatWorkspace />
      </>
    );
  }

  it("7. skips the selected conversation's transcript/result/source queries before readiness", async () => {
    const user = userEvent.setup();
    authState.isLoading = true;
    authState.isAuthenticated = false;
    render(
      <ChatSessionProvider canSubmit>
        <ChatHarness />
      </ChatSessionProvider>,
    );
    await user.click(screen.getByRole("button", { name: "select conversation" }));

    expect(lastCallFor(nexusChat.getConversationTranscript)?.args).toBe("skip");
    expect(lastCallFor(nexusChat.listMyTaskSources)?.args).toBe("skip");
  });

  it("9. keeps the composer disabled while auth is initializing, even for an authorized account", () => {
    authState.isLoading = true;
    authState.isAuthenticated = false;
    render(
      <ChatSessionProvider canSubmit>
        <NexusChatWorkspace />
      </ChatSessionProvider>,
    );
    expect(screen.getByLabelText(/Message Nexus/i)).toBeDisabled();
    expect(screen.getByText(/Connecting to Nexus/i)).toBeInTheDocument();
    // No mutation must have fired merely from rendering while initializing.
    expect(mutationFn).not.toHaveBeenCalled();
  });

  it("enables the composer once ready without outdated queue help copy", () => {
    authState.isLoading = false;
    authState.isAuthenticated = true;
    render(
      <ChatSessionProvider canSubmit>
        <NexusChatWorkspace />
      </ChatSessionProvider>,
    );
    expect(screen.getByLabelText(/Message Nexus/i)).not.toBeDisabled();
    expect(screen.queryByText(/Requests are saved and queued/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Private knowledge requests/i)).not.toBeInTheDocument();
  });

  it("12. renders without throwing during the initial (loading) auth state", () => {
    authState.isLoading = true;
    authState.isAuthenticated = false;
    expect(() =>
      render(
        <ChatSessionProvider canSubmit>
          <TaskHistorySection />
          <NexusChatWorkspace />
        </ChatSessionProvider>,
      ),
    ).not.toThrow();
  });

  it("11. clears the selected conversation on sign-out so a new account cannot inherit it", async () => {
    const user = userEvent.setup();
    authState.isLoading = false;
    authState.isAuthenticated = true;

    function SelectionProbe() {
      const session = useChatSession();
      return (
        <>
          <button
            type="button"
            onClick={() =>
              session?.selectConversation("convo_a" as Id<"nexusConversations">)
            }
          >
            select A
          </button>
          <span data-testid="active-id">{session?.activeConversationId ?? "none"}</span>
        </>
      );
    }

    const { rerender } = render(
      <ChatSessionProvider canSubmit>
        <SelectionProbe />
      </ChatSessionProvider>,
    );
    await user.click(screen.getByRole("button", { name: "select A" }));
    expect(screen.getByTestId("active-id")).toHaveTextContent("convo_a");

    // User A signs out.
    authState.isAuthenticated = false;
    rerender(
      <ChatSessionProvider canSubmit>
        <SelectionProbe />
      </ChatSessionProvider>,
    );
    expect(screen.getByTestId("active-id")).toHaveTextContent("none");

    // User B signs in on the same mounted app — nothing to inherit.
    authState.isAuthenticated = true;
    rerender(
      <ChatSessionProvider canSubmit>
        <SelectionProbe />
      </ChatSessionProvider>,
    );
    expect(screen.getByTestId("active-id")).toHaveTextContent("none");
  });
});

describe("P5.1 — MyTasksPanel readiness (/tasks has no ChatSessionContext)", () => {
  it("6. skips private task list/count queries before readiness and shows a loading state", () => {
    authState.isLoading = true;
    authState.isAuthenticated = false;
    render(<MyTasksPanel />);

    expect(lastCallFor(nexusChat.listMyTasks)?.args).toBe("skip");
    expect(lastCallFor(nexusChat.myTaskCounts)?.args).toBe("skip");
    expect(screen.getByText("Loading your tasks…")).toBeInTheDocument();
    expect(screen.queryByText(/No tasks in this view yet/i)).not.toBeInTheDocument();
  });

  it("8. skips task result/source/progress queries for a selected task once auth stops being ready", async () => {
    const user = userEvent.setup();
    const taskId = "task_1" as Id<"nexusTasks">;
    authState.isLoading = false;
    authState.isAuthenticated = true;
    queryResults.set(nexusChat.myTaskCounts, {
      queued: 1,
      cancel_requested: 0,
      cancelled: 0,
      claimed: 0,
      running: 0,
      completed: 0,
      failed: 0,
      total: 1,
    });
    queryResults.set(nexusChat.listMyTasks, {
      tasks: [{ id: taskId, requestText: "hello", status: "queued", createdAt: Date.now() }],
      nextCursor: null,
    });
    queryResults.set(nexusChat.getMyTask, {
      id: taskId,
      requestText: "hello",
      status: "queued",
      createdAt: Date.now(),
      requestedToolId: "vault.agentic_retrieval",
      attemptNumber: 1,
    });

    const { rerender } = render(<MyTasksPanel />);
    await user.click(screen.getByText("hello"));
    expect(lastCallFor(nexusChat.getMyTask)?.args).toEqual({ taskId });

    // Auth token is being refreshed (isAuthenticated stays true, isLoading
    // flips back on) — readiness must drop and detail queries must skip,
    // without clearing the selection (that's the sign-out-only guard).
    authState.isLoading = true;
    rerender(<MyTasksPanel />);

    expect(lastCallFor(nexusChat.getMyTask)?.args).toBe("skip");
    expect(lastCallFor(nexusChat.getMyTaskResult)?.args).toBe("skip");
    expect(lastCallFor(nexusChat.listMyTaskSources)?.args).toBe("skip");
    expect(lastCallFor(nexusChat.listMyTaskProgress)?.args).toBe("skip");
    expect(screen.getByText("Loading task…")).toBeInTheDocument();
  });

  it("9. cannot trigger cancel/retry while auth is initializing (no action control renders)", () => {
    authState.isLoading = true;
    authState.isAuthenticated = false;
    render(<MyTasksPanel />);
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(mutationFn).not.toHaveBeenCalled();
  });

  it("12. renders without throwing during the initial (loading) auth state", () => {
    authState.isLoading = true;
    authState.isAuthenticated = false;
    expect(() => render(<MyTasksPanel />)).not.toThrow();
  });
});
