import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  chatSessionStorageKey,
  writePersistedChatSession,
} from "@/lib/chat/chatSessionPersistence";

const authState = vi.hoisted(() => ({
  userId: "user_A" as string | null,
}));

const queryCalls = vi.hoisted(() => [] as Array<{ fn: unknown; args: unknown }>);
const queryResults = vi.hoisted(() => new Map<unknown, unknown>());
const mutationFn = vi.hoisted(() => vi.fn(async () => ({ conversationId: "convo_new" })));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ userId: authState.userId }),
}));

vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex/react")>()),
  useQuery: (fn: unknown, args: unknown) => {
    queryCalls.push({ fn, args });
    if (args === "skip") return undefined;
    return queryResults.get(fn);
  },
  useMutation: () => mutationFn,
  useConvexAuth: () => ({ isLoading: false, isAuthenticated: true, isRefreshing: false }),
}));

import type { Id } from "@/convex/_generated/dataModel";
import {
  ChatSessionProvider,
  useChatSession,
} from "@/components/chat/ChatSessionContext";
import { NexusChatWorkspace } from "@/components/chat/NexusChatWorkspace";
import { nexusChat } from "@/lib/nexus/p5Client";

function ChatHarness() {
  const session = useChatSession();
  return (
    <>
      <span data-testid="active">{session?.activeConversationId ?? "none"}</span>
      <span data-testid="tool">{session?.selectedToolId ?? "none"}</span>
      <span data-testid="ready">{session?.chatSessionReady ? "yes" : "no"}</span>
      <NexusChatWorkspace />
    </>
  );
}

function seedConversationList(conversationId: string, title: string) {
  queryResults.set(nexusChat.listMyConversations, {
    conversations: [
      {
        id: conversationId as Id<"nexusConversations">,
        title,
        updatedAt: Date.now(),
        status: "active",
      },
    ],
  });
  queryResults.set(nexusChat.listMyTasks, { tasks: [] });
  queryResults.set(nexusChat.getConversationTranscript, {
    messages: [
      { id: "m1", author: "user", content: "hello" },
      { id: "m2", author: "assistant", content: "historical answer" },
    ],
    tasks: [],
  });
}

beforeEach(() => {
  sessionStorage.clear();
  queryCalls.length = 0;
  queryResults.clear();
  mutationFn.mockClear();
  authState.userId = "user_A";
});

afterEach(() => {
  sessionStorage.clear();
});

describe("Nexus Chat session selection persistence", () => {
  it("restores the saved conversation and Transcripts tool after remount", async () => {
    const convoId = "convo_saved";
    writePersistedChatSession("user_A", {
      conversationId: convoId,
      requestedToolId: "membership_io.transcript_retrieve",
    });
    seedConversationList(convoId, "find themes");

    const first = render(
      <ChatSessionProvider canSubmit>
        <ChatHarness />
      </ChatSessionProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("ready")).toHaveTextContent("yes");
      expect(screen.getByTestId("active")).toHaveTextContent(convoId);
    });
    expect(screen.getByText("historical answer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Transcripts", pressed: true })).toBeInTheDocument();

    first.unmount();

    render(
      <ChatSessionProvider canSubmit>
        <ChatHarness />
      </ChatSessionProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("active")).toHaveTextContent(convoId);
      expect(screen.getByRole("button", { name: "Transcripts", pressed: true })).toBeInTheDocument();
    });
    expect(screen.getByText("historical answer")).toBeInTheDocument();
    expect(mutationFn).not.toHaveBeenCalled();
  });

  it("persists New chat across remount", async () => {
    writePersistedChatSession("user_A", {
      conversationId: null,
      requestedToolId: "vault.agentic_retrieval",
    });

    const { unmount } = render(
      <ChatSessionProvider canSubmit>
        <ChatHarness />
      </ChatSessionProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("ready")).toHaveTextContent("yes"));
    expect(screen.getByTestId("active")).toHaveTextContent("none");
    expect(screen.getByText("Welcome")).toBeInTheDocument();
    unmount();

    render(
      <ChatSessionProvider canSubmit>
        <ChatHarness />
      </ChatSessionProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("active")).toHaveTextContent("none"));
    expect(screen.getByText("Welcome")).toBeInTheDocument();
  });

  it("updates persistence when the user selects another conversation or tool", async () => {
    const user = userEvent.setup();
    seedConversationList("convo_a", "Alpha");
    queryResults.set(nexusChat.listMyConversations, {
      conversations: [
        {
          id: "convo_a" as Id<"nexusConversations">,
          title: "Alpha",
          updatedAt: Date.now(),
          status: "active",
        },
        {
          id: "convo_b" as Id<"nexusConversations">,
          title: "Beta",
          updatedAt: Date.now() - 1000,
          status: "active",
        },
      ],
    });

    render(
      <ChatSessionProvider canSubmit>
        <ChatHarness />
      </ChatSessionProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("ready")).toHaveTextContent("yes"));
    await user.click(screen.getByRole("button", { name: "History" }));
    await user.click(screen.getByRole("button", { name: /Beta/i }));

    const saved = JSON.parse(sessionStorage.getItem(chatSessionStorageKey("user_A"))!);
    expect(saved.conversationId).toBe("convo_b");

    await user.click(screen.getByRole("button", { name: "Transcripts" }));
    const savedTool = JSON.parse(sessionStorage.getItem(chatSessionStorageKey("user_A"))!);
    expect(savedTool.requestedToolId).toBe("membership_io.transcript_retrieve");
  });

  it("does not restore another user's saved conversation", async () => {
    writePersistedChatSession("user_B", {
      conversationId: "convo_b",
      requestedToolId: "vault.agentic_retrieval",
    });
    seedConversationList("convo_a", "Alpha");

    render(
      <ChatSessionProvider canSubmit>
        <ChatHarness />
      </ChatSessionProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("ready")).toHaveTextContent("yes"));
    expect(screen.getByTestId("active")).toHaveTextContent("none");
    expect(screen.queryByText("historical answer")).not.toBeInTheDocument();
  });

  it("falls back when the saved conversation no longer exists", async () => {
    writePersistedChatSession("user_A", {
      conversationId: "convo_missing",
      requestedToolId: "vault.agentic_retrieval",
    });
    queryResults.set(nexusChat.listMyConversations, { conversations: [] });
    queryResults.set(nexusChat.listMyTasks, { tasks: [] });

    render(
      <ChatSessionProvider canSubmit>
        <ChatHarness />
      </ChatSessionProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("ready")).toHaveTextContent("yes"));
    expect(screen.getByTestId("active")).toHaveTextContent("none");
    const saved = JSON.parse(sessionStorage.getItem(chatSessionStorageKey("user_A"))!);
    expect(saved.conversationId).toBeNull();
  });

  it("submits with the restored knowledge tool", async () => {
    const user = userEvent.setup();
    writePersistedChatSession("user_A", {
      conversationId: null,
      requestedToolId: "membership_io.transcript_retrieve",
    });
    queryResults.set(nexusChat.listMyConversations, { conversations: [] });
    queryResults.set(nexusChat.listMyTasks, { tasks: [] });

    render(
      <ChatSessionProvider canSubmit>
        <ChatHarness />
      </ChatSessionProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("ready")).toHaveTextContent("yes"));
    await user.type(screen.getByLabelText(/Message Nexus/i), "follow up");
    await user.click(screen.getByRole("button", { name: /Send/i }));

    expect(mutationFn).toHaveBeenCalledWith(
      expect.objectContaining({
        requestText: "follow up",
        requestedToolId: "membership_io.transcript_retrieve",
      }),
    );
  });
});
