/**
 * Nexus Library Dropzone — single configuration surface.
 *
 * Remote format policy mirrors the Claudia contract
 * (`config/workflows/dropzone_input_formats.yaml`) minus local-only `.key`
 * and unsupported archives/executables. Max upload size, attachment protocol
 * version, and tool identity are defined here only — not scattered across UI,
 * mutations, or tests.
 */

/** Requested Claudia tool for explicit Library Process actions only. */
export const LIBRARY_DROPZONE_TOOL_ID = "obsidian.dropzone.process_document" as const;

/** Additive P6/P7 attachment protocol version (text-only tasks unchanged). */
export const LIBRARY_ATTACHMENT_PROTOCOL_VERSION = "v1" as const;

/** Connector download route (POST, HMAC-signed JSON body). */
export const LIBRARY_ATTACHMENT_DOWNLOAD_PATH = "/api/connector/v1/attachment" as const;

/** Maximum original upload / attachment byte length (25 MiB). */
export const LIBRARY_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Exactly one primary attachment per Dropzone task in v1. */
export const LIBRARY_MAX_ATTACHMENTS_PER_TASK = 1;

export const LIBRARY_ATTACHMENT_ROLE_PRIMARY = "primary_document" as const;

export type LibraryAttachmentRole = typeof LIBRARY_ATTACHMENT_ROLE_PRIMARY;

/** Extension-only remote eligibility (lowercase, with leading dot). */
export const LIBRARY_REMOTE_ELIGIBLE_EXTENSIONS = [
  ".md",
  ".markdown",
  ".txt",
  ".csv",
  ".json",
  ".html",
  ".htm",
  ".pdf",
  ".docx",
  ".xlsx",
  ".pptx",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
] as const;

export type LibraryRemoteExtension = (typeof LIBRARY_REMOTE_ELIGIBLE_EXTENSIONS)[number];

/** Explicitly denied extension groups for remote upload. */
export const LIBRARY_DENIED_EXTENSION_SUFFIXES = [
  ".key",
  ".zip",
  ".tar",
  ".gz",
  ".tgz",
  ".rar",
  ".7z",
  ".exe",
  ".dmg",
  ".pkg",
  ".msi",
  ".bat",
  ".cmd",
  ".sh",
  ".ps1",
  ".js",
  ".mjs",
  ".cjs",
  ".jar",
  ".iso",
  ".img",
] as const;

export const LIBRARY_TASK_KIND = "library_document_processing" as const;

/** Bounded Connector progress stages for Dropzone work. */
export const LIBRARY_CONNECTOR_PROGRESS_STAGES = [
  "downloading_attachment",
  "verifying_attachment",
  "staging_attachment",
  "processing_document",
] as const;

export function isLibraryRemoteExtension(ext: string): ext is LibraryRemoteExtension {
  return (LIBRARY_REMOTE_ELIGIBLE_EXTENSIONS as readonly string[]).includes(ext);
}

export function isDeniedLibraryExtension(ext: string): boolean {
  const lower = ext.toLowerCase();
  return (LIBRARY_DENIED_EXTENSION_SUFFIXES as readonly string[]).some(
    (denied) => lower === denied || lower.endsWith(denied),
  );
}

export function normalizeFileExtension(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? filename;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot).toLowerCase();
}

export function formatBytesForUi(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function libraryAcceptedFormatsLabel(): string {
  return LIBRARY_REMOTE_ELIGIBLE_EXTENSIONS.map((e) => e.slice(1)).join(", ");
}
