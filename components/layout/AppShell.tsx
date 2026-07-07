"use client";

import { useState, type ReactNode } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Sidebar } from "@/components/layout/Sidebar";

type AppShellProps = {
  children: ReactNode;
  clerkEnabled: boolean;
  convexConnected: boolean;
  userLabel?: string;
  sidebarIdentityLabel?: string;
  isAdmin?: boolean;
  canAccessDeepResearch?: boolean;
};

export function AppShell({
  children,
  clerkEnabled,
  convexConnected,
  userLabel,
  sidebarIdentityLabel,
  isAdmin,
  canAccessDeepResearch,
}: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="nexus-app">
      <a className="nexus-skip-link" href="#nexus-main">
        Skip to main content
      </a>

      <div className="nexus-app-body">
        <Sidebar
          id="nexus-sidebar"
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          clerkEnabled={clerkEnabled}
          userLabel={userLabel}
          sidebarIdentityLabel={sidebarIdentityLabel}
          isAdmin={isAdmin}
          canAccessDeepResearch={canAccessDeepResearch}
        />

        {sidebarOpen ? (
          <button
            type="button"
            className="nexus-sidebar-backdrop"
            aria-label="Close navigation overlay"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null}

        <div className="nexus-app-main">
          <AppHeader
            sidebarOpen={sidebarOpen}
            onMenuToggle={() => setSidebarOpen((open) => !open)}
            convexConnected={convexConnected}
          />
          <main id="nexus-main" className="nexus-workspace">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
