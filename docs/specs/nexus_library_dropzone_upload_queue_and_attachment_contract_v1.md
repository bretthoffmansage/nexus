# Nexus Library Dropzone Upload, Queue, and Attachment Contract v1

**Package:** `nexus_library_dropzone_upload_queue_and_attachment_contract_v1`  
**Repository:** `claudia_console` (Nexus)  
**Binding handoff:** [`nexus_p6_p7_task_attachment_handoff_contract_v1.md`](./nexus_p6_p7_task_attachment_handoff_contract_v1.md)

## Audit summary

| Area | Finding |
|------|---------|
| Branch at implementation | `main`, starting commit `be10215` |
| Previous Library UI | `DocumentsWorkspace.tsx` placeholder — legacy editor shell, no persistence |
| Legacy real documents | `legacy_local_console/` SQLite + FastAPI (not hosted Nexus) |
| Convex storage before package | Unused |
| Queue authority | `nexusTasks` + `nexusQueueCounter` (unchanged) |
| P6 claim before package | Text-only task payload |

## Previous Library architecture

Hosted Nexus exposed a ported legacy shell: Documents / Sessions / Archived tabs, search, disabled editor, and `documentsAdapterMeta.availability: connector_required`. No Convex tables, uploads, or processing.

## Final Library architecture

```
User upload (Convex storage URL)
  → finalize action (server SHA-256 + length)
  → immutable nexusLibraryDocumentVersions row
  → explicit Process click
  → one nexusTasks row (obsidian.dropzone.process_document)
  → global queueSequence
  → Connector claim (+ attachments[])
  → lease-bound POST /api/connector/v1/attachment
  → Claudia (future) processes locally
  → complete/fail (+ dropzoneResult) projects Library status
```

Nexus does **not** parse, extract, or place vault content.

## Schemas

### `nexusLibraryDocuments`

Logical document: `ownerClerkUserId`, `displayName`, `status` (`active` \| `archived` \| `deleted`), `latestVersionId`, `versionCount`, timestamps.

### `nexusLibraryDocumentVersions`

Immutable version per exact upload: filename metadata, `byteLength`, lowercase `sha256`, `storageId`, `processingStatus`, `activeTaskId`, `lastTaskId`, bounded terminal fields.

### `nexusTaskAttachments`

Task-bound descriptor: `attachmentId`, `taskId`, `documentVersionId`, `role: primary_document`, storage + digest metadata.

### `nexusTasks` extensions

Optional `conversationId` / `requestMessageId` for library tasks; `taskKind`, `libraryDocumentId`, `libraryDocumentVersionId`, `taskMetadata`.

## Configuration (`convex/lib/libraryDropzoneConfig.ts`)

- Max upload: **25 MiB** (`26214400` bytes)
- Remote extensions: `.md`, `.markdown`, `.txt`, `.csv`, `.json`, `.html`, `.htm`, `.pdf`, `.docx`, `.xlsx`, `.pptx`, `.png`, `.jpg`, `.jpeg`, `.webp`
- Denied: `.key`, archives, executables, scripts, unknown
- Tool ID: `obsidian.dropzone.process_document`
- Attachment protocol: `v1`

## Upload flow

1. `libraryDocuments.generateUploadUrl` (authenticated)
2. Client POST bytes to Convex storage URL (unchanged)
3. `libraryUpload.finalizeUpload` action reads blob, computes SHA-256, calls `finalizeUploadRecord`
4. Server verifies storage metadata size, extension policy, filename safety
5. Version row created; unsupported formats marked `unsupported` (no auto-process)

## Process action

`libraryDocuments.processMyDocumentVersion` atomically:

- verifies ownership and eligibility
- rejects duplicate active tasks (returns existing task)
- allocates global `queueSequence`
- inserts `nexusTasks` + `nexusTaskAttachments`
- sets version `processingStatus: queued`

`requestText` is descriptive only. Identity is in `taskMetadata` and attachment rows.

## Privacy

All library queries/mutations derive `ownerClerkUserId` from verified Clerk identity. Cross-user access returns `library_*_not_found`.

## UI

`DocumentsWorkspace.tsx`: multi-file upload zone, status filters, per-version Process / Queued / Processing / Retry, safe summaries only.

## Tests

`tests/nexus-library-dropzone.test.ts` — upload metadata, process/queue integration, claim attachments, privacy, terminal projection, canonical queue.

## Smoke status

Automated tests pass locally. Full live Convex deployment smoke not run in this package.

## Known limitations

- Attachment download HTTP route implemented; end-to-end binary download smoke requires deployed Convex HTTP + Connector
- Claudia attachment ingress not implemented (see handoff contract)
- `convex-test` does not emulate `storage.getMetadata`; finalize path validated via size guard tests + direct seed fixtures
- Range/resume not supported in v1

## Rollback

Revert package commit; schema tables are additive. Optional library task fields remain backward compatible for chat tasks.
