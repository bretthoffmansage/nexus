import { ToolPageFrame } from "@/lib/workspace/ToolPageFrame";
import { OperationsWorkspace } from "@/components/workspace/port/OperationsWorkspace";

export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  return (
    <ToolPageFrame>
      <OperationsWorkspace />
    </ToolPageFrame>
  );
}
