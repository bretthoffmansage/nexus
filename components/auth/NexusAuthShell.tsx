import type { ReactNode } from "react";
import { NexusIcon } from "@/components/ui/NexusIcon";

type NexusAuthShellProps = {
  title?: string;
  subtitle?: string;
  footerNote?: string;
  children: ReactNode;
};

export function NexusAuthShell({
  title = "Nexus",
  subtitle = "Sign in to continue",
  footerNote = "Access is approval-controlled. New accounts remain pending until an administrator grants a role.",
  children,
}: NexusAuthShellProps) {
  return (
    <div className="nexus-auth-page">
      <div className="nexus-auth-backdrop" aria-hidden="true">
        <div className="nexus-auth-glow nexus-auth-glow-a" />
        <div className="nexus-auth-glow nexus-auth-glow-b" />
        <div className="nexus-auth-grid" />
      </div>

      <aside className="nexus-auth-aside" aria-hidden="true">
        <div className="nexus-auth-aside-brand">
          <NexusIcon className="nexus-brand-mark nexus-auth-mark" />
          <span>Nexus</span>
        </div>
        <p className="nexus-auth-aside-copy">
          Hosted knowledge workspace for approved operators. Claudia executes governed work through the
          private Console Connector.
        </p>
        <ul className="nexus-auth-aside-list">
          <li>Approval-controlled access</li>
          <li>Convex-authoritative roles</li>
          <li>Private hosted console</li>
        </ul>
      </aside>

      <div className="nexus-auth-stage">
        <section className="nexus-auth-card nexus-card" aria-label="Authentication">
          <header className="nexus-auth-card-head">
            <div className="nexus-auth-card-brand">
              <NexusIcon className="nexus-brand-mark" />
              <span>{title}</span>
            </div>
            {subtitle ? <p className="nexus-auth-card-subtitle">{subtitle}</p> : null}
          </header>

          <div className="nexus-auth-clerk-slot">{children}</div>

          {footerNote ? <p className="nexus-auth-footer-note">{footerNote}</p> : null}
        </section>
      </div>
    </div>
  );
}
