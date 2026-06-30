/** Agent mode UI is intentionally hidden in P2 (NEXUS_SHOW_AGENT_PLACEHOLDER=false). */

export function ChatShellPlaceholder() {
  return (
    <section className="nexus-card" aria-labelledby="chat-shell-title">
      <h2 className="nexus-card-title" id="chat-shell-title">
        Nexus Chat
      </h2>
      <p className="nexus-card-subtitle">
        Read-only chat and task submission will arrive in a later package. Claudia executes
        governed tools locally after Nexus queues work.
      </p>
      <div className="nexus-chat-shell" style={{ marginTop: "0.85rem" }}>
        <div className="nexus-chat-messages">
          Chat history and answers will appear here once Convex task persistence is implemented.
        </div>
        <div className="nexus-chat-input-row">
          <input
            className="nexus-chat-input"
            type="text"
            placeholder="Ask Nexus…"
            disabled
            aria-label="Message input (disabled until task APIs ship)"
          />
          <button className="nexus-btn" type="button" disabled>
            Send
          </button>
        </div>
      </div>
    </section>
  );
}
