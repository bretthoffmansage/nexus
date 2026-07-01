"use client";

import { UserButton } from "@clerk/nextjs";
import { ToolNavigation } from "@/components/layout/ToolNavigation";
import { NexusIcon } from "@/components/ui/NexusIcon";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

type SidebarProps = {
  id?: string;
  open: boolean;
  onClose: () => void;
  clerkEnabled: boolean;
  userLabel?: string;
  isAdmin?: boolean;
};

export function Sidebar({
  id,
  open,
  onClose,
  clerkEnabled,
  userLabel,
  isAdmin,
}: SidebarProps) {
  return (
    <aside
      id={id}
      className={`nexus-sidebar${open ? " is-open" : ""}`}
      aria-label="Application navigation"
    >
      <div className="nexus-sidebar-top">
        <div className="nexus-sidebar-brand">
          <NexusIcon className="nexus-brand-mark" />
          <span>Nexus</span>
        </div>
        <button
          type="button"
          className="nexus-sidebar-close"
          onClick={onClose}
          aria-label="Close navigation"
        >
          Close
        </button>
      </div>

      <div className="nexus-sidebar-nav-scroll">
        <nav className="nexus-sidebar-nav" aria-label="Primary">
          <ToolNavigation isAdmin={isAdmin} />
        </nav>
      </div>

      <div className="nexus-sidebar-footer">
        <ThemeToggle />
        <div className="nexus-sidebar-user">
          {userLabel ? <span className="nexus-user-chip">{userLabel}</span> : null}
          {clerkEnabled ? <UserButton /> : null}
        </div>
      </div>
    </aside>
  );
}
