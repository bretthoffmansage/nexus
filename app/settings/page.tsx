import { ToolPageFrame } from "@/lib/workspace/ToolPageFrame";
import { SettingsWorkspace } from "@/components/workspace/port/SettingsWorkspace";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  return (
    <ToolPageFrame requiredRole="nexus_admin">
      <SettingsWorkspace />
    </ToolPageFrame>
  );
}
