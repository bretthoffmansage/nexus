import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";
import { NexusIcon } from "@/components/ui/NexusIcon";

export const dynamic = "force-dynamic";

export default function IdentitySetupRequiredPage() {
  const devSuffix =
    process.env.NODE_ENV !== "production"
      ? " Diagnostic code: identity_claims_incomplete."
      : "";

  return (
    <div className="nexus-sign-in-shell">
      <div className="nexus-sign-in-panel nexus-card" style={{ width: "min(100%, 520px)" }}>
        <div
          className="nexus-sidebar-brand"
          style={{ justifyContent: "center", marginBottom: "0.75rem" }}
        >
          <NexusIcon className="nexus-brand-mark" />
          <span>Nexus</span>
        </div>
        <h1 className="nexus-card-title" style={{ textAlign: "center" }}>
          Identity setup required
        </h1>
        <p className="nexus-sign-in-copy">
          Your Clerk account authenticated successfully, but Nexus did not receive a verified
          email claim required to complete access setup. An administrator must add the{" "}
          <strong>email</strong> claim to Clerk&apos;s native Convex integration session claims,
          then sign in again.{devSuffix}
        </p>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "0.75rem",
            marginTop: "1rem",
            flexWrap: "wrap",
          }}
        >
          <Link href="/" className="nexus-btn nexus-btn-primary">
            Retry
          </Link>
          <SignOutButton>
            <button type="button" className="nexus-btn nexus-btn-ghost">
              Sign out
            </button>
          </SignOutButton>
        </div>
      </div>
    </div>
  );
}
