import { ToolPageFrame } from "@/lib/workspace/ToolPageFrame";
import { ResearchWorkspace } from "@/components/workspace/port/ResearchWorkspace";

export const dynamic = "force-dynamic";

export default async function ResearchPage() {
  return (
    <ToolPageFrame>
      <ResearchWorkspace />
    </ToolPageFrame>
  );
}
