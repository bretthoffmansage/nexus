import { ToolPageFrame } from "@/lib/workspace/ToolPageFrame";
import { KnowledgeWorkspace } from "@/components/workspace/port/KnowledgeWorkspace";

export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  return (
    <ToolPageFrame>
      <KnowledgeWorkspace />
    </ToolPageFrame>
  );
}
