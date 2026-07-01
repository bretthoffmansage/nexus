"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";

const COMPOSER_HELP =
  "Task submission will be enabled after Nexus backend setup. The composer is not connected yet.";

type ChatComposerProps = {
  /** Defaults to true so the standalone placeholder render stays disabled. */
  disabled?: boolean;
  /** A submission is in flight. */
  pending?: boolean;
  /** Help/status line under the composer. */
  helpText?: string;
  /** Called with the trimmed request text when the user submits. */
  onSubmit?: (text: string) => void | Promise<void>;
  /** Primary tool the request will route to (shown as the active chip). */
  toolId?: string;
  /** An optional error to surface near the composer. */
  errorText?: string | null;
};

export function ChatComposer({
  disabled = true,
  pending = false,
  helpText = COMPOSER_HELP,
  onSubmit,
  toolId = "vault.agentic_retrieval",
  errorText = null,
}: ChatComposerProps) {
  const [value, setValue] = useState("");
  const canSend = !disabled && !pending && value.trim().length > 0;

  async function submit() {
    if (!canSend || !onSubmit) return;
    const text = value.trim();
    await onSubmit(text);
    // Clear only after the mutation resolves so a failed submit keeps the text.
    setValue("");
  }

  function handleFormSubmit(event: FormEvent) {
    event.preventDefault();
    void submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <form className="nexus-composer" aria-describedby="nexus-composer-help" onSubmit={handleFormSubmit}>
      <div className="nexus-composer-context" title="Read-only knowledge tools">
        <span className="nexus-tool-chip">{toolId}</span>
        <span className="nexus-tool-chip nexus-tool-chip-muted">membership_io.transcript_retrieve</span>
      </div>
      <div className="nexus-composer-row">
        <label className="nexus-sr-only" htmlFor="nexus-composer-input">
          Message Nexus
        </label>
        <textarea
          id="nexus-composer-input"
          className="nexus-composer-input"
          placeholder={disabled ? "Ask Nexus…" : "Ask a knowledge question…"}
          rows={2}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || pending}
          aria-disabled={disabled || pending}
        />
        <button
          type="submit"
          className="nexus-btn nexus-btn-primary"
          disabled={!canSend}
          aria-disabled={!canSend}
          title={disabled ? helpText : "Submit request"}
        >
          {pending ? "Sending…" : "Send"}
        </button>
      </div>
      {errorText ? (
        <p className="nexus-composer-error" role="alert">
          {errorText}
        </p>
      ) : null}
      <p id="nexus-composer-help" className="nexus-composer-help">
        {helpText}
      </p>
    </form>
  );
}
