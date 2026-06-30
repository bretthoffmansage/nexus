# Package 8B — Upload-adjacent local processing guards

| Field | Value |
|-------|-------|
| **Package** | Package 8B — Upload-adjacent local processing guards |
| **Date/time** | 2026-06-02 |
| **Repo path** | `/Users/bretthoffman/Documents/odysseus` |
| **Prior notes** | `package_00` … `package_08_upload_source_packet_bridge.md` |

## Objective

When `CLAUDIA_CONSOLE_MODE=true`, block upload-adjacent routes that still invoked local vision/OCR models or personal RAG indexing. Return explicit non-authoritative JSON; preserve file staging/download and Package 8 source-packet bridge.

## Files changed

| File | Change |
|------|--------|
| `src/upload_console_guard.py` | **New** — `local_processing_disabled` responses |
| `routes/upload_routes.py` | Early return on `GET /{file_id}/vision` in Console Mode |
| `routes/personal_routes.py` | Early return on `POST /upload` in Console Mode |
| `tests/test_claudia_upload_processing_guards.py` | **New** |
| `docs/claudia_console_reform/package_08b_upload_processing_guards.md` | **New** — this note |

## Behavior changed

### Claudia Console Mode (`CLAUDIA_CONSOLE_MODE=true`)

- **`GET /api/upload/{file_id}/vision`** — returns `status: local_processing_disabled` before auth, cache, or `analyze_image_with_vl`.
- **`POST /api/personal/upload`** — returns `local_processing_disabled` before RAG init, file write, or `add_document`.

### Legacy mode

Unchanged vision OCR and personal RAG upload paths (subject to existing auth/RAG availability).

## Behavior intentionally unchanged

- **`POST /api/upload`** — Package 8 source-packet bridge per file.
- **`GET /api/upload/{file_id}`** — file serve and thumbnails (PIL resize only, no VL model).
- **`PUT /api/upload/{file_id}/vision`** — user-edited OCR cache write (no model call).
- Upload cleanup/stats, Gateway routes, chat bridge, Packages 1–7.

## Routes reviewed

| Route | Guarded in 8B? |
|-------|----------------|
| `GET /api/upload/{file_id}/vision` | **Yes** |
| `PUT /api/upload/{file_id}/vision` | Reviewed — **not** guarded (user text only, no model/index) |
| `POST /api/personal/upload` | **Yes** |
| `POST /api/upload` | No (Package 8 bridge only) |
| `GET /api/upload/{file_id}` | No |

## Route behavior matrix

| Route | Legacy mode behavior | Console Mode behavior | Local processing in Console Mode? |
|-------|----------------------|------------------------|-----------------------------------|
| **GET /api/upload/{file_id}/vision** | Cache or `analyze_image_with_vl` | `local_processing_disabled` JSON | **No** |
| **PUT /api/upload/{file_id}/vision** | Save user-edited text to cache | Unchanged (manual override file write) | **No** (no model/index) |
| **POST /api/personal/upload** | Save files + RAG chunk/index | `local_processing_disabled` JSON | **No** |
| **POST /api/upload** | Stage files; return metadata | Stage + `claudia_source_packet` (Package 8) | **No** (forward only) |

## Console Mode fallback behavior

```json
{
  "ok": false,
  "status": "local_processing_disabled",
  "claudia_console_mode": true,
  "local_processing_disabled": true,
  "route": "/api/upload/{file_id}/vision",
  "processing": "vision_ocr",
  "message": "Claudia Console Mode is active. Local Odysseus processing for this route (vision_ocr) is disabled. This was not handled by Claudia Core.",
  "guidance": "Use POST /api/upload to stage files; Claudia source packets are forwarded via the Gateway when CLAUDIA_CORE_URL is configured."
}
```

Personal upload uses `processing: personal_rag_indexing` and route `/api/personal/upload`. Does **not** claim Core handled the request.

## Safety guarantees

1. Guards only when `CLAUDIA_CONSOLE_MODE=true`.
2. Vision guard runs before `analyze_image_with_vl` and vision cache reads.
3. Personal upload guard runs before `_rag()`, file writes, and indexing.
4. No local agent, task scheduler, MCP, shell, memory, skills, or research from guard paths.
5. Package 8 upload bridge unchanged.

## Tests / checks run

```bash
python3 -m compileall -q app.py core routes src
venv/bin/python -m pytest -q \
  tests/test_claudia_upload_processing_guards.py \
  tests/test_claudia_upload_bridge.py \
  tests/test_claudia_source_worker_routes.py \
  tests/test_claudia_messages.py \
  tests/test_claudia_chat_demotion.py \
  tests/test_claudia_gateway_routes.py \
  tests/test_claudia_token_scopes.py \
  tests/test_claudia_packets.py \
  tests/test_claudia_console_mode.py
```

**Results:** compileall pass; **81 passed**.

## Known pytest baseline issue (Package 0)

Full-suite `pytest --collect-only` still has 2 pre-existing collection errors:

- `tests/test_chat_image_routing.py`
- `tests/test_webhook_ssrf_resilience.py`

## Risks

- **`PUT /api/upload/{file_id}/vision`** still writes local OCR override cache in Console Mode (user-provided text only).
- Personal upload does not yet route to Claudia Core; clients must use `POST /api/upload` + source packets.

## Follow-ups

- Optional Console Mode guard on `PUT .../vision` if manual cache is undesirable.
- Future: personal docs intake via Claudia source packets.

## Next recommended package

**Package 9 — Console dashboard skeleton**
