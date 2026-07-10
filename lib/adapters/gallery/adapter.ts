import type { AdapterReadResult, ToolAdapterMeta } from "@/lib/adapters/types";

export const galleryAdapterMeta: ToolAdapterMeta = {
  toolId: "gallery",
  availability: "connector_required",
  authority: "claudia_connector",
  futureClaudiaTaskKind: "gallery.sync",
};

export type GalleryItem = {
  id: string;
  title?: string;
  thumbnailUrl?: string;
  tags?: string[];
};

export async function listGalleryItems(): Promise<AdapterReadResult<GalleryItem[]>> {
  return {
    ok: false,
    availability: "connector_required",
    reason: "Gallery media is stored locally on the system and requires the Connector.",
    data: [],
  };
}
