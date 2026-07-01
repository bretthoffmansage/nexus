"use client";

type LibraryConfirmDialogProps = {
  title: string;
  busy?: boolean;
  onNo: () => void;
  onYes: () => void;
};

/** Application-styled Yes/No confirmation for Library Create actions. */
export function LibraryConfirmDialog({ title, busy, onNo, onYes }: LibraryConfirmDialogProps) {
  return (
    <div
      className="nexus-history-delete-dialog doclib-confirm-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="doclib-confirm-title"
    >
      <div className="nexus-history-delete-dialog-card">
        <h3 id="doclib-confirm-title" className="nexus-history-delete-dialog-title">
          {title}
        </h3>
        <div className="nexus-history-delete-dialog-actions">
          <button type="button" className="nexus-btn nexus-btn-ghost" disabled={busy} onClick={onNo}>
            No
          </button>
          <button type="button" className="nexus-btn" disabled={busy} onClick={onYes}>
            {busy ? "Working…" : "Yes"}
          </button>
        </div>
      </div>
    </div>
  );
}
