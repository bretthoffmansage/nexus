"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { DEEP_RESEARCH_MAX_REQUEST_LENGTH } from "@/convex/lib/deepResearchConfig";
import { SafeExternalLink } from "@/components/nexus/SafeExternalLink";
import { SafeMarkdown } from "@/components/nexus/SafeMarkdown";
import { nexusDeepResearch } from "@/lib/nexus/deepResearchClient";
import {
  clearActiveTaskId,
  loadActiveTaskId,
  loadOrCreateIdempotencyKey,
  loadOrCreateResearchRequestId,
  rememberActiveTaskId,
  researchRequestValidationMessage,
  rotateIdempotencyKey,
  rotateResearchRequestSession,
  validateResearchRequestLength,
} from "@/lib/nexus/deepResearchSession";
import {
  blockedResearchMessage,
  deepResearchLifecycleLabel,
  deriveDeepResearchLifecycle,
  formatResearchDuration,
  isDeepResearchTaskActive,
} from "@/lib/nexus/deepResearchView";
import { isSafeHttpUrl } from "@/lib/nexus/safeHttpUrl";
import { taskExecutionNote, taskStatusLabel } from "@/lib/nexus/p5Client";
import { useNexusAuthReadiness } from "@/lib/nexus/useNexusAuthReadiness";

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function requestPreview(text: string, max = 120): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max).trimEnd()}…`;
}

export function ResearchWorkspace() {
  const { isLoading, isAuthenticated, readyForPrivateQueries: ready } = useNexusAuthReadiness();
  const [researchRequestId, setResearchRequestId] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [requestText, setRequestText] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<Id<"nexusTasks"> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    setResearchRequestId(loadOrCreateResearchRequestId());
    setIdempotencyKey(loadOrCreateIdempotencyKey());
    const storedTaskId = loadActiveTaskId();
    if (storedTaskId) {
      setSelectedTaskId(storedTaskId as Id<"nexusTasks">);
    }
  }, []);

  const tasksPage = useQuery(
    nexusDeepResearch.listMyDeepResearchTasks,
    ready ? { limit: 20 } : "skip",
  );
  const connectorStatus = useQuery(nexusDeepResearch.connectorStatus, ready ? {} : "skip");
  const submitDeepResearch = useMutation(nexusDeepResearch.submitDeepResearch);
  const cancelTask = useMutation(nexusDeepResearch.cancelTask);

  const validation = useMemo(() => validateResearchRequestLength(requestText), [requestText]);
  const charCount = validation.length;

  const activeTask = useMemo(() => {
    const rows = tasksPage?.tasks ?? [];
    const fromId = selectedTaskId ? rows.find((task) => task.id === selectedTaskId) : null;
    if (fromId && isDeepResearchTaskActive(fromId.status)) {
      return fromId;
    }
    return rows.find((task) => isDeepResearchTaskActive(task.status)) ?? null;
  }, [selectedTaskId, tasksPage?.tasks]);

  const detailTaskId = selectedTaskId ?? activeTask?.id ?? tasksPage?.tasks[0]?.id ?? null;

  const detailTask = useQuery(
    nexusDeepResearch.getMyTask,
    ready && detailTaskId ? { taskId: detailTaskId } : "skip",
  );
  const detailResult = useQuery(
    nexusDeepResearch.getMyTaskResult,
    ready && detailTaskId ? { taskId: detailTaskId } : "skip",
  );
  const detailSources = useQuery(
    nexusDeepResearch.listMyTaskSources,
    ready && detailTaskId ? { taskId: detailTaskId } : "skip",
  );
  const detailProgress = useQuery(
    nexusDeepResearch.listMyTaskProgress,
    ready && detailTaskId ? { taskId: detailTaskId } : "skip",
  );

  const lifecycle = deriveDeepResearchLifecycle({
    taskStatus: detailTask?.status,
    errorCode: detailTask?.errorCode,
  });

  const hasActiveExecution = Boolean(activeTask);
  const canSubmit =
    ready &&
    validation.ok &&
    !submitting &&
    !hasActiveExecution &&
    !isLoading &&
    isAuthenticated;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !validation.ok) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const result = await submitDeepResearch({
        requestText: validation.trimmed,
        researchRequestId,
        idempotencyKey,
      });
      setSelectedTaskId(result.taskId);
      rememberActiveTaskId(result.taskId);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }, [
    canSubmit,
    idempotencyKey,
    researchRequestId,
    submitDeepResearch,
    validation,
  ]);

  const handleNewRequest = useCallback(() => {
    const session = rotateResearchRequestSession();
    setResearchRequestId(session.researchRequestId);
    setIdempotencyKey(session.idempotencyKey);
    setRequestText("");
    setSelectedTaskId(null);
    clearActiveTaskId();
    setSubmitError(null);
  }, []);

  const handleNewRun = useCallback(() => {
    const nextKey = rotateIdempotencyKey();
    setIdempotencyKey(nextKey);
    setSelectedTaskId(null);
    clearActiveTaskId();
    setSubmitError(null);
  }, []);

  const connectorNote =
    connectorStatus?.state === "not_configured"
      ? "Connector not configured — requests queue in Nexus until a Claudia Connector is linked."
      : connectorStatus?.state === "offline"
        ? "Connector offline — submitted research waits in the normal queue."
        : null;

  const pastTasks = tasksPage?.tasks ?? [];
  const blockedMessage =
    lifecycle === "blocked"
      ? blockedResearchMessage(detailTask?.errorCode, detailTask?.errorMessage)
      : null;

  return (
    <section
      className="legacy-port-workspace legacy-port-research legacy-port-research-centered"
      aria-labelledby="research-heading"
    >
      <header className="legacy-port-head">
        <h1 id="research-heading">Deep Research</h1>
        <p className="legacy-port-subhead">
          Run governed, multi-source research through Claudia.
        </p>
      </header>

      {connectorNote ? (
        <p className="research-availability-note" role="status">
          {connectorNote}
        </p>
      ) : null}

      <div className="research-panel-layout">
        <aside className="research-settings" aria-label="Research request">
          <form
            className="research-form"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSubmit();
            }}
          >
            <label htmlFor="research-request">
              Research request
              <textarea
                id="research-request"
                className="research-request-input"
                rows={8}
                value={requestText}
                placeholder="Describe the question, task, or report you want researched…"
                disabled={submitting || hasActiveExecution}
                onChange={(event) => setRequestText(event.target.value)}
              />
            </label>
            <div className="research-request-meta" aria-live="polite">
              <span>
                {charCount.toLocaleString()} / {DEEP_RESEARCH_MAX_REQUEST_LENGTH.toLocaleString()}
              </span>
              {!validation.ok && validation.code === "too_large" ? (
                <span className="research-validation-error">
                  {researchRequestValidationMessage("too_large")}
                </span>
              ) : null}
            </div>

            <label htmlFor="research-model">
              Model
              <input
                id="research-model"
                type="text"
                className="research-model-field"
                value="Managed by Claudia"
                readOnly
                disabled
                aria-readonly="true"
              />
            </label>

            <div className="research-form-actions">
              <button
                type="submit"
                className="legacy-port-btn legacy-port-btn-primary"
                disabled={!canSubmit}
              >
                {submitting ? "Submitting…" : "Research"}
              </button>
              <button
                type="button"
                className="legacy-port-btn"
                onClick={handleNewRequest}
                disabled={submitting}
              >
                New request
              </button>
            </div>

            {submitError ? (
              <p className="research-validation-error" role="alert">
                {submitError}
              </p>
            ) : null}
          </form>
        </aside>

        <div className="research-jobs">
          <h2 className="research-section-title">Current research</h2>
          <div className="research-current-panel">
            {!ready || detailTask === undefined ? (
              <p className="legacy-port-empty">Loading research state…</p>
            ) : !detailTask ? (
              <p className="legacy-port-empty">
                No research submitted yet. Enter a request and click Research.
              </p>
            ) : (
              <>
                <div className="research-status-row">
                  <span className="nexus-tool-chip">{deepResearchLifecycleLabel(lifecycle)}</span>
                  <span className="research-status-detail">
                    {taskStatusLabel(detailTask.status)} · {taskExecutionNote(detailTask.status)}
                  </span>
                </div>
                <p className="research-request-preview">{detailTask.requestText}</p>
                <dl className="nexus-task-meta research-task-meta">
                  <div>
                    <dt>Submitted</dt>
                    <dd>{formatTime(detailTask.createdAt)}</dd>
                  </div>
                  {detailResult?.model ? (
                    <div>
                      <dt>Model</dt>
                      <dd>{detailResult.model}</dd>
                    </div>
                  ) : null}
                  {formatResearchDuration(detailResult?.durationMs) ? (
                    <div>
                      <dt>Duration</dt>
                      <dd>{formatResearchDuration(detailResult?.durationMs)}</dd>
                    </div>
                  ) : null}
                </dl>

                {lifecycle === "blocked" ? (
                  <div className="research-blocked-panel" role="alert">
                    <strong>Research unavailable</strong>
                    <p>{blockedMessage}</p>
                    <button
                      type="button"
                      className="legacy-port-btn"
                      onClick={handleNewRun}
                    >
                      Start new run
                    </button>
                  </div>
                ) : null}

                {lifecycle === "failed" && detailTask.errorMessage ? (
                  <div className="research-failed-panel" role="alert">
                    <strong>Research failed</strong>
                    <p>{detailTask.errorMessage}</p>
                    <button
                      type="button"
                      className="legacy-port-btn"
                      onClick={handleNewRun}
                    >
                      Start new run
                    </button>
                  </div>
                ) : null}

                {lifecycle === "completed" && detailResult?.answerText ? (
                  <div className="research-report-panel">
                    <h3 className="research-report-title">Report</h3>
                    {detailResult.format === "markdown" ? (
                      <SafeMarkdown
                        text={detailResult.answerText}
                        className="nexus-answer-body research-report-body"
                      />
                    ) : (
                      <div className="nexus-answer-body research-report-body">
                        {detailResult.answerText}
                      </div>
                    )}
                  </div>
                ) : null}

                {detailSources && detailSources.length > 0 ? (
                  <>
                    <h3 className="research-report-title">Sources</h3>
                    <ul className="nexus-source-list research-source-list">
                      {detailSources.map((source) => {
                        const href =
                          source.locator && isSafeHttpUrl(source.locator)
                            ? source.locator
                            : null;
                        return (
                          <li key={source.id} className="nexus-source-mini">
                            <strong>
                              {href ? (
                                <SafeExternalLink href={href}>{source.title}</SafeExternalLink>
                              ) : (
                                source.title
                              )}
                            </strong>
                            {source.sourceType ? <span> · {source.sourceType}</span> : null}
                            {source.provenanceLabel ? (
                              <span> · {source.provenanceLabel}</span>
                            ) : null}
                            {source.excerpt ? (
                              <p className="research-source-excerpt">{source.excerpt}</p>
                            ) : null}
                            {source.locator && !href ? (
                              <p className="research-source-locator">{source.locator}</p>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </>
                ) : null}

                {isDeepResearchTaskActive(detailTask.status) ? (
                  <div className="research-active-actions">
                    <button
                      type="button"
                      className="legacy-port-btn"
                      disabled={detailTask.status !== "queued" || submitting}
                      onClick={async () => {
                        setSubmitting(true);
                        try {
                          await cancelTask({ taskId: detailTask.id });
                        } finally {
                          setSubmitting(false);
                        }
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : null}

                {detailProgress && detailProgress.length > 0 ? (
                  <>
                    <h3 className="research-report-title">Progress</h3>
                    <ul className="nexus-progress-list">
                      {detailProgress.map((event) => (
                        <li key={event.id}>
                          <span className="nexus-tool-chip nexus-tool-chip-muted">
                            {event.eventType}
                          </span>
                          {event.message ? <span> {event.message}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </>
            )}
          </div>

          <h2 className="research-section-title">Recent research</h2>
          <div className="research-job-list">
            {pastTasks.length === 0 ? (
              <p className="legacy-port-empty">Completed and in-progress research appears here.</p>
            ) : (
              <ul className="research-history-list">
                {pastTasks.map((task) => (
                  <li key={task.id}>
                    <button
                      type="button"
                      className={`research-history-item${
                        detailTaskId === task.id ? " research-history-item--active" : ""
                      }`}
                      onClick={() => setSelectedTaskId(task.id)}
                    >
                      <span className="research-history-title">
                        {requestPreview(task.requestText)}
                      </span>
                      <span className="research-history-meta">
                        {deepResearchLifecycleLabel(
                          deriveDeepResearchLifecycle({
                            taskStatus: task.status,
                            errorCode: task.errorCode,
                          }),
                        )}{" "}
                        · {formatTime(task.createdAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
