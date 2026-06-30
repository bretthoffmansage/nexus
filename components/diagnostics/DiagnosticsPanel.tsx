"use client";

import type { NexusDiagnostics } from "@/lib/types/presentation";
import { TaskStatusBadge } from "@/components/ui/TaskStatusBadge";

type DiagnosticsPanelProps = {
  diagnostics?: NexusDiagnostics | null;
};

function Row({ label, value }: { label: string; value?: string | number }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="nexus-diagnostics-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function DiagnosticsPanel({ diagnostics }: DiagnosticsPanelProps) {
  const hasData = Boolean(
    diagnostics &&
      (diagnostics.taskId ||
        diagnostics.traceId ||
        diagnostics.toolId ||
        diagnostics.status),
  );

  return (
    <section className="nexus-diagnostics" aria-labelledby="nexus-diagnostics-title">
      <details className="nexus-diagnostics-details">
        <summary id="nexus-diagnostics-title" className="nexus-diagnostics-summary">
          Diagnostics
        </summary>
        <div className="nexus-diagnostics-body">
          {!hasData ? (
            <p className="nexus-empty-copy">
              Technical details will appear here for completed requests.
            </p>
          ) : (
            <dl className="nexus-diagnostics-list">
              <Row label="Task ID" value={diagnostics?.taskId} />
              <Row label="Trace ID" value={diagnostics?.traceId} />
              <Row label="Tool" value={diagnostics?.toolId} />
              <Row label="Model" value={diagnostics?.model} />
              <Row label="Duration (ms)" value={diagnostics?.durationMs} />
              <Row label="Attempt" value={diagnostics?.attemptNumber} />
              {diagnostics?.status ? (
                <div className="nexus-diagnostics-row">
                  <dt>Status</dt>
                  <dd>
                    <TaskStatusBadge status={diagnostics.status} />
                  </dd>
                </div>
              ) : null}
              {diagnostics?.warnings?.length ? (
                <div className="nexus-diagnostics-row">
                  <dt>Warnings</dt>
                  <dd>{diagnostics.warnings.join("; ")}</dd>
                </div>
              ) : null}
              {diagnostics?.structuredError ? (
                <div className="nexus-diagnostics-row">
                  <dt>Error</dt>
                  <dd>{diagnostics.structuredError}</dd>
                </div>
              ) : null}
            </dl>
          )}
        </div>
      </details>
    </section>
  );
}
