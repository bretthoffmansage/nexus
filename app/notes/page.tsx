import { ToolPageFrame } from "@/lib/workspace/ToolPageFrame";
import { NotesWorkspace } from "@/components/workspace/port/NotesWorkspace";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  return (
    <ToolPageFrame>
      <NotesWorkspace />
    </ToolPageFrame>
  );
}
