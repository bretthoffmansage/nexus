import { getNexusAccess } from "@/lib/auth/getNexusAccess";
import { AccessStatusPage } from "@/components/access/AccessStatusPage";

export const dynamic = "force-dynamic";

export default async function PendingApprovalPage() {
  const access = await getNexusAccess();

  const isRoleRequired = access.state === "approved_without_role";

  return (
    <AccessStatusPage
      title={isRoleRequired ? "Role assignment required" : "Awaiting approval"}
      message={
        isRoleRequired
          ? "Your Nexus account is approved but no role has been assigned yet. Contact an administrator to receive access."
          : "Your Nexus account is awaiting approval. An administrator will review your access request."
      }
      email={access.primaryEmail}
    />
  );
}
