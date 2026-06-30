import { redirect } from "next/navigation";
import { getNexusAccess } from "@/lib/auth/getNexusAccess";
import { nexusAccessRedirectPath } from "@/lib/auth/nexusAccessRouting";
import { AccessAdminPanel } from "@/components/admin/AccessAdminPanel";

export const dynamic = "force-dynamic";

export default async function AdminAccessPage() {
  const access = await getNexusAccess();
  const redirectPath = nexusAccessRedirectPath(access);
  if (redirectPath) {
    redirect(redirectPath);
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
