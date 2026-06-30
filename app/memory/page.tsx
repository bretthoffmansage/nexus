import { ToolPageFrame } from "@/lib/workspace/ToolPageFrame";
import { MemoryWorkspace } from "@/components/workspace/port/MemoryWorkspace";

export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  return (
    <ToolPageFrame>
      <MemoryWorkspace />
    </ToolPageFrame>
  );
}
