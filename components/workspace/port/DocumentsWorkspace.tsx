"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useCallback, useRef, useState } from "react";
import {
  formatBytesForUi,
  LIBRARY_MAX_UPLOAD_BYTES,
  libraryAcceptedFormatsLabel,
} from "@/convex/lib/libraryDropzoneConfig";
import {
  LIBRARY_STATUS_FILTERS,
  libraryStatusLabel,
  nexusLibrary,
  type LibraryStatusFilter,
} from "@/lib/nexus/libraryClient";
import { useNexusAuthReadiness } from "@/lib/nexus/useNexusAuthReadiness";

type UploadRow = {
  id: string;
  file: File;
  state: "pending" | "uploading" | "finalizing" | "complete" | "failed";
  error?: string;
};

function clientSha256(file: File): Promise<string> {
  return file.arrayBuffer().then(async (buf) => {
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  });
}

/** Hosted Library — upload, version, and explicit Dropzone processing. */
export function DocumentsWorkspace() {
  const { ready } = useNexusAuthReadiness();
  const [filter, setFilter] = useState<LibraryStatusFilter>("all");
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [processBusy, setProcessBusy] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const versions = useQuery(
    nexusLibrary.listVersions,
    ready ? { statusFilter: filter, limit: 100 } : "skip",
  );
  const generateUploadUrl = useMutation(nexusLibrary.generateUploadUrl);
  const finalizeUpload = useAction(nexusLibrary.finalizeUpload);
  const processVersion = useMutation(nexusLibrary.processVersion);

  const onFilesSelected = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (!list.length) return;

      const rows: UploadRow[] = list.map((file) => ({
        id: crypto.randomUUID(),
        file,
        state: "pending",
      }));
      setUploads((prev) => [...rows, ...prev]);

      for (const row of rows) {
        const { file } = row;
        if (file.size > LIBRARY_MAX_UPLOAD_BYTES) {
          setUploads((prev) =>
            prev.map((u) =>
              u.id === row.id
                ? { ...u, state: "failed", error: "File exceeds the maximum upload size." }
                : u,
            ),
          );
          continue;
        }

        setUploads((prev) =>
          prev.map((u) => (u.id === row.id ? { ...u, state: "uploading" } : u)),
        );
        try {
          const uploadUrl = await generateUploadUrl({});
          const res = await fetch(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": file.type || "application/octet-stream" },
            body: file,
          });
          if (!res.ok) throw new Error("Upload to storage failed");
          const { storageId } = (await res.json()) as { storageId: string };
          setUploads((prev) =>
            prev.map((u) => (u.id === row.id ? { ...u, state: "finalizing" } : u)),
          );
          const digest = await clientSha256(file);
          await finalizeUpload({
            storageId: storageId as never,
            originalFilename: file.name,
            contentType: file.type || "application/octet-stream",
            clientSha256: digest,
          });
          setUploads((prev) =>
            prev.map((u) => (u.id === row.id ? { ...u, state: "complete" } : u)),
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : "Upload failed";
          setUploads((prev) =>
            prev.map((u) => (u.id === row.id ? { ...u, state: "failed", error: message } : u)),
          );
        }
      }
    },
    [finalizeUpload, generateUploadUrl],
  );

  const onProcess = async (documentVersionId: string) => {
    if (processBusy === documentVersionId) return;
    setProcessBusy(documentVersionId);
    try {
      await processVersion({ documentVersionId: documentVersionId as never });
    } finally {
      setProcessBusy(null);
    }
  };

  const maxLabel = formatBytesForUi(LIBRARY_MAX_UPLOAD_BYTES);

  return (
    <section className="legacy-port-workspace legacy-port-documents" aria-labelledby="doclib-heading">
      <header className="legacy-port-head">
        <h1 id="doclib-heading">Library</h1>
        <p className="legacy-port-subhead">
          Upload documents, keep immutable originals, and explicitly queue Dropzone processing.
        </p>
      </header>

      <div
        className="doclib-upload-zone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files.length) void onFilesSelected(e.dataTransfer.files);
        }}
      >
        <p>
          Drag and drop files here, or{" "}
          <button
            type="button"
            className="legacy-port-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={!ready}
          >
            Choose files
          </button>
        </p>
        <p className="doclib-upload-hint">
          Supported: {libraryAcceptedFormatsLabel()}. Max size: {maxLabel} per file.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) void onFilesSelected(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {uploads.length > 0 && (
        <ul className="doclib-upload-progress" aria-label="Upload progress">
          {uploads.map((u) => (
            <li key={u.id}>
              {u.file.name} — {u.state}
              {u.error ? `: ${u.error}` : ""}
            </li>
          ))}
        </ul>
      )}

      <div className="doclib-toolbar">
        <div className="doclib-tabs" role="tablist">
          {LIBRARY_STATUS_FILTERS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={filter === tab.key}
              className={`doclib-tab${filter === tab.key ? " active" : ""}`}
              onClick={() => setFilter(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="doclib-list" role="list">
        {!ready && <p className="legacy-port-empty">Sign in to use the Library.</p>}
        {ready && versions === undefined && <p className="legacy-port-empty">Loading…</p>}
        {ready && versions?.length === 0 && (
          <p className="legacy-port-empty">No documents yet. Upload a file to get started.</p>
        )}
        {versions?.map((v) => (
          <article key={v.documentVersionId} className="doclib-version-card" role="listitem">
            <header>
              <strong>{v.displayFilename}</strong>
              <span className="doclib-version-badge">{libraryStatusLabel(v.processingStatus)}</span>
            </header>
            <p className="doclib-version-meta">
              v{v.versionNumber} · {v.fileExtension || "unknown"} · {formatBytesForUi(v.byteLength)} ·{" "}
              {new Date(v.uploadedAt).toLocaleString()}
            </p>
            {v.progressMessage && <p className="doclib-version-progress">{v.progressMessage}</p>}
            {v.terminalSummary && <p className="doclib-version-summary">{v.terminalSummary}</p>}
            {v.unsupportedReason && <p className="doclib-version-warn">{v.unsupportedReason}</p>}
            {(v.notesCreatedCount !== undefined || v.vaultLocatorCount !== undefined) && (
              <p className="doclib-version-meta">
                Notes: {v.notesCreatedCount ?? 0} · Locators: {v.vaultLocatorCount ?? 0}
              </p>
            )}
            <div className="doclib-version-actions">
              {v.processingStatus === "uploaded" && (
                <button
                  type="button"
                  className="legacy-port-btn"
                  disabled={processBusy === v.documentVersionId}
                  onClick={() => void onProcess(v.documentVersionId)}
                >
                  Process
                </button>
              )}
              {v.processingStatus === "queued" && (
                <button type="button" className="legacy-port-btn" disabled>
                  Queued
                </button>
              )}
              {v.processingStatus === "processing" && (
                <button type="button" className="legacy-port-btn" disabled>
                  Processing
                </button>
              )}
              {v.processingStatus === "failed" && v.terminalRetryable && (
                <button
                  type="button"
                  className="legacy-port-btn"
                  disabled={processBusy === v.documentVersionId}
                  onClick={() => void onProcess(v.documentVersionId)}
                >
                  Retry
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
