"use client";

import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { ClaudiaPresence } from "@/components/status/ClaudiaPresence";
import { TaskHistorySection } from "@/components/history/TaskHistorySection";
import { NexusIcon } from "@/components/ui/NexusIcon";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

type SidebarProps = {
  id?: string;
  open: boolean;
  onClose: () => void;
  clerkEnabled: boolean;
  userLabel?: string;
};

const NEW_REQUEST_HELP =
  "New requests will be enabled after Nexus backend setup.";

export function Sidebar({
  id,
  open,
  onClose,
  clerkEnabled,
  userLabel,
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

      <nav className="nexus-sidebar-nav" aria-label="Primary">
        <Link href="/" className="nexus-nav-item is-active" aria-current="page">
          Nexus Chat
        </Link>
      </nav>

      <div className="nexus-sidebar-actions">
        <button
          type="button"
          className="nexus-btn nexus-btn-primary nexus-new-request-btn"
          disabled
          aria-disabled="true"
          title={NEW_REQUEST_HELP}
        >
          New request
        </button>
        <p className="nexus-sidebar-hint">{NEW_REQUEST_HELP}</p>
      </div>

      <TaskHistorySection />

      <div className="nexus-sidebar-presence">
        <ClaudiaPresence />
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
