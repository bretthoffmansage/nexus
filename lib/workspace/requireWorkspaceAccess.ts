import { redirect } from "next/navigation";
import { getNexusAccess } from "@/lib/auth/getNexusAccess";
import { nexusAccessRedirectPath } from "@/lib/auth/nexusAccessRouting";
import type { NexusAccessResult } from "@/lib/auth/getNexusAccess";

export type WorkspaceAccessContext = {
  access: NexusAccessResult;
  userLabel: string;
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

  const userLabel =
    access.displayName ?? access.primaryEmail ?? access.clerkUserId ?? "Nexus user";

  return { access, userLabel };
}
