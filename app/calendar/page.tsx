import { ToolPageFrame } from "@/lib/workspace/ToolPageFrame";
import { CalendarWorkspace } from "@/components/workspace/port/CalendarWorkspace";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  return (
    <ToolPageFrame>
      <CalendarWorkspace />
    </ToolPageFrame>
  );
}
