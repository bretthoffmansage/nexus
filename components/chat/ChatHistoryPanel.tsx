"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import type { TaskStatus } from "@/convex/lib/taskStatus";
import { useChatSession } from "@/components/chat/ChatSessionContext";
import { nexusChat, taskStatusLabel } from "@/lib/nexus/p5Client";

const NEW_CHAT_HELP =
  "Start a new conversation. Existing requests remain saved in your history.";

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function StaticEmpty() {
  return (
    <aside className="nexus-chat-history-panel" aria-labelledby="nexus-history-title">
      <h2 className="nexus-chat-history-title" id="nexus-history-title">
        Conversations
      </h2>
      <p className="nexus-chat-history-empty">
        Sign in as an approved knowledge reader to see your private request history.
      </p>
    </aside>
  );
}

type LiveHistoryProps = {
  ready: boolean;
  canSubmit: boolean;
  selectConversation: (id: Id<"nexusConversations">) => void;
  startNewRequest: () => void;
  activeConversationId: string | null;
  onSelect?: () => void;
};

function LiveHistory({
  ready,
  canSubmit,
  selectConversation,
  startNewRequest,
  activeConversationId,
  onSelect,
}: LiveHistoryProps) {
  const conversations = useQuery(
    nexusChat.listMyConversations,
    ready ? { limit: 30 } : "skip",
  );
  const tasks = useQuery(nexusChat.listMyTasks, ready ? { limit: 100 } : "skip");

  const latestStatusByConversation = useMemo(() => {
    const map = new Map<string, TaskStatus>();
    for (const task of tasks?.tasks ?? []) {
      const key = task.conversationId as string;
      if (!map.has(key)) {
        map.set(key, task.status);
      }
    }
    return map;
  }, [tasks]);

  return (
    <aside className="nexus-chat-history-panel" aria-labelledby="nexus-history-title">
      <div className="nexus-chat-history-head">
        <button
          type="button"
          className="nexus-btn nexus-btn-primary nexus-new-chat-btn"
          disabled={!canSubmit || !ready}
          aria-disabled={!canSubmit || !ready}
          title={NEW_CHAT_HELP}
          onClick={() => {
            startNewRequest();
            onSelect?.();
          }}
        >
          New chat
        </button>
        <p className="nexus-chat-history-hint">{NEW_CHAT_HELP}</p>
      </div>

      <h2 className="nexus-chat-history-title" id="nexus-history-title">
        Conversations
      </h2>

      <div className="nexus-chat-history-list-wrap" role="region" aria-label="Conversation history">
        {!ready ? (
          <p className="nexus-chat-history-empty" aria-live="polite">
            Loading history…
          </p>
        ) : conversations === undefined ? (
          <p className="nexus-chat-history-empty" aria-live="polite">
            Loading your requests…
          </p>
        ) : conversations.conversations.length === 0 ? (
          <p className="nexus-chat-history-empty">
            No requests yet. Submit a question to get started.
          </p>
        ) : (
          <ul className="nexus-history-list">
            {conversations.conversations.map((conversation) => {
              const status = latestStatusByConversation.get(conversation.id);
              const isActive = conversation.id === activeConversationId;
              return (
                <li key={conversation.id}>
                  <button
                    type="button"
                    className={`nexus-history-item${isActive ? " is-active" : ""}`}
                    aria-current={isActive ? "true" : undefined}
                    onClick={() => {
                      selectConversation(conversation.id);
                      onSelect?.();
                    }}
                  >
                    <span className="nexus-history-item-top">
                      <span className="nexus-history-title">{conversation.title}</span>
                      {status ? (
                        <span className="nexus-tool-chip nexus-history-status">{taskStatusLabel(status)}</span>
                      ) : null}
                    </span>
                    <span className="nexus-history-meta">
                      {relativeTime(conversation.updatedAt)}
                      {conversation.status === "archived" ? " · archived" : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="nexus-chat-history-foot">
        <Link href="/tasks" className="nexus-chat-history-link">
          View all tasks
        </Link>
      </div>
    </aside>
  );
}

/**
 * Private conversation history for Nexus Chat (P6.1).
 * Lives inside the chat workspace — not the global sidebar.
 */
export function ChatHistoryPanel({ onConversationSelect }: { onConversationSelect?: () => void }) {
  const session = useChatSession();
  if (!session || !session.canSubmit) {
    return <StaticEmpty />;
  }
  return (
    <LiveHistory
      ready={session.readyForPrivateQueries}
      canSubmit={session.canSubmit}
      selectConversation={session.selectConversation}
      startNewRequest={session.startNewRequest}
      activeConversationId={session.activeConversationId}
      onSelect={onConversationSelect}
    />
  );
}
