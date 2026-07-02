import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppHeader } from "@/components/layout/AppHeader";
import { Sidebar } from "@/components/layout/Sidebar";
import { ToolNavigation } from "@/components/layout/ToolNavigation";
import { ChatSessionProvider } from "@/components/chat/ChatSessionContext";
import { NexusChatWorkspace } from "@/components/chat/NexusChatWorkspace";
import { NEXUS_TOOL_REGISTRY } from "@/lib/navigation/toolRegistry";
import { resolveNexusDisplayName } from "@/lib/auth/nexusDisplayName";
import { ThemeProvider } from "@/components/providers/ThemeProvider";

function renderWithTheme(ui: React.ReactNode) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex/react")>()),
  useQuery: () => undefined,
  useMutation: () => async () => undefined,
}));

const ROOT = path.resolve(__dirname, "..");

describe("nexus_chat_header_and_signed_in_identity_cleanup_v1", () => {
  describe("sidebar navigation label", () => {
    it("shows Chat in the canonical tool registry and sidebar navigation", () => {
      const chat = NEXUS_TOOL_REGISTRY.find((tool) => tool.href === "/");
      expect(chat?.label).toBe("Chat");
      expect(chat?.id).toBe("nexus-chat");

      render(<ToolNavigation />);
      expect(screen.getByRole("link", { name: "Chat" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Nexus Chat" })).not.toBeInTheDocument();
    });
  });

  describe("chat workspace shell", () => {
    it("removes the redundant Nexus Chat page heading while keeping composer and welcome", () => {
      render(
        <ChatSessionProvider canSubmit>
          <NexusChatWorkspace />
        </ChatSessionProvider>,
      );

      expect(screen.queryByRole("heading", { name: "Nexus Chat" })).not.toBeInTheDocument();
      expect(screen.getByText("Welcome")).toBeInTheDocument();
      expect(screen.getByLabelText(/Message Nexus/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /History/i })).toBeInTheDocument();
    });
  });

  describe("sidebar signed-in identity", () => {
    it("renders the configured display name beside the Nexus symbol", () => {
      renderWithTheme(
        <Sidebar
          open
          clerkEnabled={false}
          onClose={() => undefined}
          sidebarIdentityLabel="Brett"
          userLabel="Brett"
        />,
      );

      expect(screen.getByTitle("Brett")).toHaveTextContent("Brett");
      expect(screen.queryByText(/^Nexus$/)).not.toBeInTheDocument();
    });

    it("derives Brett from profile input rather than hardcoding", () => {
      expect(
        resolveNexusDisplayName({
          displayName: "Brett",
          primaryEmail: "brett@poweredbysage.com",
        }),
      ).toBe("Brett");
    });

    it("hides the full email when a configured display name exists", () => {
      expect(
        resolveNexusDisplayName({
          displayName: "Brett",
          primaryEmail: "brett@poweredbysage.com",
        }),
      ).not.toContain("@");
    });

    it("falls back through Clerk and email local-part before User", () => {
      expect(resolveNexusDisplayName({ clerkFirstName: "Alex" })).toBe("Alex");
      expect(resolveNexusDisplayName({ clerkUsername: "alex_n" })).toBe("alex_n");
      expect(resolveNexusDisplayName({ primaryEmail: "alex@example.com" })).toBe("alex");
      expect(resolveNexusDisplayName({})).toBe("User");
    });

    it("uses the neutral Nexus placeholder while identity is loading", () => {
      renderWithTheme(<Sidebar open clerkEnabled={false} onClose={() => undefined} />);
      expect(screen.getByTitle("Nexus")).toHaveTextContent("Nexus");
    });

    it("does not call Convex from the sidebar component", () => {
      const sidebarSrc = readFileSync(path.join(ROOT, "components/layout/Sidebar.tsx"), "utf8");
      expect(sidebarSrc).not.toContain("convex/react");
      expect(sidebarSrc).not.toContain("useQuery");
    });
  });

  describe("top horizontal application brand boundary", () => {
    it("keeps Nexus in the application header", () => {
      render(
        <AppHeader sidebarOpen={false} onMenuToggle={() => undefined} convexConnected />,
      );
      expect(screen.getByText("Nexus")).toBeInTheDocument();
    });
  });
});
