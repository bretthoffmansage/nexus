"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
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
  const deleteConversation = useMutation(nexusChat.deleteMyConversation);
  const [editMode, setEditMode] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<Id<"nexusConversations"> | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  const pendingConversation = conversations?.conversations.find((c) => c.id === pendingDeleteId);

  async function confirmDelete() {
    if (!pendingDeleteId || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteConversation({ conversationId: pendingDeleteId });
      if (activeConversationId === pendingDeleteId) {
        const remaining = (conversations?.conversations ?? []).filter(
          (c) => c.id !== pendingDeleteId,
        );
        if (remaining.length > 0) {
          selectConversation(remaining[0].id);
        } else {
          startNewRequest();
        }
      }
      setPendingDeleteId(null);
      setEditMode(false);
    } catch {
      setDeleteError("Could not delete this conversation. Please try again.");
    } finally {
      setDeleteBusy(false);
    }
  }

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

      <div className="nexus-chat-history-title-row">
        <h2 className="nexus-chat-history-title" id="nexus-history-title">
          Conversations
        </h2>
        {ready && (conversations?.conversations.length ?? 0) > 0 ? (
          <button
            type="button"
            className={`nexus-history-edit-toggle${editMode ? " is-active" : ""}`}
            aria-pressed={editMode}
            aria-label={editMode ? "Done editing conversations" : "Edit conversations"}
            title={editMode ? "Done" : "Edit"}
            onClick={() => {
              setEditMode((on) => !on);
              setPendingDeleteId(null);
              setDeleteError(null);
            }}
          >
            {editMode ? "Done" : "Edit"}
          </button>
        ) : null}
      </div>

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
          <ul className={`nexus-history-list${editMode ? " is-edit-mode" : ""}`}>
            {conversations.conversations.map((conversation) => {
              const status = latestStatusByConversation.get(conversation.id);
              const isActive = conversation.id === activeConversationId;
              return (
                <li key={conversation.id} className="nexus-history-row">
                  <button
                    type="button"
                    className={`nexus-history-item${isActive ? " is-active" : ""}`}
                    aria-current={isActive ? "true" : undefined}
                    onClick={() => {
                      if (editMode) return;
                      selectConversation(conversation.id);
                      onSelect?.();
                    }}
                  >
                    <span className="nexus-history-item-top">
                      <span className="nexus-history-title">{conversation.title}</span>
                      {status ? (
                        <span className="nexus-tool-chip nexus-history-status">
                          {taskStatusLabel(status)}
                        </span>
                      ) : null}
                    </span>
                    <span className="nexus-history-meta">
                      {relativeTime(conversation.updatedAt)}
                      {conversation.status === "archived" ? " · archived" : ""}
                    </span>
                  </button>
                  {editMode ? (
                    <button
                      type="button"
                      className="nexus-history-delete-btn"
                      aria-label={`Delete conversation ${conversation.title}`}
                      title="Delete conversation"
                      onClick={() => {
                        setDeleteError(null);
                        setPendingDeleteId(conversation.id);
                      }}
                    >
                      <span aria-hidden="true">🗑</span>
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {deleteError ? (
        <p className="nexus-chat-history-delete-error" role="alert">
          {deleteError}
        </p>
      ) : null}

      <div className="nexus-chat-history-foot">
        <Link href="/tasks" className="nexus-chat-history-link">
          View all tasks
        </Link>
      </div>

      {pendingDeleteId && pendingConversation ? (
        <div
          className="nexus-history-delete-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="nexus-delete-dialog-title"
        >
          <div className="nexus-history-delete-dialog-card">
            <h3 id="nexus-delete-dialog-title" className="nexus-history-delete-dialog-title">
              Delete conversation?
            </h3>
            <p className="nexus-history-delete-dialog-copy">
              <strong>{pendingConversation.title}</strong> and its chat messages will be removed.
              Tasks from this conversation stay in your Tasks list.
            </p>
            <div className="nexus-history-delete-dialog-actions">
              <button
                type="button"
                className="nexus-btn nexus-btn-ghost"
                disabled={deleteBusy}
                onClick={() => {
                  setPendingDeleteId(null);
                  setDeleteError(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="nexus-btn nexus-btn-danger"
                disabled={deleteBusy}
                onClick={() => void confirmDelete()}
              >
                {deleteBusy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
