import { redirect } from "next/navigation";
import { getClerkDisplayNameHints } from "@/lib/auth/clerkDisplayNameHints";
import { getNexusAccess } from "@/lib/auth/getNexusAccess";
import { nexusAccessRedirectPath } from "@/lib/auth/nexusAccessRouting";
import { resolveNexusDisplayName } from "@/lib/auth/nexusDisplayName";
import { NexusShell } from "@/components/shell/NexusShell";
import { isClerkConfigured, isConvexConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const access = await getNexusAccess();
  const redirectPath = nexusAccessRedirectPath(access);

  if (access.state === "configuration_required") {
    if (process.env.NODE_ENV === "production") {
      redirect("/configuration-required");
    }
    return (
      <NexusShell
        convexConnected={isConvexConfigured()}
        clerkEnabled={isClerkConfigured()}
        userLabel="Configuration required"
      />
    );
  }

  if (redirectPath) {
    redirect(redirectPath);
  }

  const clerkHints = await getClerkDisplayNameHints();
  const sidebarIdentityLabel = resolveNexusDisplayName({
    displayName: access.displayName,
    clerkFirstName: clerkHints.clerkFirstName,
    clerkUsername: clerkHints.clerkUsername,
    primaryEmail: access.primaryEmail,
  });
  const canSubmit =
    access.state === "approved" && (access.roles ?? []).includes("knowledge_reader");

  return (
    <NexusShell
      convexConnected={isConvexConfigured()}
      clerkEnabled={isClerkConfigured()}
      userLabel={sidebarIdentityLabel}
      sidebarIdentityLabel={sidebarIdentityLabel}
      isAdmin={access.roles?.includes("nexus_admin")}
      canSubmit={canSubmit}
    />
  );
}
