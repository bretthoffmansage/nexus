import { redirect } from "next/navigation";
import { getNexusAccess } from "@/lib/auth/getNexusAccess";
import { NexusShell } from "@/components/shell/NexusShell";
import { isClerkConfigured, isConvexConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const access = await getNexusAccess();

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

  if (access.state === "unauthenticated") {
    redirect("/sign-in");
  }

  if (access.state === "pending" || access.state === "approved_without_role") {
    redirect("/pending-approval");
  }

  if (access.state === "suspended") {
    redirect("/access-suspended");
  }

  const label = access.displayName ?? access.primaryEmail ?? access.clerkUserId ?? "Nexus user";

  return (
    <NexusShell
      convexConnected={isConvexConfigured()}
      clerkEnabled={isClerkConfigured()}
      userLabel={label}
    />
  );
}
