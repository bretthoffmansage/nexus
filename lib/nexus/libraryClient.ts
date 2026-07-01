import { api } from "@/convex/_generated/api";

/** Client boundary for hosted Library / Dropzone uploads. */
export const nexusLibrary = {
  generateUploadUrl: api.libraryDocuments.generateUploadUrl,
  finalizeUpload: api.libraryUpload.finalizeUpload,
  listVersions: api.libraryDocuments.listMyLibraryVersions,
  listDocumentVersions: api.libraryDocuments.listMyDocumentVersions,
  processVersion: api.libraryDocuments.processMyDocumentVersion,
  archiveVersion: api.libraryDocuments.archiveMyDocumentVersion,
  deleteVersion: api.libraryDocuments.deleteMyDocumentVersion,
} as const;

export type LibraryStatusFilter =
  | "all"
  | "uploaded"
  | "queued"
  | "processing"
  | "processed"
  | "needs_review"
  | "failed"
  | "unsupported"
  | "archived";

export const LIBRARY_STATUS_FILTERS: { key: LibraryStatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "uploaded", label: "Uploaded" },
  { key: "queued", label: "Queued" },
  { key: "processing", label: "Processing" },
  { key: "processed", label: "Processed" },
  { key: "needs_review", label: "Needs Review" },
  { key: "failed", label: "Failed" },
  { key: "unsupported", label: "Unsupported" },
  { key: "archived", label: "Archived" },
];

export function libraryStatusLabel(status: string): string {
  const found = LIBRARY_STATUS_FILTERS.find((f) => f.key === status);
  return found?.label ?? status;
}
