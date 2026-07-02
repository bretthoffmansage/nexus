import { LIBRARY_MAX_UPLOAD_BYTES } from "@/convex/lib/libraryDropzoneConfig";

/** UTF-8 bytes of the exact textarea value (no trimming, no wrappers). */
export function encodeMarkdownUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function utf8ByteLength(text: string): number {
  return encodeMarkdownUtf8(text).byteLength;
}

/** Whitespace-only drafts cannot submit. Body bytes are never trimmed. */
export function isCreateDraftEmpty(text: string): boolean {
  return text.trim().length === 0;
}

/**
 * Collision-resistant UTC filename for Create submissions.
 * Pattern: nexus-created-YYYY-MM-DD-HHmmss.md
 */
export function generateNexusCreatedFilename(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = now.getUTCFullYear();
  const m = pad(now.getUTCMonth() + 1);
  const d = pad(now.getUTCDate());
  const h = pad(now.getUTCHours());
  const min = pad(now.getUTCMinutes());
  const s = pad(now.getUTCSeconds());
  return `nexus-created-${y}-${m}-${d}-${h}${min}${s}.md`;
}

export function markdownFileFromText(text: string, filename: string): File {
  const bytes = encodeMarkdownUtf8(text);
  if (bytes.byteLength > LIBRARY_MAX_UPLOAD_BYTES) {
    throw new Error("CREATE_DRAFT_TOO_LARGE");
  }
  const body = new Uint8Array(bytes.byteLength);
  body.set(bytes);
  return new File([body], filename, { type: "text/markdown" });
}
