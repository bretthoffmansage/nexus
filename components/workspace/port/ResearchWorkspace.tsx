"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { SafeExternalLink } from "@/components/nexus/SafeExternalLink";
import { SafeMarkdown } from "@/components/nexus/SafeMarkdown";
import { nexusDeepResearch } from "@/lib/nexus/deepResearchClient";
import { DeepResearchRequestFields } from "@/components/workspace/DeepResearchRequestFields";
import { ResearchHistoryPanel } from "@/components/workspace/port/ResearchHistoryPanel";
import { RequestDetailModal } from "@/components/workspace/port/RequestDetailModal";
import {
  clearActiveTaskId,
  loadActiveTaskId,
  loadReportRulesDraft,
  loadSelectedModelId,
  rememberActiveTaskId,
  rotateResearchRequestSession,
  saveReportRulesDraft,
  saveSelectedModelId,
} from "@/lib/nexus/deepResearchSession";
import {
  validateComposedDeepResearchRequest,
} from "@/lib/nexus/deepResearchRequestCompose";
import {
  CLAUDIA_DEFAULT_MODEL_VALUE,
} from "@/lib/nexus/deepResearchModelCatalog";
import { useDeepResearchModelCatalog } from "@/lib/nexus/useDeepResearchModelCatalog";
import {
  blockedResearchMessage,
  deepResearchLifecycleLabel,
  deriveDeepResearchLifecycle,
  formatResearchDuration,
  isDeepResearchTaskActive,
  isSuccessfullyCompletedResearchTask,
} from "@/lib/nexus/deepResearchView";
import { isSafeHttpUrl } from "@/lib/nexus/safeHttpUrl";
import { taskExecutionNote, taskStatusLabel } from "@/lib/nexus/p5Client";
import { useNexusAuthReadiness } from "@/lib/nexus/useNexusAuthReadiness";

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

export function ResearchWorkspace() {
  const { isLoading, isAuthenticated, readyForPrivateQueries: ready } = useNexusAuthReadiness();
  const [requestText, setRequestText] = useState("");
  const [reportRules, setReportRules] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<Id<"nexusTasks"> | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string>(CLAUDIA_DEFAULT_MODEL_VALUE);
  // The Request modal is collapsed by default and never auto-opens; it opens
  // only when the user clicks the Request panel.
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const requestPanelRef = useRef<HTMLButtonElement>(null);
  // Synchronous re-entry guard so a fast double-click cannot create two runs.
  const submitInFlightRef = useRef(false);

  const { models: modelCatalog, loading: modelCatalogLoading, error: modelCatalogError } =
    useDeepResearchModelCatalog();

  useEffect(() => {
    setSelectedModelId(loadSelectedModelId());
    setReportRules(loadReportRulesDraft());
    const storedTaskId = loadActiveTaskId();
    if (storedTaskId) {
      setSelectedTaskId(storedTaskId as Id<"nexusTasks">);
    }
  }, []);

  const handleModelChange = useCallback((next: string) => {
    setSelectedModelId(next);
    saveSelectedModelId(next);
  }, []);

  // Model selection is a UI preference only — the governed Claudia contract
  // carries execution content exclusively in requestText (no model field).

  const tasksPage = useQuery(
    nexusDeepResearch.listMyDeepResearchTasks,
    ready ? { limit: 20 } : "skip",
  );
  const connectorStatus = useQuery(nexusDeepResearch.connectorStatus, ready ? {} : "skip");
  const submitDeepResearch = useMutation(nexusDeepResearch.submitDeepResearch);
  const cancelTask = useMutation(nexusDeepResearch.cancelTask);

  const validation = useMemo(
    () => validateComposedDeepResearchRequest(requestText, reportRules),
    [requestText, reportRules],
  );

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

  // The Request panel always begins collapsed for a newly selected task — a
  // fresh submission or a History selection never auto-opens the Request modal.
  useEffect(() => {
    setRequestModalOpen(false);
  }, [detailTaskId]);

  const lifecycle = deriveDeepResearchLifecycle({
    taskStatus: detailTask?.status,
    errorCode: detailTask?.errorCode,
  });

  // Presentation-only: once a run is definitively successful, the Progress
  // checkpoint block is noise beneath a finished report. Derived from the
  // canonical task status (not from a task_completed event), so active,
  // incomplete, failed, blocked, and cancelled runs keep showing Progress.
  const researchSucceeded = isSuccessfullyCompletedResearchTask({
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

  // Every standalone run — a fresh Research submission or a Try again — mints a
  // brand-new execution identity (researchRequestId + idempotencyKey), creates
  // exactly one new task, clears any historical selection, closes History, and
  // shows the new run as Current Research. It never mutates, reuses, appends to,
  // or continues a previous task.
  const startStandaloneRun = useCallback(
    async (composedRequestText: string) => {
      if (submitInFlightRef.current) return;
      submitInFlightRef.current = true;
      setSubmitError(null);
      setSubmitting(true);
      setHistoryOpen(false);
      const session = rotateResearchRequestSession();
      try {
        const result = await submitDeepResearch({
          requestText: composedRequestText,
          researchRequestId: session.researchRequestId,
          idempotencyKey: session.idempotencyKey,
        });
        setSelectedTaskId(result.taskId);
        rememberActiveTaskId(result.taskId);
      } catch (error) {
        setSubmitError(error instanceof Error ? error.message : "Submission failed");
      } finally {
        setSubmitting(false);
        submitInFlightRef.current = false;
      }
    },
    [submitDeepResearch],
  );

  const handleSubmit = useCallback(() => {
    if (!canSubmit || !validation.ok) return;
    void startStandaloneRun(validation.trimmed);
  }, [canSubmit, startStandaloneRun, validation]);

  // Re-run a terminal failed task as a NEW standalone execution using the failed
  // task's canonical stored request content. The failed task is never mutated,
  // reopened, or deduplicated — freshly minted identifiers guarantee a distinct
  // run, and the failed run stays immutable in History.
  const handleTryAgain = useCallback(
    (failedRequestText: string) => {
      if (submitting) return;
      void startStandaloneRun(failedRequestText);
    },
    [startStandaloneRun, submitting],
  );

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
      <header className="legacy-port-head legacy-port-head--split">
        <div>
          <h1 id="research-heading">Deep Research</h1>
          <p className="legacy-port-subhead">
            Hermes agent + Web, Transcript, Knowledge Vault runtime
          </p>
        </div>
        <button
          type="button"
          className="nexus-btn nexus-btn-ghost research-history-toggle"
          aria-expanded={historyOpen}
          aria-controls="research-history-panel"
          onClick={() => setHistoryOpen((open) => !open)}
        >
          History
        </button>
      </header>

      {connectorNote ? (
        <p className="research-availability-note" role="status">
          {connectorNote}
        </p>
      ) : null}

      <div className="research-panel-layout">
        <aside className="research-settings" aria-label="Research settings">
          <form
            className="research-form"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSubmit();
            }}
          >
            <DeepResearchRequestFields
              idPrefix="research-page"
              researchRequest={requestText}
              onResearchRequestChange={setRequestText}
              reportRules={reportRules}
              onReportRulesChange={(value) => {
                setReportRules(value);
                saveReportRulesDraft(value);
              }}
              selectedModelId={selectedModelId}
              onModelChange={handleModelChange}
              models={modelCatalog}
              modelCatalogLoading={modelCatalogLoading}
              modelCatalogError={modelCatalogError}
              disabled={submitting || hasActiveExecution}
              className="research-form-fields"
            />

            <div className="research-form-actions">
              <button
                type="submit"
                className="legacy-port-btn legacy-port-btn-primary"
                disabled={!canSubmit}
              >
                {submitting ? "Submitting…" : "Research"}
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

          {detailTask ? (
            <div className="research-request-block">
              <button
                type="button"
                ref={requestPanelRef}
                className="research-request-card"
                aria-haspopup="dialog"
                aria-label="Open the full submitted request"
                onClick={() => setRequestModalOpen(true)}
              >
                <span className="research-request-card-label">Request</span>
                <p className="research-request-card-preview">{detailTask.requestText}</p>
              </button>
              <div className="research-request-metabar">
                <div className="research-request-meta-item">
                  <span className="research-request-meta-label">Submitted</span>
                  <span className="research-request-meta-value">
                    {formatTime(detailTask.createdAt)}
                  </span>
                </div>
                {detailResult?.model ? (
                  <div className="research-request-meta-item">
                    <span className="research-request-meta-label">Model</span>
                    <span className="research-request-meta-value">{detailResult.model}</span>
                  </div>
                ) : null}
                {formatResearchDuration(detailResult?.durationMs) ? (
                  <div className="research-request-meta-item">
                    <span className="research-request-meta-label">Duration</span>
                    <span className="research-request-meta-value">
                      {formatResearchDuration(detailResult?.durationMs)}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="research-current-panel research-response-panel">
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

                {lifecycle === "blocked" ? (
                  <div className="research-blocked-panel" role="alert">
                    <strong>Research unavailable</strong>
                    <p>{blockedMessage}</p>
                  </div>
                ) : null}

                {lifecycle === "failed" && detailTask.errorMessage ? (
                  <div className="research-failed-panel" role="alert">
                    <strong>Research failed</strong>
                    <p>{detailTask.errorMessage}</p>
                    <button
                      type="button"
                      className="legacy-port-btn"
                      onClick={() => handleTryAgain(detailTask.requestText)}
                      disabled={submitting}
                    >
                      {submitting ? "Retrying…" : "Try again"}
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
                    <h3 className="research-report-title">Sources retrieved this run</h3>
                    <p className="research-source-note">
                      Sources retrieved by the research tools during this run. Not
                      every source is necessarily cited in the report above.
                    </p>
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

                {!researchSucceeded && detailProgress && detailProgress.length > 0 ? (
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

          {requestModalOpen && detailTask ? (
            <RequestDetailModal
              requestText={detailTask.requestText}
              onClose={() => setRequestModalOpen(false)}
              returnFocusRef={requestPanelRef}
            />
          ) : null}
        </div>
      </div>

      <div
        id="research-history-panel"
        className={`nexus-chat-history-shell${historyOpen ? " is-open" : ""}`}
      >
        {historyOpen ? (
          <button
            type="button"
            className="nexus-chat-history-backdrop"
            aria-label="Close research history"
            onClick={() => setHistoryOpen(false)}
          />
        ) : null}
        <ResearchHistoryPanel
          tasks={pastTasks}
          selectedTaskId={detailTaskId}
          loading={authInitializing || tasksLoading}
          authenticated={isAuthenticated}
          onSelect={(taskId) => {
            setSelectedTaskId(taskId);
            setHistoryOpen(false);
          }}
        />
      </div>
    </section>
  );
}
