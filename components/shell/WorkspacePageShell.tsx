"use client";

import { AppShell } from "@/components/layout/AppShell";

type WorkspacePageShellProps = {
  children: React.ReactNode;
  userLabel: string;
  sidebarIdentityLabel: string;
  convexConnected: boolean;
  clerkEnabled: boolean;
  isAdmin?: boolean;
  canAccessDeepResearch?: boolean;
};

export function WorkspacePageShell({
  children,
  userLabel,
  sidebarIdentityLabel,
  convexConnected,
  clerkEnabled,
  isAdmin,
  canAccessDeepResearch,
}: WorkspacePageShellProps) {
  return (
    <AppShell
      clerkEnabled={clerkEnabled}
      convexConnected={convexConnected}
      userLabel={userLabel}
      sidebarIdentityLabel={sidebarIdentityLabel}
      isAdmin={isAdmin}
      canAccessDeepResearch={canAccessDeepResearch}
    >
      <div className="nexus-tool-page">{children}</div>
    </AppShell>
  );
}
