import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  isLoading: false,
  isAuthenticated: true,
  isRefreshing: false,
}));

const queryCalls = vi.hoisted(() => [] as Array<{ fn: unknown; args: unknown }>);
const queryResults = vi.hoisted(() => new Map<unknown, unknown>());
const mutationFn = vi.hoisted(() => vi.fn(async () => ({ conversationId: "convo_new" })));

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
import { ChatHistoryPanel } from "@/components/chat/ChatHistoryPanel";
import { NexusChatWorkspace } from "@/components/chat/NexusChatWorkspace";
import { Sidebar } from "@/components/layout/Sidebar";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { StatusWorkspace } from "@/components/workspace/port/StatusWorkspace";
import { nexusChat } from "@/lib/nexus/p5Client";

const ROOT = path.resolve(__dirname, "..");

function lastCallFor(fn: unknown) {
  const calls = queryCalls.filter((c) => c.fn === fn);
  return calls[calls.length - 1];
}

beforeEach(() => {
  queryCalls.length = 0;
  queryResults.clear();
  mutationFn.mockClear();
  authState.isLoading = false;
  authState.isAuthenticated = true;
});

describe("P6.1 — chat history placement", () => {
  it("1-2. global sidebar no longer renders New request or Requests history", () => {
    const src = readFileSync(path.join(ROOT, "components/layout/Sidebar.tsx"), "utf8");
    expect(src).not.toMatch(/New request|New chat/i);
    expect(src).not.toContain("TaskHistorySection");
    expect(src).not.toContain("Requests");

    render(
      <ThemeProvider>
        <Sidebar open clerkEnabled={false} onClose={() => undefined} />
      </ThemeProvider>,
    );
    expect(screen.queryByRole("button", { name: /New (chat|request)/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/^Requests$/i)).not.toBeInTheDocument();
  });

  it("3-5. Nexus Chat renders history panel with New chat and conversations", () => {
    queryResults.set(nexusChat.listMyConversations, {
      conversations: [
        {
          id: "convo_a" as Id<"nexusConversations">,
          title: "Vault question",
          updatedAt: Date.now(),
          status: "active",
        },
      ],
    });
    queryResults.set(nexusChat.listMyTasks, {
      tasks: [
        {
          id: "task_1" as Id<"nexusTasks">,
          conversationId: "convo_a" as Id<"nexusConversations">,
          status: "queued",
        },
      ],
    });

    render(
      <ChatSessionProvider canSubmit>
        <NexusChatWorkspace />
      </ChatSessionProvider>,
    );

    expect(screen.getByRole("region", { name: "Conversation history" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New chat" })).toBeInTheDocument();
    expect(screen.getByText("Vault question")).toBeInTheDocument();
  });

  it("6-7. highlights selected conversation and shows task status", async () => {
    const user = userEvent.setup();
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
          updatedAt: Date.now() - 60_000,
          status: "active",
        },
      ],
    });
    queryResults.set(nexusChat.listMyTasks, {
      tasks: [
        {
          id: "task_b" as Id<"nexusTasks">,
          conversationId: "convo_b" as Id<"nexusConversations">,
          status: "completed",
        },
      ],
    });

    render(
      <ChatSessionProvider canSubmit>
        <NexusChatWorkspace />
      </ChatSessionProvider>,
    );

    await user.click(screen.getByRole("button", { name: /Beta/i }));
    const beta = screen.getByRole("button", { name: /Beta/i });
    expect(beta).toHaveAttribute("aria-current", "true");
    expect(within(beta).getByText(/Completed/i)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Conversation history" })).toBeInTheDocument();
  });

  it("8. shows truthful loading state before conversations resolve", () => {
    render(
      <ChatSessionProvider canSubmit>
        <ChatHistoryPanel />
      </ChatSessionProvider>,
    );
    expect(screen.getByText("Loading your requests…")).toBeInTheDocument();
  });

  it("9-12. New chat clears selection without deleting history or mutating tasks", async () => {
    const user = userEvent.setup();
    queryResults.set(nexusChat.listMyConversations, {
      conversations: [
        {
          id: "convo_a" as Id<"nexusConversations">,
          title: "Keep me",
          updatedAt: Date.now(),
          status: "active",
        },
      ],
    });
    queryResults.set(nexusChat.listMyTasks, { tasks: [] });

    function Harness() {
      const session = useChatSession();
      return (
        <>
          <span data-testid="active">{session?.activeConversationId ?? "none"}</span>
          <NexusChatWorkspace />
        </>
      );
    }

    render(
      <ChatSessionProvider canSubmit>
        <Harness />
      </ChatSessionProvider>,
    );

    await user.click(screen.getByRole("button", { name: /Keep me/i }));
    expect(screen.getByTestId("active")).toHaveTextContent("convo_a");

    await user.click(screen.getByRole("button", { name: "New chat" }));
    expect(screen.getByTestId("active")).toHaveTextContent("none");
    expect(screen.getByRole("button", { name: /Keep me/i })).toBeInTheDocument();
    expect(mutationFn).not.toHaveBeenCalled();
  });

  it("13-14. reopening a completed conversation restores transcript and sources", async () => {
    const user = userEvent.setup();
    const taskId = "task_done" as Id<"nexusTasks">;
    const convoId = "convo_done" as Id<"nexusConversations">;

    queryResults.set(nexusChat.listMyConversations, {
      conversations: [
        { id: convoId, title: "Done chat", updatedAt: Date.now(), status: "active" },
      ],
    });
    queryResults.set(nexusChat.listMyTasks, {
      tasks: [{ id: taskId, conversationId: convoId, status: "completed" }],
    });
    queryResults.set(nexusChat.getConversationTranscript, {
      messages: [
        { id: "m1", author: "user", content: "What is Nexus?" },
        { id: "m2", author: "assistant", content: "Nexus is the hosted console." },
      ],
      tasks: [
        {
          id: taskId,
          status: "completed",
          requestedToolId: "vault.agentic_retrieval",
          attemptNumber: 1,
        },
      ],
    });
    queryResults.set(nexusChat.listMyTaskSources, [
      { id: "s1", title: "KB doc", sourceType: "knowledge_base", locator: "kb/1" },
    ]);

    render(
      <ChatSessionProvider canSubmit>
        <NexusChatWorkspace />
      </ChatSessionProvider>,
    );

    await user.click(screen.getByRole("button", { name: /History/i }));
    await user.click(screen.getByRole("button", { name: "History" }));
    await user.click(screen.getByRole("button", { name: /Done chat/i }));
    expect(screen.getByText("What is Nexus?")).toBeInTheDocument();
    expect(screen.getByText("Nexus is the hosted console.")).toBeInTheDocument();
    expect(screen.getByText("KB doc")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Answer" })).not.toBeInTheDocument();
  });

  it("15. skips private history queries when unauthenticated", () => {
    authState.isAuthenticated = false;
    render(
      <ChatSessionProvider canSubmit>
        <ChatHistoryPanel />
      </ChatSessionProvider>,
    );
    expect(lastCallFor(nexusChat.listMyConversations)?.args).toBe("skip");
  });
});

describe("P6.1 — duplicate status removal", () => {
  it("16-19. sidebar has no Claudia card; status route keeps Connector copy", () => {
    const sidebarSrc = readFileSync(path.join(ROOT, "components/layout/Sidebar.tsx"), "utf8");
    expect(sidebarSrc).not.toContain("ClaudiaPresenceLive");

    render(
      <ThemeProvider>
        <Sidebar open clerkEnabled={false} onClose={() => undefined} />
      </ThemeProvider>,
    );
    expect(screen.queryByText(/Connector not configured/i)).not.toBeInTheDocument();

    render(<StatusWorkspace />);
    expect(screen.getByRole("heading", { name: "Status" })).toBeInTheDocument();
    expect(
      screen.getByText(/Execution begins when the Claudia Connector is online and claims queued work/i),
    ).toBeInTheDocument();

    render(
      <ChatSessionProvider canSubmit>
        <NexusChatWorkspace />
      </ChatSessionProvider>,
    );
    expect(screen.queryByText(/Private knowledge requests/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Requests are saved and queued/i)).not.toBeInTheDocument();
  });
});

describe("P6.1 — viewport layout structure", () => {
  it("20-27. shell and chat CSS establish bounded viewport and internal scroll", () => {
    const shellCss = readFileSync(path.join(ROOT, "styles/shell.css"), "utf8");
    const chatCss = readFileSync(path.join(ROOT, "styles/chat.css"), "utf8");
    const globalsCss = readFileSync(path.join(ROOT, "app/globals.css"), "utf8");

    expect(shellCss).toMatch(/\.nexus-app[\s\S]*height:\s*100dvh/);
    expect(shellCss).toMatch(/\.nexus-workspace[\s\S]*min-height:\s*0/);
    expect(shellCss).toMatch(/\.nexus-sidebar-nav-scroll[\s\S]*overflow-y:\s*auto/);
    expect(chatCss).toMatch(/\.nexus-chat-scroll[\s\S]*overflow-y:\s*auto/);
    expect(chatCss).toMatch(/\.nexus-chat-history-list-wrap[\s\S]*overflow-y:\s*auto/);
    expect(chatCss).toMatch(/\.nexus-chat-footer/);
    expect(globalsCss).toMatch(/overflow:\s*hidden/);
  });

  it("28-29. centered stage layout and detached history anchoring are defined", () => {
    const chatCss = readFileSync(path.join(ROOT, "styles/chat.css"), "utf8");
    expect(chatCss).toMatch(/\.nexus-chat-stage/);
    expect(chatCss).toMatch(/var\(--nexus-content-max\)/);
    expect(chatCss).toMatch(/@container nexus-chat-stage/);
    expect(chatCss).toMatch(/\.nexus-chat-history-toggle/);
  });

  it("30. P4.4 tool routes still exist in registry", () => {
    const registry = readFileSync(path.join(ROOT, "lib/navigation/toolRegistry.ts"), "utf8");
    for (const href of ["/email", "/calendar", "/tasks", "/status", "/settings"]) {
      expect(registry).toContain(href);
    }
  });
});
