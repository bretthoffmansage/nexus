import { ToolPageFrame } from "@/lib/workspace/ToolPageFrame";
import { TasksWorkspace } from "@/components/workspace/port/TasksWorkspace";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  return (
    <ToolPageFrame>
      <TasksWorkspace />
    </ToolPageFrame>
  );
}
