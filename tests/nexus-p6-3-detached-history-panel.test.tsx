import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex/react")>()),
  useQuery: () => undefined,
  useMutation: () => async () => undefined,
  useConvexAuth: () => ({ isLoading: false, isAuthenticated: true, isRefreshing: false }),
}));

import { ChatSessionProvider } from "@/components/chat/ChatSessionContext";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { NexusChatWorkspace } from "@/components/chat/NexusChatWorkspace";
import { P5_SUPPORTED_TOOL_IDS } from "@/convex/lib/p5config";
import { NEXUS_REQUEST_TOOL_DISPLAY } from "@/lib/nexus/toolDisplayLabels";

const ROOT = path.resolve(__dirname, "..");

describe("P6.3 — detached chat history panel", () => {
  it("1-3. main Chat stays centered in flow; history is not a shifting grid column", () => {
    const chatCss = readFileSync(path.join(ROOT, "styles/chat.css"), "utf8");
    expect(chatCss).toMatch(/\.nexus-chat-main[\s\S]*margin-inline:\s*auto/);
    expect(chatCss).toMatch(/container-name:\s*nexus-chat-stage/);
    expect(chatCss).not.toMatch(/grid-template-columns:\s*1fr min\(100%,\s*var\(--nexus-content-max\)\)/);
    expect(chatCss).not.toMatch(/\.nexus-chat-history-shell[\s\S]*grid-column/);
    expect(chatCss).not.toMatch(/\.nexus-chat-main[\s\S]*grid-column/);
  });

  it("2-4. history panel anchors to the page right with compact intrinsic height", () => {
    const chatCss = readFileSync(path.join(ROOT, "styles/chat.css"), "utf8");
    expect(chatCss).toMatch(/@container nexus-chat-stage[\s\S]*position:\s*absolute[\s\S]*right:\s*0/);
    expect(chatCss).toMatch(/width:\s*var\(--nexus-chat-history-width\)/);
    expect(chatCss).toMatch(/\.nexus-chat-history-panel[\s\S]*height:\s*auto/);
    expect(chatCss).not.toMatch(/\.nexus-chat-history-panel[\s\S]*height:\s*100%/);
  });

  it("5-8. overlap breakpoint uses stage width token; drawer remains default", () => {
    const tokensCss = readFileSync(path.join(ROOT, "styles/tokens.css"), "utf8");
    const chatCss = readFileSync(path.join(ROOT, "styles/chat.css"), "utf8");
    expect(tokensCss).toMatch(/--nexus-chat-history-min-stage/);
    expect(chatCss).toMatch(/@container nexus-chat-stage \(min-width: 1592px\)/);
    expect(chatCss).toMatch(/\.nexus-chat-history-toggle[\s\S]*display:\s*inline-flex/);
    expect(chatCss).toMatch(/translateX\(100%\)/);
  });

  it("9-10. composer remains inside centered main column", () => {
    const workspaceSrc = readFileSync(
      path.join(ROOT, "components/chat/NexusChatWorkspace.tsx"),
      "utf8",
    );
    expect(workspaceSrc).toMatch(/nexus-chat-main[\s\S]*nexus-chat-footer/);
    const chatCss = readFileSync(path.join(ROOT, "styles/chat.css"), "utf8");
    expect(chatCss).toMatch(/\.nexus-chat-footer/);
  });

  it("11-13. history controls remain in Nexus Chat workspace", () => {
    render(
      <ChatSessionProvider canSubmit>
        <NexusChatWorkspace />
      </ChatSessionProvider>,
    );
    expect(screen.getByRole("button", { name: "New chat" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Conversation history" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View all tasks" })).toBeInTheDocument();
  });

  it("14-15. viewport-fit and internal scroll classes remain", () => {
    const chatCss = readFileSync(path.join(ROOT, "styles/chat.css"), "utf8");
    const shellCss = readFileSync(path.join(ROOT, "styles/shell.css"), "utf8");
    expect(chatCss).toMatch(/\.nexus-chat-scroll[\s\S]*overflow-y:\s*auto/);
    expect(chatCss).toMatch(/\.nexus-chat-history-list-wrap[\s\S]*overflow-y:\s*auto/);
    expect(shellCss).toMatch(/height:\s*100dvh/);
  });

  it("19-20. friendly tool labels unchanged; canonical IDs preserved", () => {
    expect(NEXUS_REQUEST_TOOL_DISPLAY["vault.agentic_retrieval"].label).toBe("Vault");
    expect(NEXUS_REQUEST_TOOL_DISPLAY["knowledge.asset_query"].label).toBe("Transcripts");
    expect(P5_SUPPORTED_TOOL_IDS).toEqual([
      "vault.agentic_retrieval",
      "knowledge.asset_query",
    ]);
    render(<ChatComposer disabled={false} onSubmit={() => undefined} />);
    expect(screen.queryByText("vault.agentic_retrieval")).not.toBeInTheDocument();
  });
});
