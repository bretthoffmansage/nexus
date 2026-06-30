"use client";

import { NEXUS_SHOW_AGENT_PLACEHOLDER } from "@/lib/features";

type ModeToggleProps = {
  mode?: "chat";
};

export function ModeToggle({ mode = "chat" }: ModeToggleProps) {
  return (
    <div
      className="nexus-mode-toggle"
      role="group"
      aria-label="Interaction mode"
    >
      <button
        type="button"
        className="nexus-mode-btn is-active"
        aria-pressed={mode === "chat"}
        disabled
        title="Read-only Nexus Chat"
      >
        Chat
      </button>
      {NEXUS_SHOW_AGENT_PLACEHOLDER ? (
        <button
          type="button"
          className="nexus-mode-btn"
          aria-pressed={false}
          disabled
          title="Coming later — governed execution only"
        >
          Agent
        </button>
      ) : null}
    </div>
  );
}
