import { ToolPageFrame } from "@/lib/workspace/ToolPageFrame";
import { GalleryWorkspace } from "@/components/workspace/port/GalleryWorkspace";

export const dynamic = "force-dynamic";

export default async function GalleryPage() {
  return (
    <ToolPageFrame>
      <GalleryWorkspace />
    </ToolPageFrame>
  );
}
