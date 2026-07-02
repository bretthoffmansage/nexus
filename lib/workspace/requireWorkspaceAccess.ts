import { redirect } from "next/navigation";
import { getClerkDisplayNameHints } from "@/lib/auth/clerkDisplayNameHints";
import { getNexusAccess } from "@/lib/auth/getNexusAccess";
import { nexusAccessRedirectPath } from "@/lib/auth/nexusAccessRouting";
import { resolveNexusDisplayName } from "@/lib/auth/nexusDisplayName";
import type { NexusAccessResult } from "@/lib/auth/getNexusAccess";

export type WorkspaceAccessContext = {
  access: NexusAccessResult;
  userLabel: string;
  sidebarIdentityLabel: string;
};

export async function requireWorkspaceAccess(options?: {
  requiredRole?: "nexus_admin";
}): Promise<WorkspaceAccessContext> {
  const access = await getNexusAccess();
  const redirectPath = nexusAccessRedirectPath(access);
  if (redirectPath) {
    redirect(redirectPath);
  }

  if (options?.requiredRole === "nexus_admin") {
    if (!access.roles?.includes("nexus_admin")) {
      redirect("/");
    }
  }

  const clerkHints = await getClerkDisplayNameHints();
  const sidebarIdentityLabel = resolveNexusDisplayName({
    displayName: access.displayName,
    clerkFirstName: clerkHints.clerkFirstName,
    clerkUsername: clerkHints.clerkUsername,
    primaryEmail: access.primaryEmail,
  });

  return { access, userLabel: sidebarIdentityLabel, sidebarIdentityLabel };
}
