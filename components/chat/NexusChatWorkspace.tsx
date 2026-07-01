"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import type { TaskStatus } from "@/convex/lib/taskStatus";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatHistoryPanel } from "@/components/chat/ChatHistoryPanel";
import { TranscriptMessage } from "@/components/chat/TranscriptMessage";
import { useChatSession } from "@/components/chat/ChatSessionContext";
import { ModeToggle } from "@/components/chat/ModeToggle";
import { SourceList } from "@/components/sources/SourceList";
import {
  nexusChat,
  newIdempotencyKey,
  taskExecutionNote,
  taskStatusLabel,
} from "@/lib/nexus/p5Client";
import type { P5ToolId } from "@/convex/lib/p5config";
import type { NexusSource } from "@/lib/types/presentation";

export function ChatEmptyState() {
  return (
    <div className="nexus-chat-empty">
      <h2 className="nexus-chat-empty-title">Welcome</h2>
      <p className="nexus-chat-empty-copy">
        Ask a knowledge question and Nexus saves it privately and queues it. Execution begins when
        the Claudia Connector is online and claims the request through the trusted Connector
        protocol — Claudia Core is never exposed to the public internet. Answers and their sources
        appear here once the Connector completes the work.
      </p>
      <ul className="nexus-chat-empty-list">
        <li>Sage Knowledge Base retrieval</li>
        <li>Membership.io transcript retrieval</li>
        <li>Summaries and synthesis with sources</li>
      </ul>
    </div>
  );
}

const DISABLED_HELP = "Sign in as an approved knowledge reader to submit requests.";
const INITIALIZING_HELP = "Connecting to Nexus…";

function isTerminalStatus(status: TaskStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

/**
 * Nexus Chat workspace — transcript-owned answers, compact status, in-route history.
 */
export function NexusChatWorkspace() {
  const session = useChatSession();
  const canSubmit = session?.canSubmit ?? false;
  const ready = session?.readyForPrivateQueries ?? false;
  const chatSessionReady = session?.chatSessionReady ?? true;
  const activeConversationId = session?.activeConversationId ?? null;
  const [historyOpen, setHistoryOpen] = useState(false);

  const submitRequest = useMutation(nexusChat.submitRequest);
  const [pending, setPending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const transcript = useQuery(
    nexusChat.getConversationTranscript,
    activeConversationId && ready ? { conversationId: activeConversationId } : "skip",
  );

  const tasks = transcript?.tasks ?? [];
  const latestTask = tasks.length ? tasks[tasks.length - 1] : null;
  const latestTerminal = latestTask && isTerminalStatus(latestTask.status);

  const sourceRows = useQuery(
    nexusChat.listMyTaskSources,
    latestTask && ready && latestTask.status === "completed"
      ? { taskId: latestTask.id }
      : "skip",
  );

  const baselineIdsRef = useRef<Set<string>>(new Set());
  const baselineConversationRef = useRef<string | null>(null);
  const baselineSeededRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const userPinnedRef = useRef(false);

  if (activeConversationId !== baselineConversationRef.current) {
    baselineConversationRef.current = activeConversationId;
    baselineIdsRef.current = new Set();
    baselineSeededRef.current = false;
    userPinnedRef.current = false;
  }

  if (activeConversationId && transcript?.messages && !baselineSeededRef.current) {
    baselineIdsRef.current = new Set(transcript.messages.map((m) => String(m.id)));
    baselineSeededRef.current = true;
  }

  const followGrowth = useCallback(() => {
    const el = scrollRef.current;
    if (!el || userPinnedRef.current) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distance < 120) {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      userPinnedRef.current = distance > 160;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [activeConversationId]);

  async function handleSubmit(text: string, requestedToolId: P5ToolId) {
    if (!canSubmit || !ready) return;
    setPending(true);
    setSubmitError(null);
    try {
      const res = await submitRequest({
        requestText: text,
        conversationId: activeConversationId ?? undefined,
        idempotencyKey: newIdempotencyKey(),
        requestedToolId,
      });
      session?.selectConversation(res.conversationId);
    } catch (error) {
      setSubmitError(friendlyError(error));
      throw error;
    } finally {
      setPending(false);
    }
  }

  const sources: NexusSource[] = (sourceRows ?? []).map((source) => ({
    id: source.id,
    title: source.title,
    sourceType: source.sourceType,
    location: source.locator ?? undefined,
    excerpt: source.excerpt ?? undefined,
    provenanceLabel: source.provenanceLabel ?? undefined,
  }));

  const showSources =
    latestTask?.status === "completed" && sources.length > 0;

  const showStatus =
    latestTask &&
    !isTerminalStatus(latestTask.status);

  const showFailedStatus = latestTask?.status === "failed";

  return (
    <section className="nexus-chat-workspace" aria-labelledby="nexus-chat-heading">
      <div className="nexus-chat-stage">
        <div className="nexus-chat-main">
          <header className="nexus-chat-workspace-head">
            <div>
              <h1 className="nexus-chat-heading" id="nexus-chat-heading">
                Nexus Chat
              </h1>
            </div>
            <div className="nexus-chat-head-actions">
              <button
                type="button"
                className="nexus-btn nexus-btn-ghost nexus-chat-history-toggle"
                aria-expanded={historyOpen}
                aria-controls="nexus-chat-history-panel"
                onClick={() => setHistoryOpen((open) => !open)}
              >
                History
              </button>
              <ModeToggle />
            </div>
          </header>

          <div
            ref={scrollRef}
            className="nexus-chat-scroll"
            role="region"
            aria-label="Chat messages"
          >
            {!chatSessionReady ? (
              <p className="nexus-chat-history-empty" aria-live="polite">
                Loading conversation…
              </p>
            ) : !activeConversationId ? (
              <ChatEmptyState />
            ) : (
              <>
                <ul className="nexus-transcript">
                  {(transcript?.messages ?? []).map((message) => (
                    <TranscriptMessage
                      key={message.id}
                      message={message}
                      animate={!baselineIdsRef.current.has(String(message.id))}
                      onGrowth={followGrowth}
                    />
                  ))}
                </ul>

                {showStatus ? (
                  <div className="nexus-result-section nexus-task-status-compact">
                    <p className="nexus-task-status-line">
                      <span className="nexus-tool-chip">{taskStatusLabel(latestTask.status)}</span>
                      <span className="nexus-empty-copy">
                        {taskExecutionNote(latestTask.status)}
                      </span>
                    </p>
                  </div>
                ) : null}

                {showFailedStatus ? (
                  <div className="nexus-result-section nexus-task-status-compact">
                    <p className="nexus-task-status-line">
                      <span className="nexus-tool-chip">{taskStatusLabel("failed")}</span>
                      <span className="nexus-empty-copy">
                        {latestTask.errorCode
                          ? `Request failed (${latestTask.errorCode}).`
                          : taskExecutionNote("failed")}
                      </span>
                    </p>
                  </div>
                ) : null}

                {showSources ? (
                  <div className="nexus-result-section">
                    <h2 className="nexus-section-label">Sources</h2>
                    <SourceList sources={sources} emptyLabel="" />
                  </div>
                ) : null}
              </>
            )}
          </div>

          <div className="nexus-chat-footer">
            <ChatComposer
              disabled={!canSubmit || !ready || !chatSessionReady}
              pending={pending}
              helpText={!canSubmit ? DISABLED_HELP : !ready ? INITIALIZING_HELP : undefined}
              toolId={session?.selectedToolId}
              onToolIdChange={session?.setSelectedToolId}
              onSubmit={handleSubmit}
              errorText={submitError}
            />
          </div>
        </div>

        <div
          id="nexus-chat-history-panel"
          className={`nexus-chat-history-shell${historyOpen ? " is-open" : ""}`}
        >
          {historyOpen ? (
            <button
              type="button"
              className="nexus-chat-history-backdrop"
              aria-label="Close conversation history"
              onClick={() => setHistoryOpen(false)}
            />
          ) : null}
          <ChatHistoryPanel onConversationSelect={() => setHistoryOpen(false)} />
        </div>
      </div>
    </section>
  );
}

function friendlyError(error: unknown): string {
  const code =
    error && typeof error === "object" && "data" in error
      ? (error as { data?: { code?: string } }).data?.code
      : undefined;
  switch (code) {
    case "request_too_large":
      return "That request is too long. Please shorten it.";
    case "invalid_tool":
      return "That tool is not available.";
    case "role_required":
    case "approval_required":
      return "Your account is not approved for knowledge requests yet.";
    case "queue_unavailable":
      return "The queue is not accepting new work right now.";
    default:
      return "Submission failed. Please try again.";
  }
}
