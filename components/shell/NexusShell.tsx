"use client";

import { AppShell } from "@/components/layout/AppShell";
import { ChatSessionProvider } from "@/components/chat/ChatSessionContext";
import { NexusChatWorkspace } from "@/components/chat/NexusChatWorkspace";

type NexusShellProps = {
  userLabel?: string;
  convexConnected: boolean;
  clerkEnabled: boolean;
  isAdmin?: boolean;
  /** True when the signed-in user is an approved, active knowledge_reader. */
  canSubmit?: boolean;
};

export function NexusShell({
  userLabel,
  convexConnected,
  clerkEnabled,
  isAdmin,
  canSubmit = false,
}: NexusShellProps) {
  return (
    <ChatSessionProvider canSubmit={canSubmit}>
      <AppShell
        clerkEnabled={clerkEnabled}
        convexConnected={convexConnected}
        userLabel={userLabel}
        isAdmin={isAdmin}
      >
        <NexusChatWorkspace />
      </AppShell>
    </ChatSessionProvider>
  );
}
