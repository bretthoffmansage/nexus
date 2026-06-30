import { ToolPageFrame } from "@/lib/workspace/ToolPageFrame";
import { SkillsWorkspace } from "@/components/workspace/port/SkillsWorkspace";

export const dynamic = "force-dynamic";

export default async function SkillsPage() {
  return (
    <ToolPageFrame>
      <SkillsWorkspace />
    </ToolPageFrame>
  );
}
