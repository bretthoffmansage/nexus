import { LIBRARY_MAX_UPLOAD_BYTES } from "@/convex/lib/libraryDropzoneConfig";
import type { Id } from "@/convex/_generated/dataModel";

async function clientSha256(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type LibraryUploadDeps = {
  generateUploadUrl: () => Promise<string>;
  finalizeUpload: (args: {
    storageId: Id<"_storage">;
    originalFilename: string;
    contentType: string;
    clientSha256?: string;
  }) => Promise<{ documentVersionId: Id<"nexusLibraryDocumentVersions"> }>;
};

/** Canonical Library upload: Convex storage URL → finalize action. */
export async function uploadLibraryFile(
  file: File,
  deps: LibraryUploadDeps,
): Promise<{ documentVersionId: Id<"nexusLibraryDocumentVersions"> }> {
  if (file.size > LIBRARY_MAX_UPLOAD_BYTES) {
    throw new Error("File exceeds the maximum upload size.");
  }
  const uploadUrl = await deps.generateUploadUrl();
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!res.ok) throw new Error("Upload to storage failed");
  const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
  const digest = await clientSha256(file);
  const result = await deps.finalizeUpload({
    storageId,
    originalFilename: file.name,
    contentType: file.type || "application/octet-stream",
    clientSha256: digest,
  });
  return { documentVersionId: result.documentVersionId };
}
