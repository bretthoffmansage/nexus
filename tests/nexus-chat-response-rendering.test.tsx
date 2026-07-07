import { readFileSync } from "node:fs";
import path from "node:path";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  isLoading: false,
  isAuthenticated: true,
  isRefreshing: false,
}));

const queryCalls = vi.hoisted(() => [] as Array<{ fn: unknown; args: unknown }>);
const queryResults = vi.hoisted(() => new Map<unknown, unknown>());
const mutationFn = vi.hoisted(() => vi.fn(async () => ({ conversationId: "convo_new" })));
const deleteMutationFn = vi.hoisted(() => vi.fn(async () => ({ deleted: true })));

vi.mock("convex/react", async (importOriginal) => {
  const { nexusChat } = await import("@/lib/nexus/p5Client");
  return {
    ...(await importOriginal<typeof import("convex/react")>()),
    useQuery: (fn: unknown, args: unknown) => {
      queryCalls.push({ fn, args });
      if (args === "skip") return undefined;
      return queryResults.get(fn);
    },
    useMutation: (fn: unknown) => {
      if (fn === nexusChat.deleteMyConversation) return deleteMutationFn;
      return mutationFn;
    },
    useConvexAuth: () => ({ ...authState }),
  };
});

import type { Id } from "@/convex/_generated/dataModel";
import { ChatHistoryPanel } from "@/components/chat/ChatHistoryPanel";
import {
  ChatSessionProvider,
  useChatSession,
} from "@/components/chat/ChatSessionContext";
import { NexusChatWorkspace } from "@/components/chat/NexusChatWorkspace";
import { TranscriptMessage } from "@/components/chat/TranscriptMessage";
import { transcriptAuthorLabel } from "@/lib/chat/messageLabels";
import {
  clearTypeOnSession,
  markMessageAnimated,
  wasMessageAnimated,
} from "@/lib/chat/typeOnSession";
import { nexusChat } from "@/lib/nexus/p5Client";
import { useEffect } from "react";

const ROOT = path.resolve(__dirname, "..");

function SelectConversation({ id }: { id: Id<"nexusConversations"> }) {
  const session = useChatSession();
  useEffect(() => {
    session?.selectConversation(id);
  }, [id, session]);
  return null;
}

beforeEach(() => {
  queryCalls.length = 0;
  queryResults.clear();
  mutationFn.mockClear();
  deleteMutationFn.mockClear();
  clearTypeOnSession();
  vi.useFakeTimers({ shouldAdvanceTime: true });
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
  vi.useRealTimers();
});

describe("Nexus Chat response rendering", () => {
  it("maps assistant author label to NEXUS", () => {
    expect(transcriptAuthorLabel("assistant")).toBe("NEXUS");
    expect(transcriptAuthorLabel("user")).toBe("USER");
  });

  it("animates a newly completed assistant message progressively", async () => {
    render(
      <TranscriptMessage
        message={{ id: "m_new", author: "assistant", content: "Hello from Nexus." }}
        animate
      />,
    );
    expect(screen.getByText("NEXUS")).toBeInTheDocument();
    expect(screen.queryByText("Hello from Nexus.")).not.toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(80);
    });
    const body = screen.getByText(/Hello/);
    expect(body.textContent).not.toBe("Hello from Nexus.");
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText("Hello from Nexus.")).toBeInTheDocument();
    expect(wasMessageAnimated("m_new")).toBe(true);
  });

  it("renders historical assistant messages immediately", () => {
    markMessageAnimated("m_old");
    render(
      <TranscriptMessage
        message={{ id: "m_old", author: "assistant", content: "Stored answer." }}
        animate={false}
      />,
    );
    expect(screen.getByText("Stored answer.")).toBeInTheDocument();
  });

  it("shows completed answer once in transcript (no duplicate Answer section)", async () => {
    const user = userEvent.setup();
    const convoId = "convo_one" as Id<"nexusConversations">;
    const taskId = "task_one" as Id<"nexusTasks">;

    queryResults.set(nexusChat.listMyConversations, {
      conversations: [{ id: convoId, title: "One", updatedAt: Date.now(), status: "active" }],
    });
    queryResults.set(nexusChat.listMyTasks, {
      tasks: [{ id: taskId, conversationId: convoId, status: "completed" }],
    });
    queryResults.set(nexusChat.getConversationTranscript, {
      messages: [
        { id: "m_user", author: "user", content: "Question?" },
        { id: "m_asst", author: "assistant", content: "Single canonical answer." },
      ],
      tasks: [{ id: taskId, status: "completed", requestedToolId: "vault.agentic_retrieval" }],
    });
    queryResults.set(nexusChat.listMyTaskSources, []);

    render(
      <ChatSessionProvider canSubmit>
        <SelectConversation id={convoId} />
        <NexusChatWorkspace />
      </ChatSessionProvider>,
    );

    await user.click(screen.getByRole("button", { name: "History" }));
    await user.click(screen.getByRole("button", { name: /One/i }));

    expect(screen.getByText("Single canonical answer.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Answer" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Single canonical answer.")).toHaveLength(1);
  });

  it("hides Answer and Sources placeholders while queued", () => {
    const convoId = "convo_q" as Id<"nexusConversations">;
    queryResults.set(nexusChat.listMyConversations, { conversations: [] });
    queryResults.set(nexusChat.listMyTasks, { tasks: [] });
    queryResults.set(nexusChat.getConversationTranscript, {
      messages: [{ id: "m1", author: "user", content: "Pending question" }],
      tasks: [{ id: "task_q", status: "queued", requestedToolId: "vault.agentic_retrieval" }],
    });

    render(
      <ChatSessionProvider canSubmit>
        <SelectConversation id={convoId} />
        <NexusChatWorkspace />
      </ChatSessionProvider>,
    );

    expect(screen.queryByRole("heading", { name: "Answer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Sources" })).not.toBeInTheDocument();
    expect(screen.queryByText(/In progress\./i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sources will appear here/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Queued — waiting/i)).toBeInTheDocument();
  });

  it("shows a collapsed Sources disclosure only when a completed task has sources", async () => {
    const user = userEvent.setup();
    const convoId = "convo_src" as Id<"nexusConversations">;
    const taskId = "task_src" as Id<"nexusTasks">;

    queryResults.set(nexusChat.listMyConversations, {
      conversations: [{ id: convoId, title: "Src", updatedAt: Date.now(), status: "active" }],
    });
    queryResults.set(nexusChat.listMyTasks, {
      tasks: [{ id: taskId, conversationId: convoId, status: "completed" }],
    });
    queryResults.set(nexusChat.getConversationTranscript, {
      messages: [
        { id: "m1", author: "user", content: "Q" },
        { id: "m2", author: "assistant", content: "A" },
      ],
      tasks: [{ id: taskId, status: "completed" }],
    });
    queryResults.set(nexusChat.listMyTaskSources, [
      { id: "s1", title: "Vault note", sourceType: "vault_note" },
    ]);

    render(
      <ChatSessionProvider canSubmit>
        <SelectConversation id={convoId} />
        <NexusChatWorkspace />
      </ChatSessionProvider>,
    );

    await user.click(screen.getByRole("button", { name: "History" }));
    await user.click(screen.getByRole("button", { name: /Src/i }));

    // Disclosure summary is present, but the source list is collapsed by default.
    const summary = screen.getByText("Sources");
    expect(summary).toBeInTheDocument();
    expect(screen.getByText("Vault note")).not.toBeVisible();

    // Expanding the disclosure reveals the source list.
    await user.click(summary);
    expect(screen.getByText("Vault note")).toBeVisible();
  });

  it("omits Chat-page Diagnostics and outdated explanatory copy", () => {
    const workspaceSrc = readFileSync(
      path.join(ROOT, "components/chat/NexusChatWorkspace.tsx"),
      "utf8",
    );
    expect(workspaceSrc).not.toContain("Diagnostics");
    expect(workspaceSrc).not.toMatch(/Private knowledge requests/i);
    expect(workspaceSrc).not.toMatch(/Requests are saved and queued/i);

    render(
      <ChatSessionProvider canSubmit>
        <NexusChatWorkspace />
      </ChatSessionProvider>,
    );
    expect(screen.queryByText(/Diagnostics/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Private knowledge requests/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Requests are saved and queued/i)).not.toBeInTheDocument();
  });
});

describe("Nexus Chat conversation deletion UI", () => {
  it("shows edit toggle beside Conversations and delete controls in edit mode", async () => {
    const user = userEvent.setup();
    queryResults.set(nexusChat.listMyConversations, {
      conversations: [
        { id: "c1" as Id<"nexusConversations">, title: "Alpha", updatedAt: Date.now(), status: "active" },
      ],
    });
    queryResults.set(nexusChat.listMyTasks, { tasks: [] });

    render(
      <ChatSessionProvider canSubmit>
        <ChatHistoryPanel />
      </ChatSessionProvider>,
    );

    expect(screen.getByRole("button", { name: /Edit conversations/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Delete conversation Alpha/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Edit conversations/i }));
    expect(screen.getByRole("button", { name: /Delete conversation Alpha/i })).toBeInTheDocument();
  });

  it("confirms deletion and calls delete mutation", async () => {
    const user = userEvent.setup();
    queryResults.set(nexusChat.listMyConversations, {
      conversations: [
        { id: "c1" as Id<"nexusConversations">, title: "Alpha", updatedAt: Date.now(), status: "active" },
      ],
    });
    queryResults.set(nexusChat.listMyTasks, { tasks: [] });

    render(
      <ChatSessionProvider canSubmit>
        <ChatHistoryPanel />
      </ChatSessionProvider>,
    );

    await user.click(screen.getByRole("button", { name: /Edit conversations/i }));
    await user.click(screen.getByRole("button", { name: /Delete conversation Alpha/i }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Alpha/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /^Delete$/i }));
    expect(deleteMutationFn).toHaveBeenCalledWith({ conversationId: "c1" });
  });
});
