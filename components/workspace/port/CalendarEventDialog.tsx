"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import {
  calendarStatusLabel,
  nexusCalendar,
  type CalendarEventStatus,
} from "@/lib/nexus/calendarClient";
import {
  defaultLocalTimeInput,
  detectBrowserTimeZone,
  formatLocalDateInput,
} from "@/lib/nexus/calendarTimezone";

export type CalendarDialogMode =
  | { kind: "closed" }
  | { kind: "create"; localDate: string }
  | { kind: "view"; eventId: Id<"nexusScheduledEvents"> }
  | { kind: "edit"; eventId: Id<"nexusScheduledEvents"> };

type EventFormState = {
  title: string;
  description: string;
  taskRequest: string;
  requestedToolId: string;
  localScheduledDate: string;
  localScheduledTime: string;
  timezone: string;
};

function emptyForm(localDate: string): EventFormState {
  return {
    title: "",
    description: "",
    taskRequest: "",
    requestedToolId: "",
    localScheduledDate: localDate,
    localScheduledTime: defaultLocalTimeInput(),
    timezone: detectBrowserTimeZone(),
  };
}

type CalendarEventDialogProps = {
  mode: CalendarDialogMode;
  onClose: () => void;
  onEdit: (eventId: Id<"nexusScheduledEvents">) => void;
  ready: boolean;
};

export function CalendarEventDialog({ mode, onClose, onEdit, ready }: CalendarEventDialogProps) {
  const [form, setForm] = useState<EventFormState>(emptyForm(formatLocalDateInput(new Date())));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tools = useQuery(nexusCalendar.listAllowedTools, ready ? {} : "skip");
  const eventId =
    mode.kind === "view" || mode.kind === "edit" ? mode.eventId : undefined;
  const event = useQuery(nexusCalendar.getEvent, ready && eventId ? { eventId } : "skip");
  const result = useQuery(
    nexusCalendar.getEventResult,
    ready && mode.kind === "view" && eventId ? { eventId } : "skip",
  );

  const createEvent = useMutation(nexusCalendar.createEvent);
  const updateEvent = useMutation(nexusCalendar.updateEvent);
  const deleteEvent = useMutation(nexusCalendar.deleteEvent);

  useEffect(() => {
    if (mode.kind === "create") {
      setForm(emptyForm(mode.localDate));
      setError(null);
    }
  }, [mode]);

  useEffect(() => {
    if (mode.kind === "edit" && event) {
      setForm({
        title: event.title,
        description: event.description ?? "",
        taskRequest: event.taskRequest,
        requestedToolId: event.requestedToolId,
        localScheduledDate: event.localScheduledDate,
        localScheduledTime: event.localScheduledTime,
        timezone: event.timezone,
      });
      setError(null);
    }
  }, [mode, event]);

  useEffect(() => {
    if (tools?.length && !form.requestedToolId && mode.kind === "create") {
      setForm((f) => ({ ...f, requestedToolId: tools[0].id }));
    }
  }, [tools, form.requestedToolId, mode.kind]);

  if (mode.kind === "closed") return null;

  const editable = mode.kind === "create" || (mode.kind === "edit" && event && !event.linkedTaskId);
  const viewEvent = mode.kind === "view" || mode.kind === "edit" ? event : null;
  const canDelete =
    viewEvent && !["queued", "running", "dispatching"].includes(viewEvent.scheduleStatus);
  const canEdit = viewEvent && !viewEvent.linkedTaskId;

  const onSave = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode.kind === "create") {
        await createEvent({
          title: form.title,
          description: form.description || undefined,
          taskRequest: form.taskRequest,
          requestedToolId: form.requestedToolId,
          localScheduledDate: form.localScheduledDate,
          localScheduledTime: form.localScheduledTime,
          timezone: form.timezone,
        });
      } else if (mode.kind === "edit") {
        await updateEvent({
          eventId: mode.eventId,
          title: form.title,
          description: form.description || undefined,
          taskRequest: form.taskRequest,
          requestedToolId: form.requestedToolId,
          localScheduledDate: form.localScheduledDate,
          localScheduledTime: form.localScheduledTime,
          timezone: form.timezone,
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!ready || busy || mode.kind !== "view" || !canDelete) return;
    if (!window.confirm("Remove this event from your calendar?")) return;
    setBusy(true);
    setError(null);
    try {
      await deleteEvent({ eventId: mode.eventId });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cal-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="cal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cal-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="cal-dialog-header">
          <h2 id="cal-dialog-title">
            {mode.kind === "create"
              ? "Schedule task"
              : mode.kind === "edit"
                ? "Edit scheduled task"
                : viewEvent?.title ?? "Scheduled task"}
          </h2>
          <button type="button" className="cal-dialog-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {error ? <p className="cal-dialog-error">{error}</p> : null}

        {editable ? (
          <div className="cal-dialog-body">
            <label className="cal-field">
              <span>Event name</span>
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Cleanup"
              />
            </label>
            <div className="cal-field-row">
              <label className="cal-field">
                <span>Date</span>
                <input
                  type="date"
                  value={form.localScheduledDate}
                  onChange={(e) => setForm((f) => ({ ...f, localScheduledDate: e.target.value }))}
                />
              </label>
              <label className="cal-field">
                <span>Time</span>
                <input
                  type="time"
                  value={form.localScheduledTime}
                  onChange={(e) => setForm((f) => ({ ...f, localScheduledTime: e.target.value }))}
                />
              </label>
            </div>
            <label className="cal-field">
              <span>Timezone</span>
              <input
                value={form.timezone}
                onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
                placeholder="America/New_York"
              />
            </label>
            <label className="cal-field">
              <span>Task request</span>
              <textarea
                rows={4}
                value={form.taskRequest}
                onChange={(e) => setForm((f) => ({ ...f, taskRequest: e.target.value }))}
                placeholder="What should Claudia do when this event is due?"
              />
            </label>
            <label className="cal-field">
              <span>Task type</span>
              <select
                value={form.requestedToolId}
                onChange={(e) => setForm((f) => ({ ...f, requestedToolId: e.target.value }))}
              >
                {(tools ?? []).map((tool) => (
                  <option key={tool.id} value={tool.id}>
                    {tool.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="cal-field">
              <span>Notes (optional)</span>
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </label>
          </div>
        ) : viewEvent ? (
          <div className="cal-dialog-body">
            <p className="cal-detail-status">
              Status: {calendarStatusLabel(viewEvent.scheduleStatus as CalendarEventStatus)}
              {viewEvent.lateDispatch ? " (ran late)" : ""}
            </p>
            <p>
              <strong>When:</strong> {viewEvent.localScheduledDate} {viewEvent.localScheduledTime}{" "}
              ({viewEvent.timezone})
            </p>
            {viewEvent.dispatchedAt ? (
              <p>
                <strong>Queued:</strong> {new Date(viewEvent.dispatchedAt).toLocaleString()}
              </p>
            ) : null}
            <p>
              <strong>Task request:</strong>
            </p>
            <pre className="cal-detail-pre">{viewEvent.taskRequest}</pre>
            <p>
              <strong>Tool:</strong> {viewEvent.requestedToolId}
            </p>
            {viewEvent.progressMessage ? (
              <p>
                <strong>Progress:</strong> {viewEvent.progressMessage}
              </p>
            ) : null}
            {viewEvent.terminalResultSummary ? (
              <p>
                <strong>Summary:</strong> {viewEvent.terminalResultSummary}
              </p>
            ) : null}
            {viewEvent.terminalUserSafeMessage ? (
              <p className="cal-dialog-error">{viewEvent.terminalUserSafeMessage}</p>
            ) : null}
            {result ? (
              <div className="cal-detail-result">
                <strong>Result</strong>
                <pre className="cal-detail-pre">{result.answerText}</pre>
                {result.sources.length > 0 ? (
                  <ul className="cal-detail-sources">
                    {result.sources.map((s, i) => (
                      <li key={`${s.title}-${i}`}>
                        {s.title}
                        {s.locator ? ` — ${s.locator}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="cal-dialog-body">Loading…</p>
        )}

        <footer className="cal-dialog-footer">
          {mode.kind === "view" && canDelete ? (
            <button type="button" className="cal-btn cal-btn-danger" onClick={onDelete} disabled={busy}>
              Remove
            </button>
          ) : null}
          {mode.kind === "view" && canEdit ? (
            <button
              type="button"
              className="cal-btn"
              disabled={busy}
              onClick={() => onEdit(mode.eventId)}
            >
              Edit
            </button>
          ) : null}
          {editable ? (
            <>
              <button type="button" className="cal-btn" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button
                type="button"
                className="cal-btn cal-btn-primary"
                onClick={onSave}
                disabled={busy}
              >
                Save
              </button>
            </>
          ) : (
            <button type="button" className="cal-btn cal-btn-primary" onClick={onClose}>
              Close
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
