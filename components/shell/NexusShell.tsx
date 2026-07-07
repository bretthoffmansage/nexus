"use client";

import { AppShell } from "@/components/layout/AppShell";
import { ChatSessionProvider } from "@/components/chat/ChatSessionContext";
import { NexusChatWorkspace } from "@/components/chat/NexusChatWorkspace";

type NexusShellProps = {
  userLabel?: string;
  sidebarIdentityLabel?: string;
  convexConnected: boolean;
  clerkEnabled: boolean;
  isAdmin?: boolean;
  canAccessDeepResearch?: boolean;
  /** True when the signed-in user is an approved, active knowledge_reader. */
  canSubmit?: boolean;
};

export function NexusShell({
  userLabel,
  sidebarIdentityLabel,
  convexConnected,
  clerkEnabled,
  isAdmin,
  canAccessDeepResearch,
  canSubmit = false,
}: NexusShellProps) {
  return (
    <ChatSessionProvider canSubmit={canSubmit}>
      <AppShell
        clerkEnabled={clerkEnabled}
        convexConnected={convexConnected}
        userLabel={userLabel}
        sidebarIdentityLabel={sidebarIdentityLabel}
        isAdmin={isAdmin}
        canAccessDeepResearch={canAccessDeepResearch}
      >
        <NexusChatWorkspace />
      </AppShell>
    </ChatSessionProvider>
  );
}
