import { ToolPageFrame } from "@/lib/workspace/ToolPageFrame";
import { AccessAdminPanel } from "@/components/admin/AccessAdminPanel";

export const dynamic = "force-dynamic";

export default async function AdminAccessPage() {
  return (
    <ToolPageFrame requiredRole="nexus_admin">
      <div className="nexus-tool-page-inner">
        <AccessAdminPanel />
      </div>
    </ToolPageFrame>
  );
}
