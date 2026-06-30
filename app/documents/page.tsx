import { ToolPageFrame } from "@/lib/workspace/ToolPageFrame";
import { DocumentsWorkspace } from "@/components/workspace/port/DocumentsWorkspace";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  return (
    <ToolPageFrame>
      <DocumentsWorkspace />
    </ToolPageFrame>
  );
}
