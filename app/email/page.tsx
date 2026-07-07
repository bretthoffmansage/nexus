import { ToolPageFrame } from "@/lib/workspace/ToolPageFrame";
import { EmailWorkspace } from "@/components/workspace/port/EmailWorkspace";

export const dynamic = "force-dynamic";

export default async function EmailPage() {
  return (
    <ToolPageFrame requiredRole="nexus_admin">
      <EmailWorkspace />
    </ToolPageFrame>
  );
}
