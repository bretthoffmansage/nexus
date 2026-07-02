# Nexus Connector Attachment Response Contract v1.1

Status: implemented (2026-07-02)
Amends: `nexus_library_dropzone_upload_queue_and_attachment_contract_v1.md`,
`nexus_attachment_download_failure_diagnosis_and_repair_v1.md`
Counterpart: Claudia `docs/specs/claudia_nexus_attachment_response_contract_alignment_v1.md`

## Live failure this amendment repairs

Tasks `kd775jzzey…` and `kd76vy0z…` (2026-07-01): the attachment route
authorized the signed request, returned HTTP 200 and sent all 1701 bytes
(`response_sent` diagnostics), yet the Connector rejected the response at
header validation with `invalid_response` and read zero body bytes.

Root cause: the deployed Convex/Cloudflare edge delivers larger response
bodies with **chunked transfer encoding and no standard `Content-Length`
header**. Small bodies (133 B and 487 B) were delivered non-chunked with
`Content-Length` and succeeded live on 2026-07-01; the first larger document
(1701 B) crossed the streaming threshold and lost the header. The Connector's
parser required standard `Content-Length` as its first check. `convex-test`
preserves manually-set `Content-Length`, so repository tests on both sides
passed against an idealized response the deployed edge does not produce.

Standard `Content-Length` is HTTP **framing** metadata owned by the
transport chain — not a reliable protocol carrier. Protocol metadata now
travels only in custom `X-Nexus-*` headers, which intermediaries pass
through untouched regardless of body framing.

## Canonical response contract (v1.1)

- Request: `POST /api/connector/v1/attachment`, HMAC-signed JSON body
  `{ action: "download", taskId, leaseId, attachmentId }` (unchanged).
- Authorization: Connector identity + task claim + lease + attachment
  binding, enforced before any storage read (unchanged).
- Success status: `200` with the raw attachment bytes as the body.

Required success headers (exact spelling; HTTP header names are
case-insensitive on the wire):

| Header | Value | Authority |
| --- | --- | --- |
| `Content-Type` | attachment content type | descriptor cross-check |
| `Content-Disposition` | `attachment; filename="…"` (sanitized) | display only |
| `X-Nexus-Protocol-Version` | `v1` | required, must equal `v1` |
| `X-Nexus-Attachment-Id` | attachment id | required, must match request |
| `X-Nexus-Document-Version-Id` | immutable version id | required |
| `X-Nexus-Content-Length` | decimal byte length | **authoritative length** |
| `X-Nexus-Content-Sha256` | 64-char lowercase hex | required |
| `X-Nexus-Request-Id` | route request id | correlation |

Standard `Content-Length` is still emitted and is correct when the transport
preserves it, but it is an **optional cross-check**: the Connector accepts
its absence (chunked delivery) and rejects only a conflicting value.

Body semantics: exact attachment bytes, no range support, 25 MiB cap.
The Connector verifies the exact byte count and SHA-256 of the actual
received body during trusted staging regardless of any header — headers
select and bind; the streamed bytes are what get verified.

Error responses: unchanged JSON envelope
(`{ ok:false, error:{code,message}, requestId, protocolVersion }`) with the
existing per-code HTTP statuses and retryability semantics.

`ATTACHMENT_RESPONSE_HEADER_CONTRACT` in `convex/connectorAttachments.ts` is
the in-code mirror of this table and is asserted by
`tests/nexus-attachment-download.test.ts`.

## Backward compatibility

- Additive only: v1.0 consumers ignore the new header.
- The repaired Connector still accepts a v1.0 response when the transport
  preserves standard `Content-Length` (the pre-2026-07-01 success shape).
- Protocol version stays `v1`; no request or signing change.

## Safe diagnostics

The Connector logs a bounded `validation_category` naming the exact rejected
check (e.g. `missing_content_length`, `conflicting_length_headers`,
`malformed_checksum`) — never header values, URLs, signed request data, or
content. Nexus route diagnostics are unchanged from
`nexus_attachment_download_failure_diagnosis_and_repair_v1.md`.
