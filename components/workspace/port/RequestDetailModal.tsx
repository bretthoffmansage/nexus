"use client";

import { useEffect, useRef, type RefObject } from "react";

type RequestDetailModalProps = {
  /** The selected task's immutable canonical submitted request (requestText). */
  requestText: string;
  onClose: () => void;
  /** Focus is returned here on close — the Request panel button that opened it. */
  returnFocusRef?: RefObject<HTMLButtonElement | null>;
};

/**
 * Read-only modal showing a task's full canonical submitted request (including
 * any composed Report rules). Mirrors the accessible Nexus dialog pattern used
 * by CalendarEventDialog (backdrop-dismiss + role="dialog" + aria-modal + close
 * "×"), and adds Escape-to-close and focus return. It never edits or mutates the
 * request, the selected task, or the left-side draft — it only reads text.
 */
export function RequestDetailModal({
  requestText,
  onClose,
  returnFocusRef,
}: RequestDetailModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const trigger = returnFocusRef?.current ?? null;
    // Move focus into the dialog on open.
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Return focus to the Request panel after the modal closes.
      trigger?.focus?.();
    };
  }, [onClose, returnFocusRef]);

  return (
    <div
      className="research-request-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="research-request-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="research-request-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="research-request-modal-head">
          <h2 id="research-request-modal-title">Request</h2>
          <button
            ref={closeRef}
            type="button"
            className="research-request-modal-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="research-request-modal-body">
          <pre className="research-request-modal-pre">{requestText}</pre>
        </div>
      </div>
    </div>
  );
}
