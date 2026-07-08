// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({ isLoading: false, isAuthenticated: true, isRefreshing: false }));
const queryResults = vi.hoisted(() => new Map<unknown, unknown>());
const mutationFn = vi.hoisted(() => vi.fn(async () => ({ conversationId: "convo_new" })));

vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex/react")>()),
  useQuery: (fn: unknown, args: unknown) => {
    if (args === "skip") return undefined;
    return queryResults.get(fn);
  },
  useMutation: () => mutationFn,
  useConvexAuth: () => ({ ...authState }),
}));

import type { Id } from "@/convex/_generated/dataModel";
import { useEffect } from "react";
import { ChatSessionProvider, useChatSession } from "@/components/chat/ChatSessionContext";
import { NexusChatWorkspace } from "@/components/chat/NexusChatWorkspace";
import { nexusChat } from "@/lib/nexus/p5Client";

function SelectConversation({ id }: { id: Id<"nexusConversations"> }) {
  const session = useChatSession();
  useEffect(() => {
    session?.selectConversation(id);
  }, [id, session]);
  return null;
}

const CONVO = "convo_one" as Id<"nexusConversations">;
const TASK = "task_one" as Id<"nexusTasks">;

function act(id: string, sequence: number, message: string, status = "running", worker = "cursor_cli") {
  return {
    id,
    sequence,
    eventType: "worker_activity",
    message,
    createdAt: sequence,
    metadata: { status, worker, surface: "chat" },
  };
}

const ACTIVITY = [
  act("a1", 1, "Starting Knowledge Vault retrieval…", "started", "system"),
  act("a2", 2, "Searching approved vault notes…"),
  act("a3", 3, "Reviewing matching vault sources…"),
  act("a4", 4, "Found 6 relevant vault notes."),
  act("a5", 5, "Synthesizing a grounded answer…"),
];

function seed({
  status,
  messages,
  sources = [],
  progress = ACTIVITY,
}: {
  status: string;
  messages: Array<{ id: string; author: string; content: string }>;
  sources?: Array<{ id: string; title: string; sourceType: string }>;
  progress?: unknown[];
}) {
  queryResults.set(nexusChat.listMyConversations, {
    conversations: [{ id: CONVO, title: "One", updatedAt: Date.now(), status: "active" }],
  });
  queryResults.set(nexusChat.getConversationTranscript, {
    messages,
    tasks: [{ id: TASK, status, requestedToolId: "vault.agentic_retrieval", errorCode: null }],
  });
  queryResults.set(nexusChat.listMyTaskSources, sources);
  queryResults.set(nexusChat.listMyTaskProgress, progress);
}

function renderChat() {
  render(
    <ChatSessionProvider canSubmit>
      <SelectConversation id={CONVO} />
      <NexusChatWorkspace />
    </ChatSessionProvider>,
  );
}

const activityRegion = () => screen.queryByRole("status", { name: "Retrieval activity" });

beforeEach(() => {
  queryResults.clear();
  mutationFn.mockClear();
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Nexus Chat — live retrieval activity while running", () => {
  it("shows the latest four Cursor worker activity lines under the pending message", () => {
    seed({ status: "running", messages: [{ id: "m_user", author: "user", content: "Vault question?" }] });
    renderChat();
    const region = activityRegion();
    expect(region).toBeInTheDocument();
    const lines = within(region!).getAllByRole("listitem").map((li) => li.textContent);
    expect(lines).toEqual([
      "Searching approved vault notes…",
      "Reviewing matching vault sources…",
      "Found 6 relevant vault notes.",
      "Synthesizing a grounded answer…",
    ]);
    // Oldest event pushed out of the four-line window.
    expect(screen.queryByText("Starting Knowledge Vault retrieval…")).toBeNull();
  });
});

describe("Nexus Chat — activity visibility by terminal state", () => {
  it("hides activity on success, showing the answer and a collapsed SOURCES disclosure", () => {
    seed({
      status: "completed",
      messages: [
        { id: "m_user", author: "user", content: "Vault question?" },
        { id: "m_asst", author: "assistant", content: "Grounded answer." },
      ],
      sources: [{ id: "s1", title: "Vault note one", sourceType: "vault_note" }],
    });
    renderChat();
    expect(activityRegion()).not.toBeInTheDocument();
    expect(screen.getByText("Grounded answer.")).toBeInTheDocument();
    // SOURCES disclosure present and collapsed by default (not regressed).
    const details = document.querySelector("details.nexus-sources-disclosure") as HTMLDetailsElement | null;
    expect(details).not.toBeNull();
    expect(details!.open).toBe(false);
    expect(screen.getByText("Sources")).toBeInTheDocument();
  });

  it("retains activity on failure alongside the safe failure message", () => {
    seed({
      status: "failed",
      messages: [{ id: "m_user", author: "user", content: "Vault question?" }],
    });
    // Failed task carries an errorCode for the failure line.
    queryResults.set(nexusChat.getConversationTranscript, {
      messages: [{ id: "m_user", author: "user", content: "Vault question?" }],
      tasks: [{ id: TASK, status: "failed", requestedToolId: "vault.agentic_retrieval", errorCode: "retrieval_failed" }],
    });
    renderChat();
    expect(activityRegion()).toBeInTheDocument();
    expect(screen.getByText(/Request failed \(retrieval_failed\)\./)).toBeInTheDocument();
  });
});
