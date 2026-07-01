"use client";

import { useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { useChatSession } from "@/components/chat/ChatSessionContext";
import { nexusChat } from "@/lib/nexus/p5Client";

function StaticEmpty() {
  return (
    <section className="nexus-sidebar-section" aria-labelledby="nexus-history-title">
      <h2 className="nexus-sidebar-section-title" id="nexus-history-title">
        Requests
      </h2>
      <p className="nexus-sidebar-empty">
        Sign in as an approved knowledge reader to see your private request history.
      </p>
    </section>
  );
}

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

function LiveHistory({
  ready,
  selectConversation,
  activeConversationId,
}: {
  /** Convex auth is confirmed — safe to run the private query (P5.1). */
  ready: boolean;
  selectConversation: (id: Id<"nexusConversations">) => void;
  activeConversationId: string | null;
}) {
  // P5.1: skip the private query entirely until Convex confirms auth, so the
  // component never issues an owner-scoped query during the readiness race.
  const data = useQuery(nexusChat.listMyConversations, ready ? { limit: 30 } : "skip");

  return (
    <section className="nexus-sidebar-section" aria-labelledby="nexus-history-title">
      <h2 className="nexus-sidebar-section-title" id="nexus-history-title">
        Requests
      </h2>
      {!ready ? (
        // Auth is still initializing — never present this as "no history",
        // which would falsely look like an empty authenticated account.
        <p className="nexus-sidebar-empty">Loading history…</p>
      ) : data === undefined ? (
        <p className="nexus-sidebar-empty">Loading your requests…</p>
      ) : data.conversations.length === 0 ? (
        <p className="nexus-sidebar-empty">No requests yet. Submit a question to get started.</p>
      ) : (
        <ul className="nexus-history-list">
          {data.conversations.map((conversation) => (
            <li key={conversation.id}>
              <button
                type="button"
                className={`nexus-history-item${
                  conversation.id === activeConversationId ? " is-active" : ""
                }`}
                onClick={() => selectConversation(conversation.id)}
              >
                <span className="nexus-history-title">{conversation.title}</span>
                <span className="nexus-history-meta">
                  {relativeTime(conversation.updatedAt)}
                  {conversation.status === "archived" ? " · archived" : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Private request history (P5). Lists only the signed-in user's own
 * conversations; clicking one reopens it in the chat workspace.
 */
export function TaskHistorySection() {
  const session = useChatSession();
  if (!session || !session.canSubmit) {
    return <StaticEmpty />;
  }
  return (
    <LiveHistory
      ready={session.readyForPrivateQueries}
      selectConversation={session.selectConversation}
      activeConversationId={session.activeConversationId}
    />
  );
}
