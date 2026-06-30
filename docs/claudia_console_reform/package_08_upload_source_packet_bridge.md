# Package 8 — Upload route source-packet bridge

| Field | Value |
|-------|-------|
| **Package** | Package 8 — Upload route source-packet bridge |
| **Date/time** | 2026-06-02 |
| **Repo path** | `/Users/bretthoffman/Documents/odysseus` |
| **Prior notes** | `package_00` … `package_07_worker_output_source_routes.md` |

## Objective

When `CLAUDIA_CONSOLE_MODE=true`, bridge successful chat attachment uploads (`POST /api/upload`) into Claudia `type=source` packets and forward via Package 7 `forward_source_packet()`. Preserve upload staging; no local agent/RAG/model execution from the bridge.

## Files changed

| File | Change |
|------|--------|
| `src/claudia_packets.py` | `create_upload_source_packet()` |
| `src/claudia_upload_bridge.py` | **New** — build packet + `bridge_upload_to_claudia_source()` |
| `routes/upload_routes.py` | Console Mode: attach `claudia_source_packet` per file after `save_upload` |
| `tests/test_claudia_upload_bridge.py` | **New** |
| `docs/claudia_console_reform/package_08_upload_source_packet_bridge.md` | **New** — this note |

## Behavior changed

### `POST /api/upload` in Claudia Console Mode

After each successful `save_upload`, the API response file entry gains `claudia_source_packet` with forward status (`ok`, `status`, `message`, `packet_id`, `trace_id`, `core_configured`, `forwarded`, `source_path`). Upload staging and existing fields (`id`, `name`, `mime`, etc.) are unchanged.

### Legacy mode

`POST /api/upload` response shape unchanged (no `claudia_source_packet` key).

## Behavior intentionally unchanged

- `save_upload` storage, deduplication, rate limits, MIME checks.
- `GET /api/upload/{file_id}`, thumbnails, vision OCR (`analyze_image_with_vl`) — **not** gated in this package.
- `POST /api/upload/cleanup`, `GET /api/upload/stats`.
- `POST /api/personal/upload` (personal RAG indexing) — not bridged.
- Packages 1–7 Gateway/chat/source routes.

## Upload endpoints reviewed

| Endpoint | Bridged in Package 8? |
|----------|------------------------|
| `POST /api/upload` | **Yes** (Console Mode only) |
| `POST /api/upload/cleanup` | No (admin maintenance) |
| `GET /api/upload/stats` | No |
| `GET /api/upload/{file_id}` | No (file serve) |
| `GET /api/upload/{file_id}/vision` | No (local VL model — follow-up risk) |
| `PUT /api/upload/{file_id}/vision` | No |
| `POST /api/personal/upload` | No (RAG index — follow-up) |

## Upload behavior matrix

| Endpoint | Legacy mode behavior | Console Mode behavior | Source packet created? | Local execution from bridge? |
|----------|----------------------|------------------------|-------------------------|------------------------------|
| **POST /api/upload** | Stage file; return `files[]` metadata | Same staging + `claudia_source_packet` per file | **Yes** (attempted) | **No** |
| **POST /api/upload/cleanup** | Admin cleanup | Unchanged | No | No |
| **GET /api/upload/stats** | Admin stats | Unchanged | No | No |
| **GET /api/upload/{file_id}** | Serve file/thumb | Unchanged | No | No |
| **GET /api/upload/{file_id}/vision** | VL OCR via `analyze_image_with_vl` | **Unchanged** (still may call local VL) | No | **Yes** (vision endpoint only) |
| **PUT /api/upload/{file_id}/vision** | Save edited OCR text | Unchanged | No | No |
| **POST /api/personal/upload** | Save + RAG index | **Unchanged** | No | **Yes** (indexing path) |

## Source packet field summary

| Field | Value / source |
|-------|----------------|
| **type** | `source` (via `create_upload_source_packet` → `normalize_source_packet`) |
| **route** | `upload` |
| **source_id** | `upload:{upload_id}` from `meta["id"]` |
| **reply_channel** | `{"route": "upload", "upload_id": "<id>"}` |
| **payload.source_type** | `file_upload` |
| **payload.content_ref** | `upload:{upload_id}` (API-relative ref, not absolute path) |
| **payload.filename** | `meta["name"]` |
| **payload.mime_type** | `meta["mime"]` when present |
| **payload.size** | `meta["size"]` when present |
| **payload.hash** | `meta["hash"]` when present |
| **payload.original_upload_response** | Safe subset of upload API fields (`id`, `name`, `mime`, `size`, `hash`, `uploaded_at`, `width`, `height`, `is_duplicate`) |
| **created_by** | `effective_user(request)` when available |
| **audit_required** | `true` |

## Core-unconfigured behavior

`CLAUDIA_CORE_URL` unset → upload still succeeds; `claudia_source_packet` reports `status: core_not_configured`, `forwarded: false`, explicit non-executing message.

## Core-unreachable behavior

Forward failure → `claudia_source_packet` reflects `core_unreachable`, `core_timeout`, or `core_error`; upload file entry still present.

## Forwarding behavior

1. Build packet with `create_upload_source_packet()`.
2. `forward_source_packet()` → Core `POST /source-packets` (404 → `/intake` per Package 7).
3. Status surfaced under `files[].claudia_source_packet` only.

## Auth behavior

Upload route auth unchanged (`get_current_user` for ownership on `save_upload`). Source packet `created_by` uses `effective_user(request)` for attribution. No new scopes; bridge does not bypass upload auth.

## Safety guarantees

1. Bridge activates only when `CLAUDIA_CONSOLE_MODE=true`.
2. Upload staging remains functional.
3. Package 4 envelope + Package 7 forward path.
4. `content_ref` is `upload:{id}` — no new absolute path exposure.
5. No `stream_agent_loop`, `llm_call_async`, task scheduler, MCP, shell, research, memory, or skills from bridge code.
6. No RAG indexing triggered by the bridge.
7. Packages 1–7 tests remain passing.

## Tests / checks run

```bash
python3 -m compileall -q app.py core routes src
venv/bin/python -m pytest -q \
  tests/test_claudia_upload_bridge.py \
  tests/test_claudia_source_worker_routes.py \
  tests/test_claudia_messages.py \
  tests/test_claudia_chat_demotion.py \
  tests/test_claudia_gateway_routes.py \
  tests/test_claudia_token_scopes.py \
  tests/test_claudia_packets.py \
  tests/test_claudia_console_mode.py
```

**Results:** compileall pass; **76 passed**.

## Known pytest baseline issue (Package 0)

Full-suite `pytest --collect-only` still has 2 pre-existing collection errors:

- `tests/test_chat_image_routing.py`
- `tests/test_webhook_ssrf_resilience.py`

## Risks

- **`GET /api/upload/{file_id}/vision`** still invokes local vision model in Console Mode if clients call it.
- **`POST /api/personal/upload`** still indexes personal RAG in Console Mode.
- Core may not implement `/source-packets` yet (intake fallback applies).

## Follow-ups

- Console Mode guard on vision endpoint and personal RAG upload.
- Package 9: Console dashboard skeleton.
- Optional: batch `claudia_source_packets` at response root if clients prefer.

## Next recommended package

**Package 9 — Console dashboard skeleton**
