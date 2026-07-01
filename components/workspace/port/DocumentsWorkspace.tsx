"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useCallback, useRef, useState } from "react";
import { LibraryConfirmDialog } from "@/components/workspace/port/LibraryConfirmDialog";
import {
  formatBytesForUi,
  LIBRARY_MAX_UPLOAD_BYTES,
  libraryAcceptedFormatsLabel,
} from "@/convex/lib/libraryDropzoneConfig";
import {
  generateNexusCreatedFilename,
  isCreateDraftEmpty,
  markdownFileFromText,
  utf8ByteLength,
} from "@/lib/nexus/libraryCreateVault";
import {
  LIBRARY_STATUS_FILTERS,
  libraryStatusLabel,
  nexusLibrary,
  type LibraryStatusFilter,
  type LibraryViewMode,
} from "@/lib/nexus/libraryClient";
import { uploadLibraryFile } from "@/lib/nexus/libraryUploadFlow";
import { useNexusAuthReadiness } from "@/lib/nexus/useNexusAuthReadiness";

type UploadRow = {
  id: string;
  file: File;
  state: "pending" | "uploading" | "finalizing" | "complete" | "failed";
  error?: string;
};

type CreateSubmitStage = "preparing" | "uploading" | "finalizing" | "queuing" | null;

type PendingDialog = "clear" | "submit" | null;

/** Hosted Library — upload, version, explicit Process, and Create-to-Vault. */
export function DocumentsWorkspace() {
  const { isLoading, isAuthenticated, readyForPrivateQueries: ready } = useNexusAuthReadiness();
  const [viewMode, setViewMode] = useState<LibraryViewMode>({ kind: "list", filter: "all" });
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [processBusy, setProcessBusy] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState("");
  const [createSubmitStage, setCreateSubmitStage] = useState<CreateSubmitStage>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [pendingDialog, setPendingDialog] = useState<PendingDialog>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const createTextareaRef = useRef<HTMLTextAreaElement>(null);

  const listFilter = viewMode.kind === "list" ? viewMode.filter : "all";
  const versions = useQuery(
    nexusLibrary.listVersions,
    ready && viewMode.kind === "list" ? { statusFilter: listFilter, limit: 100 } : "skip",
  );
  const generateUploadUrl = useMutation(nexusLibrary.generateUploadUrl);
  const finalizeUpload = useAction(nexusLibrary.finalizeUpload);
  const processVersion = useMutation(nexusLibrary.processVersion);

  const uploadDeps = {
    generateUploadUrl: () => generateUploadUrl({}),
    finalizeUpload,
  };

  const onFilesSelected = useCallback(
    async (files: FileList | File[]) => {
      if (!ready) return;
      const list = Array.from(files);
      if (!list.length) return;

      const rows: UploadRow[] = list.map((file) => ({
        id: crypto.randomUUID(),
        file,
        state: "pending",
      }));
      setUploads((prev) => [...rows, ...prev]);

      for (const row of rows) {
        setUploads((prev) =>
          prev.map((u) => (u.id === row.id ? { ...u, state: "uploading" } : u)),
        );
        try {
          setUploads((prev) =>
            prev.map((u) => (u.id === row.id ? { ...u, state: "finalizing" } : u)),
          );
          await uploadLibraryFile(row.file, uploadDeps);
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
    [finalizeUpload, generateUploadUrl, ready],
  );

  const onProcess = async (documentVersionId: string) => {
    if (!ready || processBusy === documentVersionId) return;
    setProcessBusy(documentVersionId);
    try {
      await processVersion({ documentVersionId: documentVersionId as never });
    } finally {
      setProcessBusy(null);
    }
  };

  const selectListFilter = (filter: LibraryStatusFilter) => {
    setViewMode({ kind: "list", filter });
    setCreateSuccess(null);
  };

  const selectCreateMode = () => {
    setViewMode({ kind: "create" });
    setCreateSuccess(null);
    setCreateError(null);
  };

  const runCreateSubmit = async () => {
    if (!ready || createSubmitStage) return;
    const text = createDraft;
    if (isCreateDraftEmpty(text)) {
      setCreateError("Enter some text before submitting.");
      return;
    }
    if (utf8ByteLength(text) > LIBRARY_MAX_UPLOAD_BYTES) {
      setCreateError(
        `Draft exceeds the maximum upload size (${formatBytesForUi(LIBRARY_MAX_UPLOAD_BYTES)}).`,
      );
      return;
    }

    setCreateError(null);
    setCreateSuccess(null);
    setPendingDialog(null);

    try {
      setCreateSubmitStage("preparing");
      const filename = generateNexusCreatedFilename();
      const file = markdownFileFromText(text, filename);

      setCreateSubmitStage("uploading");
      const { documentVersionId } = await uploadLibraryFile(file, uploadDeps);

      setCreateSubmitStage("finalizing");
      setCreateSubmitStage("queuing");
      await processVersion({ documentVersionId });

      setCreateDraft("");
      setCreateSuccess("Document uploaded and queued for vault processing.");
      setViewMode({ kind: "list", filter: "queued" });
    } catch (err) {
      const message =
        err instanceof Error && err.message === "CREATE_DRAFT_TOO_LARGE"
          ? `Draft exceeds the maximum upload size (${formatBytesForUi(LIBRARY_MAX_UPLOAD_BYTES)}).`
          : err instanceof Error
            ? err.message
            : "Submit failed";
      setCreateError(message);
    } finally {
      setCreateSubmitStage(null);
    }
  };

  const maxLabel = formatBytesForUi(LIBRARY_MAX_UPLOAD_BYTES);
  const createBusy = createSubmitStage !== null;
  const uploadControlsDisabled = !ready || isLoading || createBusy;

  return (
    <section className="legacy-port-workspace legacy-port-documents" aria-labelledby="doclib-heading">
      <header className="legacy-port-head">
        <h1 id="doclib-heading">Library</h1>
        <p className="legacy-port-subhead">
          Upload documents, keep immutable originals, and explicitly queue Dropzone processing.
        </p>
      </header>

      {createSuccess && viewMode.kind === "list" ? (
        <p className="doclib-create-success" role="status">
          {createSuccess}
        </p>
      ) : null}

      {viewMode.kind === "list" && (
        <div
          className="doclib-upload-zone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (!ready) return;
            if (e.dataTransfer.files.length) void onFilesSelected(e.dataTransfer.files);
          }}
        >
          <p>
            Drag and drop files here, or{" "}
            <button
              type="button"
              className="legacy-port-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadControlsDisabled}
              aria-disabled={uploadControlsDisabled}
              title={!ready ? "Waiting for authentication" : undefined}
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
            disabled={uploadControlsDisabled}
            onChange={(e) => {
              if (e.target.files?.length) void onFilesSelected(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {uploads.length > 0 && viewMode.kind === "list" && (
        <ul className="doclib-upload-progress" aria-label="Upload progress">
          {uploads.map((u) => (
            <li key={u.id}>
              {u.file.name} — {u.state}
              {u.error ? `: ${u.error}` : ""}
            </li>
          ))}
        </ul>
      )}

      <div className="doclib-toolbar doclib-toolbar-view">
        <div className="doclib-tabs" role="tablist" aria-label="Library status filters">
          {LIBRARY_STATUS_FILTERS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={viewMode.kind === "list" && viewMode.filter === tab.key}
              className={`doclib-tab${viewMode.kind === "list" && viewMode.filter === tab.key ? " active" : ""}`}
              onClick={() => selectListFilter(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          role="tab"
          aria-selected={viewMode.kind === "create"}
          className={`doclib-tab doclib-create-tab${viewMode.kind === "create" ? " active" : ""}`}
          onClick={selectCreateMode}
        >
          Create
        </button>
      </div>

      {viewMode.kind === "create" ? (
        <div className="doclib-create-panel">
          <div className="doclib-create-actions">
            <button
              type="button"
              className="legacy-port-btn"
              disabled={createBusy || isCreateDraftEmpty(createDraft)}
              onClick={() => setPendingDialog("clear")}
            >
              Clear
            </button>
            <button
              type="button"
              className="legacy-port-btn"
              disabled={createBusy || !ready || isCreateDraftEmpty(createDraft)}
              onClick={() => setPendingDialog("submit")}
            >
              Submit to Vault
            </button>
          </div>
          {createSubmitStage ? (
            <p className="doclib-create-status" role="status" aria-live="polite">
              {createSubmitStage === "preparing" && "Preparing…"}
              {createSubmitStage === "uploading" && "Uploading…"}
              {createSubmitStage === "finalizing" && "Finalizing…"}
              {createSubmitStage === "queuing" && "Queuing…"}
            </p>
          ) : null}
          {createError ? (
            <p className="doclib-version-warn" role="alert">
              {createError}
            </p>
          ) : null}
          {createSuccess ? (
            <p className="doclib-create-success" role="status">
              {createSuccess}
            </p>
          ) : null}
          <label className="doclib-create-label" htmlFor="doclib-create-text">
            Markdown draft
          </label>
          <textarea
            id="doclib-create-text"
            ref={createTextareaRef}
            className="doclib-create-textarea"
            value={createDraft}
            disabled={createBusy}
            onChange={(e) => {
              setCreateDraft(e.target.value);
              setCreateError(null);
            }}
            placeholder="Write or paste Markdown text to submit as a new vault document…"
          />
        </div>
      ) : (
        <div className="doclib-list" role="list">
          {isLoading && <p className="legacy-port-empty">Loading Library…</p>}
          {!isLoading && !isAuthenticated && (
            <p className="legacy-port-empty">Sign in to use the Library.</p>
          )}
          {ready && versions === undefined && <p className="legacy-port-empty">Loading documents…</p>}
          {ready && versions?.length === 0 && (
            <p className="legacy-port-empty">No documents yet. Upload a file to get started.</p>
          )}
          {ready &&
            versions?.map((v) => (
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
      )}

      {pendingDialog === "clear" ? (
        <LibraryConfirmDialog
          title="Clear input?"
          busy={createBusy}
          onNo={() => setPendingDialog(null)}
          onYes={() => {
            setCreateDraft("");
            setPendingDialog(null);
            setCreateError(null);
            createTextareaRef.current?.focus();
          }}
        />
      ) : null}

      {pendingDialog === "submit" ? (
        <LibraryConfirmDialog
          title="Submit to Vault?"
          busy={createBusy}
          onNo={() => setPendingDialog(null)}
          onYes={() => void runCreateSubmit()}
        />
      ) : null}
    </section>
  );
}
