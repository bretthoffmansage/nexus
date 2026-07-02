# Nexus Attachment Download Failure — Diagnosis and Repair v1

**Package:** `nexus_attachment_download_failure_diagnosis_and_repair_v1`  
**Repository:** `/Users/bretthoffman/Documents/claudia_console`  
**Branch at start:** `main`  
**Starting HEAD:** `adcfc89` (Add canonical Connector allowed-tools update mutation)  
**Related implementation:** `7be92ac` — Add Nexus Library Dropzone upload and attachment protocol  
**Dev deployment (read-only inspection):** `doting-raven-338.convex.cloud`

## Purpose

Diagnose and repair live Library attachment-download failures for `obsidian.dropzone.process_document` where queue/claim/start/lease succeed but Claudia reports `attachment_download_failed` before any staging files are created.

## Repository baseline

- Work performed only in `claudia_console`; `claudia_system` was not modified.
- Unrelated uncommitted work preserved (AppShell, TopAlertBanner, chat spec, etc.).
- No live tasks, leases, attachment rows, document versions, or storage blobs were mutated.
- No Connector secrets rotated; no live Retry executed.

## Live task evidence

### User-cited “successful” task — `kd77sm79e7n99vhmbj5ywbjwc989qpzb`

| Field | Value |
|-------|-------|
| Status | `failed` |
| Terminal error | `attachment_execution_not_enabled` (Claudia transport-only mode) |
| Byte length | 133 |
| Attachment bound to task | Yes |
| Storage / version match | Yes |

**Interpretation:** Attachment download and verification succeeded; execution was intentionally blocked on the Claudia side. This is not the 487-byte success case.

### Actual successful end-to-end task — `kd70b18xqwp1mbmz8757n0eben89q4xy`

| Field | Value |
|-------|-------|
| Status | `completed` |
| Byte length | 487 |
| Document version | `ks750276d72r41nntbtjp73v0d89p30q` |
| Attachment bound to task | Yes |
| Storage metadata size | 487 (matches) |

### Failed task 1 — `kd75r3dp1mtqseekhcc94bxsh189srxr`

| Field | Value |
|-------|-------|
| Lease ID | `4bf3b938-8501-42b1-b1ca-9570fe30c807` |
| Status | `failed` |
| Terminal error (Claudia-reported) | `attachment_download_failed` |
| Timeline | claimed/started ~20:11:44 ET; failed ~20:11:49 ET (~5 s) |
| Byte length | 1352 |
| Document version | `ks7cqgpx7z6gj3tdarfnt9egwx89rrcc` |
| Attachment bound to task | Yes |
| Storage ID | `kg28nsdhawnm7vq1ys7gmxqbc189rm75` |
| Post-failure storage metadata | Present; size 1352 |

### Failed task 2 — `kd7be03q3d9rjc1nhs8rkk4fg189s8nt`

| Field | Value |
|-------|-------|
| Lease ID | `9ea634a5-fb69-428d-bf57-960903105596` |
| Status | `failed` |
| Terminal error | `attachment_download_failed` |
| Timeline | claimed/started ~20:12:20 ET; failed ~20:12:25 ET (~5 s) |
| Same document version / storage / SHA as failed task 1 | Yes |
| New task ID, new attachment ID, fresh lease | Yes |
| Same idempotency key as failed task 1 | Yes (index is non-unique) |

## Comparison table

| Dimension | Success (`kd70b18x…`) | User-cited transport success (`kd77sm79…`) | Failed 1 | Failed 2 |
|-----------|----------------------|---------------------------------------------|----------|----------|
| Bytes | 487 | 133 | 1352 | 1352 |
| Document version | `ks750276…` | `ks7acbhn…` | `ks7cqgpx…` | `ks7cqgpx…` (same) |
| Attachment task binding | Valid | Valid | Valid | Valid |
| Storage ID matches version | Yes | Yes | Yes | Yes |
| Storage readable now | Yes | Yes | Yes | Yes |
| Nexus terminal status | `completed` | `failed` (execution gate) | `failed` | `failed` |
| Claudia staging files | N/A (completed) | Created (transport-only stop) | None | None |

## Request receipt and HTTP findings

Convex HTTP log search for `POST /api/connector/v1/attachment` around the failure windows was inconclusive (limited retention / search latency). **Definitive per-request HTTP audit rows were not available pre-repair.**

Inference from code path + Claudia timing (~5 s ≈ 4 Connector attempts × ~1 s backoff):

| Question | Failed 1 | Failed 2 |
|----------|----------|----------|
| Request likely reached Nexus | **Probable** (claim/start/lease/progress succeeded; Claudia built signed requests) | **Probable** |
| HMAC / Connector identity | Would pass if request arrived (same path as working claim/start) | Same |
| Task / lease binding in DB | Valid at inspection | Valid at inspection |
| First failing authority boundary (code) | **`authorizeAttachmentDownload` storage metadata read inside `internalQuery`** | Same |

Pre-repair source (`7be92ac`): `authorizeAttachmentDownload` called `ctx.storage.getMetadata` inside an `internalQuery` invoked from the HTTP action via `ctx.runQuery`. The HTTP handler’s `ctx.storage.get` never ran when the query failed first.

Failure modes from that call site:

1. **`getMetadata` throws** → caught as HTTP **500** `internal_error`
2. **`getMetadata` returns null** → HTTP **404** `attachment_storage_unavailable`

Both are retryable from Claudia’s Connector client (~3 transient retries + initial attempt ≈ 5 s), matching observed failure duration. No staging files were created because Claudia never received a complete 200 body.

## Retry behavior audit

Library **Re-process** (`processMyDocumentVersion` after prior failure):

- Creates a **new** `nexusTasks` row with a fresh `queueSequence`
- Creates a **new** `nexusTaskAttachments` row with a **new** `attachmentId`
- Preserves the same `documentVersionId`, `storageId`, SHA-256, and byte length
- Reuses the same idempotency key string (both failed tasks share it)
- Does **not** leave attachment rows bound to the old task

**Conclusion:** Retry metadata was valid; stale attachment-to-task binding was **not** the root cause.

## Exact root cause

**Storage I/O was performed inside `authorizeAttachmentDownload` (`internalQuery`) via `ctx.storage.getMetadata`, which is not the authoritative context for attachment byte delivery.**

When the HTTP action invoked this query through `ctx.runQuery`, storage metadata access failed (throw → `internal_error`, or null → `attachment_storage_unavailable`) **before** the HTTP action reached its own `ctx.storage.get` blob read. Live post-failure inspection shows blobs and bindings are valid; the defect is **context/placement of storage reads**, not missing uploads or corrupted Retry metadata.

Reproduced in focused tests: pre-repair pattern (metadata read in query or HTTP `getMetadata`) yields 500 in convex-test; repair (DB-only query + `storage.get` in HTTP action) returns 200 with exact bytes and protocol headers for 1352-byte payloads.

## Why the earlier 487-byte request succeeded

Task `kd70b18x…` completed through the same route implementation. Smaller payload / timing / isolate behavior may have allowed the query-context `getMetadata` call to succeed intermittently. The 487-byte case demonstrates the route **can** work when storage metadata is reachable in that path; the 1352-byte failures demonstrate it is **not reliable** there. The repair removes query-context storage dependence entirely.

## Repair

1. **`convex/connectorAttachments.ts`**
   - `authorizeAttachmentDownload`: DB/lease/connector/task/attachment binding only; **removed** `ctx.storage.getMetadata`.
   - Added `logAttachmentDownloadDiagnostic()` — privacy-safe JSON logs (`kind: "nexus_attachment_download"`).

2. **`convex/http.ts`**
   - Attachment handler: run authorization query, then **`ctx.storage.get` + byte-length verification** in the HTTP action only.
   - Stage diagnostics: `auth_rejected`, `authorized`, `storage_blob_missing`, `storage_blob_size_mismatch`, `response_sent`, `handler_error`.

No alternate endpoint, no HMAC weakening, no public URLs, no security relaxation.

## Security invariants preserved

- HMAC authentication and nonce replay protection unchanged
- Connector, task, lease, and attachment binding checks unchanged
- Task status gate (`claimed` / `running` / `cancel_requested`) unchanged
- Immutable document version identity and descriptor SHA/length headers unchanged
- No raw Convex storage URLs exposed
- No file bodies, signatures, or secrets logged

## Safe diagnostics

Structured Convex console logs only. Fields: `requestId`, `taskId`, `attachmentId`, `connectorId`, `stage`, `errorCode`, `httpStatus`, `expectedByteLength`, `bytesSent`, `durationMs`. No bodies, secrets, or raw storage URLs.

## Focused tests

**File:** `tests/nexus-attachment-download.test.ts`

| Test | Purpose |
|------|---------|
| 1352-byte success + headers | Regression for failed live payload size |
| Invalid HMAC | 401 |
| Wrong lease | 409 |
| Attachment not bound | 404 |
| Expired lease | 409 |
| Missing storage blob | 404 `attachment_storage_unavailable` |
| Library re-process | Fresh attachment row, same storage |
| Source guard | `authorizeAttachmentDownload` must not call storage APIs |

**Also run:** `npx convex dev --once` (TypeScript / function compile only — operator note: this syncs functions to dev).

## Live state left unchanged

- Failed task rows not retried or mutated
- No new live tasks created
- No Claudia System changes

## Operator next steps

1. **Deploy** this repair to the dev (then prod) Convex deployment when ready.
2. **Re-process** document version `ks7cqgpx7z6gj3tdarfnt9egwx89rrcc` from the Library UI (creates a new task + attachment row). Do **not** manually retry the failed task IDs in place.
3. Watch Convex logs for `kind: "nexus_attachment_download"` — expect `authorized` → `response_sent` with `httpStatus: 200` and matching `bytesSent`.
4. If failures persist after deploy, correlate `requestId` from Claudia with Nexus diagnostic stages (Claudia-side pass continues separately).

## Rollback

Revert commit `Repair Nexus signed attachment download failure`: restores query-context `getMetadata` (reintroduces the failure mode). Prefer rollback only if the repair causes unexpected regression; otherwise forward-fix.

## Commit

Message: `Repair Nexus signed attachment download failure`  
Files: `convex/connectorAttachments.ts`, `convex/http.ts`, `tests/nexus-attachment-download.test.ts`, this spec.  
**Not pushed. Not production-deployed by this package** (local `convex dev --once` may have synced dev — verify deployment posture before treating dev as unchanged).
