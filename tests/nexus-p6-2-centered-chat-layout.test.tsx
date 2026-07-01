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
import { NexusChatWorkspace } from "@/components/chat/NexusChatWorkspace";

const ROOT = path.resolve(__dirname, "..");

describe("P6.2 — centered chat and compact history", () => {
  it("1-3. main Chat and composer use a centered bounded wrapper", () => {
    const chatCss = readFileSync(path.join(ROOT, "styles/chat.css"), "utf8");
    expect(chatCss).toMatch(/\.nexus-chat-main[\s\S]*width:\s*min\(100%,\s*var\(--nexus-content-max\)\)/);
    expect(chatCss).toMatch(/\.nexus-chat-main[\s\S]*margin-inline:\s*auto/);
    expect(chatCss).toMatch(/\.nexus-chat-footer/);
    expect(chatCss).not.toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(280px,\s*320px\)/);
  });

  it("4-5. history remains inside Nexus Chat, not the global sidebar", () => {
    const workspaceSrc = readFileSync(
      path.join(ROOT, "components/chat/NexusChatWorkspace.tsx"),
      "utf8",
    );
    const sidebarSrc = readFileSync(path.join(ROOT, "components/layout/Sidebar.tsx"), "utf8");
    expect(workspaceSrc).toContain("ChatHistoryPanel");
    expect(workspaceSrc).toContain("nexus-chat-history-shell");
    expect(sidebarSrc).not.toContain("TaskHistorySection");
  });

  it("6-8. history panel uses intrinsic/bounded height with list-only scroll", () => {
    const chatCss = readFileSync(path.join(ROOT, "styles/chat.css"), "utf8");
    expect(chatCss).toMatch(/\.nexus-chat-history-panel[\s\S]*height:\s*auto/);
    expect(chatCss).not.toMatch(/\.nexus-chat-history-panel[\s\S]*height:\s*100%/);
    expect(chatCss).toMatch(/\.nexus-chat-history-list-wrap[\s\S]*max-height:/);
    expect(chatCss).toMatch(/\.nexus-chat-history-list-wrap[\s\S]*overflow-y:\s*auto/);
  });

  it("9-12. history controls remain in the chat workspace", () => {
    render(
      <ChatSessionProvider canSubmit>
        <NexusChatWorkspace />
      </ChatSessionProvider>,
    );
    expect(screen.getByRole("button", { name: "New chat" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Conversation history" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View all tasks" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "History" })).toBeInTheDocument();
  });

  it("11. desktop stage detaches history from centered column", () => {
    const chatCss = readFileSync(path.join(ROOT, "styles/chat.css"), "utf8");
    expect(chatCss).toMatch(/@container nexus-chat-stage/);
    expect(chatCss).toMatch(/position:\s*absolute[\s\S]*right:\s*0/);
    expect(chatCss).not.toMatch(/grid-template-columns:\s*1fr min\(100%,\s*var\(--nexus-content-max\)\)/);
  });

  it("13-14. responsive drawer fallback and viewport-fit classes remain", () => {
    const chatCss = readFileSync(path.join(ROOT, "styles/chat.css"), "utf8");
    const shellCss = readFileSync(path.join(ROOT, "styles/shell.css"), "utf8");
    expect(chatCss).toMatch(/translateX\(100%\)/);
    expect(chatCss).toMatch(/\.nexus-chat-history-toggle/);
    expect(chatCss).toMatch(/\.nexus-chat-scroll[\s\S]*overflow-y:\s*auto/);
    expect(shellCss).toMatch(/\.nexus-workspace[\s\S]*min-height:\s*0/);
  });

  it("15-16. no full-width bleed on main chat surface", () => {
    const chatCss = readFileSync(path.join(ROOT, "styles/chat.css"), "utf8");
    expect(chatCss).toMatch(/width:\s*min\(100%,\s*var\(--nexus-content-max\)\)/);
    expect(chatCss).toMatch(/\.nexus-chat-stage/);
  });
});
