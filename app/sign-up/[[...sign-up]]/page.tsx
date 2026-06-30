import { NexusAuthShell } from "@/components/auth/NexusAuthShell";
import { ClerkSignUpPanel } from "@/components/auth/ClerkSignUpPanel";
import { isClerkConfigured } from "@/lib/env";

export default function SignUpPage() {
  if (!isClerkConfigured()) {
    return (
      <NexusAuthShell
        title="Nexus"
        subtitle="Configuration required"
        footerNote="Add Clerk keys to .env.local, then restart the development server."
      >
        <p className="nexus-sign-in-copy">
          Clerk is not configured. Copy <code>.env.example</code> to <code>.env.local</code> and set the
          Clerk publishable and secret keys.
        </p>
      </NexusAuthShell>
    );
  }

  return (
    <NexusAuthShell
      title="Nexus"
      subtitle="Create your account"
      footerNote="Creating a Clerk account does not grant Nexus access. New users remain pending until approved."
    >
      <ClerkSignUpPanel />
    </NexusAuthShell>
  );
}
