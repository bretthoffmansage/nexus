import { AnswerPanel } from "@/components/chat/AnswerPanel";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ModeToggle } from "@/components/chat/ModeToggle";
import { DiagnosticsPanel } from "@/components/diagnostics/DiagnosticsPanel";
import { SourceList } from "@/components/sources/SourceList";

export function ChatEmptyState() {
  return (
    <div className="nexus-chat-empty">
      <h2 className="nexus-chat-empty-title">Welcome</h2>
      <p className="nexus-chat-empty-copy">
        Read-only knowledge access through Claudia will be available after task connectivity is
        configured. Ask questions, receive source-backed answers, and review provenance — without
        exposing Claudia Core to the public internet.
      </p>
      <ul className="nexus-chat-empty-list">
        <li>Sage Knowledge Base retrieval (planned)</li>
        <li>Membership.io transcript retrieval (planned)</li>
        <li>Summaries and synthesis with sources (planned)</li>
      </ul>
    </div>
  );
}

/**
 * Preserved Nexus Chat workspace (P3/P4). Do not replace with legacy Claudia Chat.
 */
export function NexusChatWorkspace() {
  return (
    <section className="nexus-chat-workspace" aria-labelledby="nexus-chat-heading">
      <header className="nexus-chat-workspace-head">
        <div>
          <h1 className="nexus-chat-heading" id="nexus-chat-heading">
            Nexus Chat
          </h1>
          <p className="nexus-chat-subheading">Read-only knowledge workspace</p>
        </div>
        <ModeToggle />
      </header>

      <div className="nexus-chat-scroll" role="region" aria-label="Chat messages">
        <ChatEmptyState />
        <div className="nexus-result-section">
          <h2 className="nexus-section-label">Answer</h2>
          <AnswerPanel />
        </div>
        <div className="nexus-result-section">
          <h2 className="nexus-section-label">Sources</h2>
          <SourceList sources={[]} />
        </div>
      </div>

      <ChatComposer />
      <DiagnosticsPanel />
    </section>
  );
}
