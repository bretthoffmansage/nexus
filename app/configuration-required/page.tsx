import { AccessStatusPage } from "@/components/access/AccessStatusPage";

export const dynamic = "force-dynamic";

export default function ConfigurationRequiredPage() {
  return (
    <AccessStatusPage
      title="Nexus is not configured"
      message="This deployment is missing required Clerk or Convex configuration. Protected Nexus access is disabled until configuration is complete."
      showSignOut={false}
    />
  );
}
