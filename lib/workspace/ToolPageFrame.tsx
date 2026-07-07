import type { ReactNode } from "react";
import { WorkspacePageShell } from "@/components/shell/WorkspacePageShell";
import { isClerkConfigured, isConvexConfigured } from "@/lib/env";
import { hasDeepResearchAccess } from "@/lib/auth/permissions";
import { requireWorkspaceAccess } from "@/lib/workspace/requireWorkspaceAccess";

type ToolPageFrameProps = {
  children: ReactNode;
  requiredRole?: "nexus_admin";
  requiredAccess?: "deep_research";
};

export async function ToolPageFrame({ children, requiredRole, requiredAccess }: ToolPageFrameProps) {
  const { access, userLabel, sidebarIdentityLabel } = await requireWorkspaceAccess({
    requiredRole,
    requiredAccess,
  });
  const roles = access.roles ?? [];

  return (
    <WorkspacePageShell
      userLabel={userLabel}
      sidebarIdentityLabel={sidebarIdentityLabel}
      convexConnected={isConvexConfigured()}
      clerkEnabled={isClerkConfigured()}
      isAdmin={roles.includes("nexus_admin")}
      canAccessDeepResearch={hasDeepResearchAccess(roles)}
    >
      {children}
    </WorkspacePageShell>
  );
}
