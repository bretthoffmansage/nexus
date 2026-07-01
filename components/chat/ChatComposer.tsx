"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import type { P5ToolId } from "@/convex/lib/p5config";
import {
  NEXUS_REQUEST_TOOL_OPTIONS,
  P5_DEFAULT_TOOL_ID,
} from "@/lib/nexus/toolDisplayLabels";

type ChatComposerProps = {
  /** Defaults to true so the standalone placeholder render stays disabled. */
  disabled?: boolean;
  /** A submission is in flight. */
  pending?: boolean;
  /** Help/status line under the composer. */
  helpText?: string;
  /** Called with trimmed request text and the selected canonical tool ID. */
  onSubmit?: (text: string, requestedToolId: P5ToolId) => void | Promise<void>;
  /** Initial selected tool (canonical ID). */
  toolId?: P5ToolId;
  /** An optional error to surface near the composer. */
  errorText?: string | null;
};

export function ChatComposer({
  disabled = true,
  pending = false,
  helpText,
  onSubmit,
  toolId = P5_DEFAULT_TOOL_ID,
  errorText = null,
}: ChatComposerProps) {
  const [value, setValue] = useState("");
  const [selectedToolId, setSelectedToolId] = useState<P5ToolId>(toolId);
  const canSend = !disabled && !pending && value.trim().length > 0;

  async function submit() {
    if (!canSend || !onSubmit) return;
    const text = value.trim();
    await onSubmit(text, selectedToolId);
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
    <form
      className="nexus-composer"
      aria-describedby={helpText ? "nexus-composer-help" : undefined}
      onSubmit={handleFormSubmit}
    >
      <div
        className="nexus-composer-context"
        role="group"
        aria-label="Knowledge tools"
        title="Read-only knowledge tools"
      >
        {NEXUS_REQUEST_TOOL_OPTIONS.map((tool) => {
          const isActive = tool.id === selectedToolId;
          return (
            <button
              key={tool.id}
              type="button"
              className={`nexus-tool-chip nexus-tool-chip-select${isActive ? " is-active" : ""}`}
              aria-pressed={isActive}
              title={tool.description}
              disabled={disabled || pending}
              onClick={() => setSelectedToolId(tool.id)}
            >
              {tool.label}
            </button>
          );
        })}
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
      {helpText ? (
        <p id="nexus-composer-help" className="nexus-composer-help">
          {helpText}
        </p>
      ) : null}
    </form>
  );
}
