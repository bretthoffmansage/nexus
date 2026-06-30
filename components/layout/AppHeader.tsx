"use client";

import { ConvexConnectivityBadge } from "@/components/shell/ConvexConnectivityBadge";
import { NexusIcon } from "@/components/ui/NexusIcon";

type AppHeaderProps = {
  sidebarOpen: boolean;
  onMenuToggle: () => void;
  convexConnected: boolean;
};

export function AppHeader({
  sidebarOpen,
  onMenuToggle,
  convexConnected,
}: AppHeaderProps) {
  return (
    <header className="nexus-app-header">
      <div className="nexus-app-header-start">
        <button
          type="button"
          className="nexus-sidebar-toggle"
          onClick={onMenuToggle}
          aria-expanded={sidebarOpen}
          aria-controls="nexus-sidebar"
        >
          <span className="nexus-sr-only">Toggle navigation</span>
          <span className="nexus-hamburger" aria-hidden />
        </button>
        <div className="nexus-app-header-brand">
          <NexusIcon className="nexus-brand-mark" />
          <span>Nexus</span>
        </div>
      </div>
      <div className="nexus-app-header-end">
        {convexConnected ? (
          <ConvexConnectivityBadge />
        ) : (
          <span className="nexus-convex-badge">Convex: not configured</span>
        )}
      </div>
    </header>
  );
}
