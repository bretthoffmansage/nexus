"use client";

import { useState, type ReactNode } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Sidebar } from "@/components/layout/Sidebar";
import { SetupBanner } from "@/components/status/SetupBanner";

type AppShellProps = {
  children: ReactNode;
  clerkEnabled: boolean;
  convexConnected: boolean;
  userLabel?: string;
  isAdmin?: boolean;
};

export function AppShell({
  children,
  clerkEnabled,
  convexConnected,
  userLabel,
  isAdmin,
}: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  return (
    <div className="nexus-app">
      <a className="nexus-skip-link" href="#nexus-main">
        Skip to main content
      </a>

      {!bannerDismissed ? (
        <SetupBanner onDismiss={() => setBannerDismissed(true)} />
      ) : null}

      <div className="nexus-app-body">
        <Sidebar
          id="nexus-sidebar"
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          clerkEnabled={clerkEnabled}
          userLabel={userLabel}
          isAdmin={isAdmin}
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
