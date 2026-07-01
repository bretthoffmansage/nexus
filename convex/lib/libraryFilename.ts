/**
 * Filename safety for Library uploads and attachment download headers.
 *
 * Preserves the original filename in metadata; produces a sanitized display
 * name and RFC 5987 Content-Disposition value. Never uses the filename as a
 * server or local path.
 */

const CONTROL_OR_NUL = /[\u0000-\u001f\u007f]/g;
const PATH_SEP = /[/\\]/g;

/** Strip path components, control chars, and excessive length. */
export function sanitizeDisplayFilename(originalFilename: string, maxLength = 200): string {
  let name = originalFilename.replace(PATH_SEP, "").replace(CONTROL_OR_NUL, "").trim();
  if (!name || name === "." || name === "..") {
    name = "upload";
  }
  if (name.length > maxLength) {
    const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
    const stemMax = Math.max(1, maxLength - ext.length);
    name = name.slice(0, stemMax) + ext;
  }
  return name;
}

/** Reject obvious path traversal in the raw upload name. */
export function assertSafeOriginalFilename(originalFilename: string): void {
  if (!originalFilename || typeof originalFilename !== "string") {
    throw new Error("invalid_filename");
  }
  if (originalFilename.includes("\0") || CONTROL_OR_NUL.test(originalFilename)) {
    throw new Error("invalid_filename");
  }
  if (originalFilename.includes("..") || PATH_SEP.test(originalFilename)) {
    throw new Error("invalid_filename");
  }
}

/** RFC 5987 `filename*` plus ASCII fallback `filename`. */
export function contentDispositionAttachment(displayFilename: string): string {
  const safe = sanitizeDisplayFilename(displayFilename);
  const ascii = safe.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(safe).replace(/['()]/g, escape);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
