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
import { CollapsibleSources } from "@/components/sources/CollapsibleSources";
import { WorkerActivityFeed } from "@/components/status/WorkerActivityFeed";
import {
  nexusChat,
  newIdempotencyKey,
  taskExecutionNote,
  taskStatusLabel,
} from "@/lib/nexus/p5Client";
import { P5_TOOL_DISPLAY_TITLES, type P5ToolId } from "@/convex/lib/p5config";
import type { NexusSource } from "@/lib/types/presentation";

export function ChatEmptyState() {
  return (
    <div className="nexus-chat-empty">
      <h2 className="nexus-chat-empty-title">Welcome</h2>
      <p className="nexus-chat-empty-copy">
        Ask a knowledge question and Nexus saves it privately and queues it. Execution begins when
        the Console Connector is online and claims the request through the trusted Connector
        protocol — Nexus Core is never exposed to the public internet. Answers and their sources
        appear here once the Connector completes the work.
      </p>
      <ul className="nexus-chat-empty-list">
        <li>Vault retrieval</li>
        <li>{P5_TOOL_DISPLAY_TITLES["knowledge.asset_query"]}</li>
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

  // Per-message worker-activity readback: fetch the latest task's progress only
  // while it is running or after it has failed. A successful task hides the feed
  // (skip → no query), so it never competes with the final answer or sources.
  const latestProgress = useQuery(
    nexusChat.listMyTaskProgress,
    latestTask && ready && (!isTerminalStatus(latestTask.status) || latestTask.status === "failed")
      ? { taskId: latestTask.id }
      : "skip",
  );

  const baselineIdsRef = useRef<Set<string>>(new Set());
  const baselineConversationRef = useRef<string | null>(null);
  const baselineSeededRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // When "pinned" we keep the newest content in view; any user scroll-up releases it
  // so the transcript can be read freely — including mid typing animation.
  const pinnedRef = useRef(true);
  // Guards our own programmatic scrolls so they are never read as user intent.
  const programmaticRef = useRef(false);

  if (activeConversationId !== baselineConversationRef.current) {
    baselineConversationRef.current = activeConversationId;
    baselineIdsRef.current = new Set();
    baselineSeededRef.current = false;
  }

  // Re-pin on conversation change so opening a thread lands at its latest message.
  useEffect(() => {
    pinnedRef.current = true;
  }, [activeConversationId]);

  if (activeConversationId && transcript?.messages && !baselineSeededRef.current) {
    baselineIdsRef.current = new Set(transcript.messages.map((m) => String(m.id)));
    baselineSeededRef.current = true;
  }

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = el.scrollHeight - el.clientHeight;
    // Already at the bottom — skip, so we never leave the programmatic guard stuck
    // (a no-op scrollTop assignment fires no scroll event to clear it).
    if (target - el.scrollTop < 1) return;
    programmaticRef.current = true;
    el.scrollTop = target;
  }, []);

  // Follow growing content (new messages, typing animation, sources) only while the
  // user is pinned to the bottom. Once they scroll up, this becomes a no-op.
  const followGrowth = useCallback(() => {
    if (pinnedRef.current) scrollToBottom();
  }, [scrollToBottom]);

  // Keep following as the transcript and sources grow, but never fight the user:
  // any upward scroll (wheel, keys, or dragging the bar up) releases the pin, and it
  // re-engages only when they return to the bottom on their own.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let lastTop = el.scrollTop;

    const onScroll = () => {
      if (programmaticRef.current) {
        // This event is the echo of our own scroll — record position, ignore intent.
        programmaticRef.current = false;
        lastTop = el.scrollTop;
        return;
      }
      const top = el.scrollTop;
      const distance = el.scrollHeight - top - el.clientHeight;
      if (top < lastTop - 1) {
        pinnedRef.current = false; // user scrolled up → stop following
      } else if (distance <= 32) {
        pinnedRef.current = true; // user returned to the bottom → follow again
      }
      lastTop = top;
    };
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) pinnedRef.current = false;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowUp" || event.key === "PageUp" || event.key === "Home") {
        pinnedRef.current = false;
      }
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("keydown", onKeyDown);
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  // Snap to the latest content when the thread first loads and whenever new
  // messages/sources/status arrive — but only if the user is still pinned to the
  // bottom. latestProgress is the live worker-activity readback: each new
  // activity line grows the page just like answer text, so it must follow too.
  useEffect(() => {
    followGrowth();
  }, [transcript?.messages, sourceRows, latestTask?.status, latestProgress, followGrowth]);

  async function handleSubmit(text: string, requestedToolId: P5ToolId) {
    if (!canSubmit || !ready) return;
    // Sending a message re-pins to the bottom so the new turn scrolls into
    // view — and snaps immediately, so a submit from a scrolled-up position
    // lands at the composer's turn without waiting for the server echo.
    pinnedRef.current = true;
    followGrowth();
    setPending(true);
    setSubmitError(null);
    try {
      const res = await submitRequest({
        requestText: text,
        conversationId: activeConversationId ?? undefined,
        idempotencyKey: newIdempotencyKey(),
        requestedToolId,
      });
      if (res.conversationId !== undefined) {
        session?.selectConversation(res.conversationId);
      }
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
    <section className="nexus-chat-workspace" aria-label="Chat">
      <div className="nexus-chat-stage">
        <div className="nexus-chat-main">
          <header className="nexus-chat-workspace-head">
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
                    <WorkerActivityFeed events={latestProgress} label="Retrieval activity" />
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
                    {/* On failure the safe failure message stays, and the last
                        activity lines are retained beneath it. */}
                    <WorkerActivityFeed events={latestProgress} label="Retrieval activity" />
                  </div>
                ) : null}

                {showSources ? (
                  <div className="nexus-result-section">
                    <CollapsibleSources sources={sources} />
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
