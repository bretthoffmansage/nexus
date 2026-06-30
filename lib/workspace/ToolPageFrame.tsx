import type { ReactNode } from "react";
import { WorkspacePageShell } from "@/components/shell/WorkspacePageShell";
import { isClerkConfigured, isConvexConfigured } from "@/lib/env";
import { requireWorkspaceAccess } from "@/lib/workspace/requireWorkspaceAccess";

type ToolPageFrameProps = {
  children: ReactNode;
  requiredRole?: "nexus_admin";
};

export async function ToolPageFrame({ children, requiredRole }: ToolPageFrameProps) {
  const { access, userLabel } = await requireWorkspaceAccess({ requiredRole });

  return (
    <WorkspacePageShell
      userLabel={userLabel}
      convexConnected={isConvexConfigured()}
      clerkEnabled={isClerkConfigured()}
      isAdmin={access.roles?.includes("nexus_admin")}
    >
      {children}
    </WorkspacePageShell>
  );
}
