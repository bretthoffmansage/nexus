"use client";

import { AppShell } from "@/components/layout/AppShell";
import { ChatWorkspace } from "@/components/chat/ChatWorkspace";

type NexusShellProps = {
  userLabel?: string;
  convexConnected: boolean;
  clerkEnabled: boolean;
};

export function NexusShell({ userLabel, convexConnected, clerkEnabled }: NexusShellProps) {
  return (
    <AppShell
      clerkEnabled={clerkEnabled}
      convexConnected={convexConnected}
      userLabel={userLabel}
    >
      <ChatWorkspace />
    </AppShell>
  );
}
