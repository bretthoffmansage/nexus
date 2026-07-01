"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { AnswerPanel } from "@/components/chat/AnswerPanel";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { useChatSession } from "@/components/chat/ChatSessionContext";
import { ModeToggle } from "@/components/chat/ModeToggle";
import { DiagnosticsPanel } from "@/components/diagnostics/DiagnosticsPanel";
import { SourceList } from "@/components/sources/SourceList";
import {
  nexusChat,
  newIdempotencyKey,
  taskExecutionNote,
  taskStatusLabel,
} from "@/lib/nexus/p5Client";
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

const DISABLED_HELP =
  "Sign in as an approved knowledge reader to submit requests.";
const INITIALIZING_HELP = "Connecting to Nexus…";
const ENABLED_HELP =
  "Requests are saved and queued. Execution waits for the Claudia Connector (not configured yet).";

/**
 * Preserved Nexus Chat workspace (P3/P4), now backed by private Convex
 * persistence (P5). Submitting persists a user message and a queued task; no
 * execution happens yet — queued work honestly waits for the Console Connector.
 *
 * P5.1: every private query/mutation below is gated on `readyForPrivateQueries`
 * (Convex's own confirmed-auth signal), not just `canSubmit` (server-derived
 * authorization). Clerk reporting signed-in and Convex confirming the auth
 * token are different moments; issuing a query in that gap is what produced
 * the `unauthenticated` server error this package repairs.
 */
export function NexusChatWorkspace() {
  const session = useChatSession();
  const canSubmit = session?.canSubmit ?? false;
  const ready = session?.readyForPrivateQueries ?? false;
  const activeConversationId = session?.activeConversationId ?? null;

  const submitRequest = useMutation(nexusChat.submitRequest);
  const [pending, setPending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const transcript = useQuery(
    nexusChat.getConversationTranscript,
    activeConversationId && ready ? { conversationId: activeConversationId } : "skip",
  );

  const tasks = transcript?.tasks ?? [];
  const latestTask = tasks.length ? tasks[tasks.length - 1] : null;

  const result = useQuery(
    nexusChat.getMyTaskResult,
    latestTask && ready ? { taskId: latestTask.id } : "skip",
  );
  const sourceRows = useQuery(
    nexusChat.listMyTaskSources,
    latestTask && ready ? { taskId: latestTask.id } : "skip",
  );

  async function handleSubmit(text: string) {
    // Guards both authorization (canSubmit) and Convex auth readiness — a
    // mutation must never fire while the auth token is still initializing.
    if (!canSubmit || !ready) return;
    setPending(true);
    setSubmitError(null);
    try {
      const res = await submitRequest({
        requestText: text,
        conversationId: activeConversationId ?? undefined,
        idempotencyKey: newIdempotencyKey(),
      });
      session?.selectConversation(res.conversationId);
    } catch (error) {
      setSubmitError(friendlyError(error));
      throw error; // keep the composer text on failure
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

  const answer = result?.answerText
    ? { text: result.answerText, partial: false }
    : null;
  const answerEmptyLabel = latestTask
    ? taskExecutionNote(latestTask.status)
    : undefined;

  return (
    <section className="nexus-chat-workspace" aria-labelledby="nexus-chat-heading">
      <header className="nexus-chat-workspace-head">
        <div>
          <h1 className="nexus-chat-heading" id="nexus-chat-heading">
            Nexus Chat
          </h1>
          <p className="nexus-chat-subheading">Private knowledge requests · queued for Claudia</p>
        </div>
        <ModeToggle />
      </header>

      <div className="nexus-chat-scroll" role="region" aria-label="Chat messages">
        {!activeConversationId ? (
          <ChatEmptyState />
        ) : (
          <>
            <div className="nexus-result-section">
              <h2 className="nexus-section-label">Conversation</h2>
              <ul className="nexus-transcript">
                {(transcript?.messages ?? []).map((message) => (
                  <li
                    key={message.id}
                    className={`nexus-transcript-item nexus-transcript-${message.author}`}
                  >
                    <span className="nexus-transcript-author">{message.author}</span>
                    <span className="nexus-transcript-body">{message.content}</span>
                  </li>
                ))}
              </ul>
            </div>

            {latestTask ? (
              <div className="nexus-result-section">
                <h2 className="nexus-section-label">Status</h2>
                <p className="nexus-task-status-line">
                  <span className="nexus-tool-chip">{taskStatusLabel(latestTask.status)}</span>
                  <span className="nexus-empty-copy">{taskExecutionNote(latestTask.status)}</span>
                </p>
              </div>
            ) : null}
          </>
        )}

        <div className="nexus-result-section">
          <h2 className="nexus-section-label">Answer</h2>
          <AnswerPanel answer={answer} emptyLabel={answerEmptyLabel} />
        </div>
        <div className="nexus-result-section">
          <h2 className="nexus-section-label">Sources</h2>
          <SourceList sources={sources} />
        </div>
      </div>

      <ChatComposer
        disabled={!canSubmit || !ready}
        pending={pending}
        helpText={!canSubmit ? DISABLED_HELP : !ready ? INITIALIZING_HELP : ENABLED_HELP}
        onSubmit={handleSubmit}
        errorText={submitError}
      />
      <DiagnosticsPanel />
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
