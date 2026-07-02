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
  loadSelectedModelId,
  rememberActiveTaskId,
  researchRequestValidationMessage,
  rotateIdempotencyKey,
  rotateResearchRequestSession,
  saveSelectedModelId,
  selectedModelToEnvelopeField,
  validateResearchRequestLength,
} from "@/lib/nexus/deepResearchSession";
import {
  CLAUDIA_DEFAULT_MODEL_VALUE,
  type NexusResearchModel,
} from "@/lib/nexus/deepResearchModelCatalog";
import { ResearchModelSelector } from "@/components/workspace/port/ResearchModelSelector";
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
  const [selectedModelId, setSelectedModelId] = useState<string>(CLAUDIA_DEFAULT_MODEL_VALUE);
  const [modelCatalog, setModelCatalog] = useState<NexusResearchModel[]>([]);
  const [modelCatalogLoading, setModelCatalogLoading] = useState(true);
  const [modelCatalogError, setModelCatalogError] = useState(false);

  useEffect(() => {
    setResearchRequestId(loadOrCreateResearchRequestId());
    setIdempotencyKey(loadOrCreateIdempotencyKey());
    setSelectedModelId(loadSelectedModelId());
    const storedTaskId = loadActiveTaskId();
    if (storedTaskId) {
      setSelectedTaskId(storedTaskId as Id<"nexusTasks">);
    }
  }, []);

  // Fetch the research-compatible model catalog once via the server-only route
  // (credential never reaches the browser). A failure degrades to the Claudia
  // default + any last valid selection; it never blocks the page.
  useEffect(() => {
    let cancelled = false;
    setModelCatalogLoading(true);
    fetch("/api/deep-research/models")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("catalog"))))
      .then((data: { ok?: boolean; models?: NexusResearchModel[] }) => {
        if (cancelled) return;
        if (data.ok && Array.isArray(data.models)) {
          setModelCatalog(data.models);
          setModelCatalogError(false);
        } else {
          setModelCatalogError(true);
        }
      })
      .catch(() => {
        if (!cancelled) setModelCatalogError(true);
      })
      .finally(() => {
        if (!cancelled) setModelCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleModelChange = useCallback((next: string) => {
    setSelectedModelId(next);
    saveSelectedModelId(next);
  }, []);

  // Block submission when a concrete saved model is no longer in the catalog.
  const savedModelUnavailable = useMemo(() => {
    if (selectedModelId === CLAUDIA_DEFAULT_MODEL_VALUE) return false;
    if (modelCatalogLoading || modelCatalogError) return false;
    return !modelCatalog.some((m) => m.id === selectedModelId);
  }, [modelCatalog, modelCatalogError, modelCatalogLoading, selectedModelId]);

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

  useEffect(() => {
    if (!ready || tasksPage === undefined) return;
    if (tasksPage.tasks.length === 0 && detailTaskId) {
      setSelectedTaskId(null);
      clearActiveTaskId();
    }
  }, [detailTaskId, ready, tasksPage]);

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
    !savedModelUnavailable &&
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
        // Captured at submit time so the run is reproducible; undefined ⇒
        // Claudia default. The selector preference is not the source of truth.
        requestedModelId: selectedModelToEnvelopeField(selectedModelId),
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
    selectedModelId,
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
  const authInitializing = isLoading || (isAuthenticated && !ready);
  const tasksLoading = ready && tasksPage === undefined;
  const detailTaskLoading = Boolean(ready && detailTaskId && detailTask === undefined);
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

            <ResearchModelSelector
              value={selectedModelId}
              onChange={handleModelChange}
              models={modelCatalog}
              loading={modelCatalogLoading}
              error={modelCatalogError}
              disabled={submitting || hasActiveExecution}
            />

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
            {authInitializing || tasksLoading ? (
              <p className="legacy-port-empty">Loading research state…</p>
            ) : !isAuthenticated ? (
              <p className="legacy-port-empty">Sign in to view research history.</p>
            ) : !detailTaskId ? (
              <p className="legacy-port-empty">No research is currently running.</p>
            ) : detailTaskLoading ? (
              <p className="legacy-port-empty">Loading research state…</p>
            ) : !detailTask ? (
              <p className="legacy-port-empty" role="alert">
                Could not load this research task.
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
            {authInitializing || tasksLoading ? (
              <p className="legacy-port-empty">Loading research history…</p>
            ) : !isAuthenticated ? (
              <p className="legacy-port-empty">Sign in to view research history.</p>
            ) : pastTasks.length === 0 ? (
              <p className="legacy-port-empty">No research runs yet.</p>
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
