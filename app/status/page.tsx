import { ToolPageFrame } from "@/lib/workspace/ToolPageFrame";
import { StatusWorkspace } from "@/components/workspace/port/StatusWorkspace";

export const dynamic = "force-dynamic";

export default async function StatusPage() {
  return (
    <ToolPageFrame>
      <StatusWorkspace />
    </ToolPageFrame>
  );
}
