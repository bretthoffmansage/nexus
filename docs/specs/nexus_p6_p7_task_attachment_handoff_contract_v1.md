# Nexus P6/P7 Task Attachment Handoff Contract v1

**Contract name:** `nexus_p6_p7_task_attachment_handoff_contract_v1`  
**Protocol version:** `v1` (additive extension — text-only tasks unchanged)  
**Nexus implementation modules:**

| Module | Role |
|--------|------|
| `convex/lib/libraryDropzoneConfig.ts` | Format policy, max size, tool ID, download path |
| `convex/libraryDocuments.ts` | Upload finalize, list, process, archive |
| `convex/libraryUpload.ts` | Authenticated finalize action (SHA-256 authority) |
| `convex/connectorAttachments.ts` | Download authorization query |
| `convex/connectorTasks.ts` | Claim attachments, terminal projection |
| `convex/http.ts` | `POST /api/connector/v1/attachment` |
| `convex/schema.ts` | Library + attachment tables, task extensions |

**Recommended next Nexus package:** **Nexus Trusted Attachment Ingress and Nexus Connector Transport v1**

---

## 1. Compatibility

- P6 protocol remains `v1`.
- Text-only tasks: `attachments` field **omitted** from claim payload.
- File-backed tasks: optional `attachments` array (length 1 for Dropzone v1).
- Connectors without attachment support must **not** claim `vault.dropzone.process_document` tasks (tool allowlist).

## 2. Claim payload extension

Existing fields unchanged. Additive fields on claimed task:

| Field | Type | Notes |
|-------|------|-------|
| `taskKind` | `"library_document_processing"` \| `"chat"` \| omitted | |
| `taskMetadata` | object \| omitted | Server-built only |
| `attachments` | array \| omitted | Present when task has attachments |

### Attachment descriptor (claim)

```json
{
  "attachmentId": "uuid",
  "documentId": "nexusLibraryDocuments id",
  "documentVersionId": "nexusLibraryDocumentVersions id",
  "role": "primary_document",
  "originalFilename": "report.pdf",
  "contentType": "application/pdf",
  "fileExtension": ".pdf",
  "byteLength": 12345,
  "sha256": "64-char lowercase hex",
  "downloadPath": "/api/connector/v1/attachment"
}
```

**Never included:** bytes, storage ID, public URL, owner user ID, local paths.

## 3. Structured task metadata

```json
{
  "kind": "library_document_processing",
  "explicitUserAction": "process",
  "documentId": "...",
  "documentVersionId": "...",
  "idempotencyKey": "<documentVersionId>:<sha256>",
  "attachments": [{ "attachmentId": "uuid", "role": "primary_document" }]
}
```

Stored on `nexusTasks.taskMetadata`. Browser cannot supply this directly.

## 4. Download endpoint

| Property | Value |
|----------|-------|
| Method | `POST` |
| Path | `/api/connector/v1/attachment` |
| Request `Content-Type` | `application/json` |
| Success body | Raw binary only (2xx) |
| Failure body | JSON error envelope only |

### Request body

```json
{
  "action": "download",
  "taskId": "nexusTasks id",
  "leaseId": "lease uuid",
  "attachmentId": "attachment uuid"
}
```

### HMAC headers (same as P6)

- `X-Nexus-Connector-Id`
- `X-Nexus-Connector-Timestamp`
- `X-Nexus-Connector-Nonce`
- `X-Nexus-Connector-Signature`
- `X-Nexus-Protocol-Version: v1`

Signing uses existing `nexus-connector-v1` canonical string (method, path, body SHA-256). Binary response is **not** part of request signing.

### Binary success headers (200)

| Header | Value |
|--------|-------|
| `Content-Type` | Stored content type or `application/octet-stream` |
| `Content-Length` | Exact byte length |
| `Content-Disposition` | `attachment; filename="..."; filename*=UTF-8''...` |
| `X-Nexus-Protocol-Version` | `v1` |
| `X-Nexus-Attachment-Id` | Attachment UUID |
| `X-Nexus-Document-Version-Id` | Version id |
| `X-Nexus-Content-Sha256` | Lowercase hex digest |
| `X-Nexus-Request-Id` | Correlation id |

### JSON error envelope (non-2xx)

```json
{
  "ok": false,
  "error": { "code": "wrong_lease", "message": "..." },
  "requestId": "req_..."
}
```

### Attachment error codes

`invalid_request`, `invalid_signature`, `stale_timestamp`, `replay_detected`, `connector_unauthorized`, `connector_disabled`, `connector_revoked`, `task_not_found`, `task_not_claimed`, `wrong_connector`, `wrong_lease`, `lease_expired`, `cancellation_requested`, `attachment_not_bound`, `attachment_version_mismatch`, `attachment_storage_unavailable`, `attachment_metadata_mismatch`, `attachment_too_large`, `unsupported_attachment_action`, `attachment_read_failed`, `internal_error`

## 5. Size and format policy

- **Max attachment size:** `26214400` bytes (25 MiB)
- **Eligible extensions:** `.md`, `.markdown`, `.txt`, `.csv`, `.json`, `.html`, `.htm`, `.pdf`, `.docx`, `.xlsx`, `.pptx`, `.png`, `.jpg`, `.jpeg`, `.webp`
- **Denied:** `.key`, archives, executables, scripts, unknown/extensionless

## 6. Checksum and length

- SHA-256: lowercase hex, 64 characters, over exact stored bytes
- `byteLength` must match `Content-Length` and verified local length
- Idempotency key: `<documentVersionId>:<sha256>`

## 7. Filename and MIME

- Original filename preserved in metadata; path segments stripped for display/download
- NUL/control/CRLF injection rejected
- MIME persisted but extension policy is authoritative for eligibility

## 8. Lease and Connector authorization

Download permitted only when:

1. Valid HMAC + fresh nonce + timestamp window
2. Active registered Connector
3. Task claimed by this Connector with matching `leaseId`
4. Lease not expired; task not cancelled
5. Attachment bound to task and version

## 9. Retry, range, cancellation

- **Range:** not supported in v1; `Range` header → `invalid_request`
- **Retry:** new timestamp + nonce each attempt; same lease must remain valid
- **Lease loss / cancellation:** reject download; discard partial bytes; do not invoke tool

## 10. Terminal result (`POST /api/connector/v1/task`, action `complete`)

Optional `dropzoneResult`:

```json
{
  "processingDisposition": "processed",
  "userSafeMessage": "Document processed.",
  "notesCreated": 2,
  "vaultLocatorCount": 2,
  "warnings": [],
  "retryable": false,
  "partial": false
}
```

### Library status mapping

| Disposition | Library status |
|-------------|----------------|
| `processed`, `already_completed` | Processed |
| `needs_review`, `blocked`, `paused` | Needs Review |
| `failed` | Failed |

## 11. Representative claim example

```json
{
  "ok": true,
  "data": {
    "status": "claimed",
    "task": {
      "taskId": "...",
      "leaseId": "...",
      "requestedToolId": "vault.dropzone.process_document",
      "requestText": "Process uploaded document: notes.md",
      "taskKind": "library_document_processing",
      "taskMetadata": { "kind": "library_document_processing", "explicitUserAction": "process", "idempotencyKey": "..." },
      "attachments": [{
        "attachmentId": "...",
        "documentVersionId": "...",
        "role": "primary_document",
        "byteLength": 42,
        "sha256": "...",
        "downloadPath": "/api/connector/v1/attachment"
      }],
      "protocolVersion": "v1"
    }
  },
  "requestId": "req_..."
}
```

## 12. Test results (Nexus)

- `tests/nexus-library-dropzone.test.ts`: 10 tests passing
- P5/P6 regression suite: 309 tests passing (full `npm run test`)

## 13. Smoke-test state

Local automated verification only. Deployed HTTP binary download and Nexus end-to-end not executed.

## 14. Nexus readiness

Nexus **may not** safely execute end-to-end until implementing:

1. Parse `attachments[]` from claim
2. Signed download with lease-bound POST
3. Stream exact bytes; verify length + SHA-256
4. Local staging + authorize `vault.dropzone.process_document`
5. Return `dropzoneResult` on complete

## 15. Known limitations

- Single primary attachment per Dropzone task
- No automatic reprocess after `processed` / `needs_review`
- Connector must opt into Dropzone tool via `allowedToolIds`
