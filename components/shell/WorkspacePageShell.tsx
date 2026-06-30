"use client";

import { AppShell } from "@/components/layout/AppShell";

type WorkspacePageShellProps = {
  children: React.ReactNode;
  userLabel: string;
  convexConnected: boolean;
  clerkEnabled: boolean;
  isAdmin?: boolean;
};

export function WorkspacePageShell({
  children,
  userLabel,
  convexConnected,
  clerkEnabled,
  isAdmin,
}: WorkspacePageShellProps) {
  return (
    <AppShell
      clerkEnabled={clerkEnabled}
      convexConnected={convexConnected}
      userLabel={userLabel}
      isAdmin={isAdmin}
    >
      <div className="nexus-tool-page">{children}</div>
    </AppShell>
  );
}
