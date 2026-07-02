import { WorkspacePageShell } from "@/components/shell/WorkspacePageShell";
import { TasksWorkspace } from "@/components/workspace/port/TasksWorkspace";
import { isClerkConfigured, isConvexConfigured } from "@/lib/env";
import { requireWorkspaceAccess } from "@/lib/workspace/requireWorkspaceAccess";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const { access, userLabel, sidebarIdentityLabel } = await requireWorkspaceAccess();
  const canQuery = (access.roles ?? []).includes("knowledge_reader");

  return (
    <WorkspacePageShell
      userLabel={userLabel}
      sidebarIdentityLabel={sidebarIdentityLabel}
      convexConnected={isConvexConfigured()}
      clerkEnabled={isClerkConfigured()}
      isAdmin={access.roles?.includes("nexus_admin")}
    >
      <TasksWorkspace canQuery={canQuery} />
    </WorkspacePageShell>
  );
}
