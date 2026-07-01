"use client";

import { UserButton } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { useChatSession } from "@/components/chat/ChatSessionContext";
import { ClaudiaPresenceLive } from "@/components/status/ClaudiaPresenceLive";
import { TaskHistorySection } from "@/components/history/TaskHistorySection";
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

const NEW_REQUEST_HELP =
  "New requests will be enabled after Nexus backend setup.";

export function Sidebar({
  id,
  open,
  onClose,
  clerkEnabled,
  userLabel,
  isAdmin,
}: SidebarProps) {
  const pathname = usePathname();
  const onChatHome = pathname === "/";
  const session = useChatSession();
  const canSubmit = session?.canSubmit ?? false;

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
        <ToolNavigation isAdmin={isAdmin} />
      </nav>

      {onChatHome ? (
        <>
          <div className="nexus-sidebar-actions">
            <button
              type="button"
              className="nexus-btn nexus-btn-primary nexus-new-request-btn"
              disabled={!canSubmit}
              aria-disabled={!canSubmit}
              title={canSubmit ? "Start a new request" : NEW_REQUEST_HELP}
              onClick={() => {
                session?.startNewRequest();
                onClose();
              }}
            >
              New request
            </button>
            {!canSubmit ? <p className="nexus-sidebar-hint">{NEW_REQUEST_HELP}</p> : null}
          </div>
          <TaskHistorySection />
        </>
      ) : null}

      <div className="nexus-sidebar-presence">
        <ClaudiaPresenceLive />
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
