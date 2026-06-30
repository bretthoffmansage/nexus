import { redirect } from "next/navigation";
import { getNexusAccess } from "@/lib/auth/getNexusAccess";
import { AccessAdminPanel } from "@/components/admin/AccessAdminPanel";

export const dynamic = "force-dynamic";

export default async function AdminAccessPage() {
  const access = await getNexusAccess();

  if (access.state === "configuration_required") {
    redirect("/configuration-required");
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

  if (!access.roles?.includes("nexus_admin")) {
    redirect("/");
  }

  return (
    <div className="nexus-page" style={{ padding: "1.25rem" }}>
      <AccessAdminPanel />
    </div>
  );
}
