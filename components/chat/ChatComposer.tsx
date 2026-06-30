"use client";

const COMPOSER_HELP =
  "Task submission will be enabled after Nexus backend setup. The composer is not connected yet.";

export function ChatComposer() {
  return (
    <div className="nexus-composer" aria-describedby="nexus-composer-help">
      <div className="nexus-composer-context" title="Future read-only knowledge tools">
        <span className="nexus-tool-chip">vault.agentic_retrieval</span>
        <span className="nexus-tool-chip nexus-tool-chip-muted">membership_io.transcript_retrieve</span>
        <span className="nexus-tool-chip nexus-tool-chip-muted">planned</span>
      </div>
      <div className="nexus-composer-row">
        <label className="nexus-sr-only" htmlFor="nexus-composer-input">
          Message Nexus
        </label>
        <textarea
          id="nexus-composer-input"
          className="nexus-composer-input"
          placeholder="Ask Nexus…"
          rows={2}
          disabled
          aria-disabled="true"
        />
        <button
          type="button"
          className="nexus-btn nexus-btn-primary"
          disabled
          aria-disabled="true"
          title={COMPOSER_HELP}
        >
          Send
        </button>
      </div>
      <p id="nexus-composer-help" className="nexus-composer-help">
        {COMPOSER_HELP}
      </p>
    </div>
  );
}
