import { getNexusAccess } from "@/lib/auth/getNexusAccess";
import { AccessStatusPage } from "@/components/access/AccessStatusPage";

export const dynamic = "force-dynamic";

export default async function AccessSuspendedPage() {
  const access = await getNexusAccess();

  return (
    <AccessStatusPage
      title="Access suspended"
      message="Your Nexus access has been suspended. Contact your administrator if you believe this is an error."
      email={access.primaryEmail}
    />
  );
}
