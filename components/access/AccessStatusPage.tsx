import { SignOutButton } from "@clerk/nextjs";
import { NexusIcon } from "@/components/ui/NexusIcon";

type AccessStatusPageProps = {
  title: string;
  message: string;
  email?: string;
  showSignOut?: boolean;
};

export function AccessStatusPage({
  title,
  message,
  email,
  showSignOut = true,
}: AccessStatusPageProps) {
  return (
    <div className="nexus-sign-in-shell">
      <div className="nexus-sign-in-panel nexus-card" style={{ width: "min(100%, 480px)" }}>
        <div className="nexus-sidebar-brand" style={{ justifyContent: "center", marginBottom: "0.75rem" }}>
          <NexusIcon className="nexus-brand-mark" />
          <span>Nexus</span>
        </div>
        <h1 className="nexus-card-title" style={{ textAlign: "center" }}>
          {title}
        </h1>
        <p className="nexus-sign-in-copy">{message}</p>
        {email ? (
          <p className="nexus-sign-in-copy" style={{ fontSize: "0.85rem" }}>
            Signed in as <strong>{email}</strong>
          </p>
        ) : null}
        {showSignOut ? (
          <div style={{ display: "flex", justifyContent: "center", marginTop: "1rem" }}>
            <SignOutButton>
              <button type="button" className="nexus-btn nexus-btn-ghost">
                Sign out
              </button>
            </SignOutButton>
          </div>
        ) : null}
      </div>
    </div>
  );
}
