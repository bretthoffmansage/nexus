# Package 7 — Worker output and source packet routes

| Field | Value |
|-------|-------|
| **Package** | Package 7 — Worker output and source packet routes |
| **Date/time** | 2026-06-02 |
| **Repo path** | `/Users/bretthoffman/Documents/odysseus` |
| **Prior notes** | `package_00` … `package_06_chat_to_claudia_messages.md` |

## Objective

Add minimal Claudia Gateway routes for external **source** context and **worker output** packets, plus honest non-persistent packet list/detail placeholders. Forward to Claudia Core when configured; never execute locally.

## Files changed

| File | Change |
|------|--------|
| `src/claudia_scopes.py` | `authorize_claudia_worker()` for worker-output Bearer/session auth |
| `src/claudia_packets.py` | `normalize_source_packet()`, `normalize_worker_output_packet()` |
| `src/claudia_client.py` | `_forward_with_intake_fallback()`, `forward_source_packet()`, `forward_worker_output()`, packet list/detail placeholders |
| `routes/claudia_routes.py` | `POST /sources`, `POST /worker-output`, `GET /packets`, `GET /packets/{packet_id}` |
| `tests/test_claudia_source_worker_routes.py` | **New** — normalization, auth, forwarding, placeholders |
| `docs/claudia_console_reform/package_07_worker_output_source_routes.md` | **New** — this note |

## Behavior changed

### New Gateway routes

- **`POST /api/claudia/v1/sources`** — normalizes `type=source`, forwards to Core `POST /source-packets` (404 → `/intake`).
- **`POST /api/claudia/v1/worker-output`** — normalizes `type=worker_output`, forwards to Core `POST /worker-outputs` (404 → `/intake`).
- **`GET /api/claudia/v1/packets`** — placeholder list; states persistence not implemented.
- **`GET /api/claudia/v1/packets/{packet_id}`** — placeholder detail; not a canonical store.

### Refactor (no behavior change intended)

- `forward_message()` now uses shared `_forward_with_intake_fallback()` (same `/messages` + 404 → `/intake` behavior as Package 6).

## Behavior intentionally unchanged

- Package 1–6 console mode, chat bridge, messages/stream routes, intake, scopes (no new scopes).
- No upload bridge, approvals, dashboard UI, connector demotion, packet database.
- Legacy Odysseus chat/agent when `CLAUDIA_CONSOLE_MODE=false`.
- Frontend unchanged.

## New routes added

| Method | Path |
|--------|------|
| `POST` | `/api/claudia/v1/sources` |
| `POST` | `/api/claudia/v1/worker-output` |
| `GET` | `/api/claudia/v1/packets` |
| `GET` | `/api/claudia/v1/packets/{packet_id}` |

## Route behavior matrix

| Route | Packet type / behavior | Bearer scope | Session allowed? | Core target | Local execution? |
|-------|------------------------|--------------|------------------|-------------|------------------|
| **POST /api/claudia/v1/sources** | `type=source`; preserve route/source/reply; payload from caller (`source_type`, `content_ref`, etc.) | `claudia_intake` | Yes (when auth enabled) | `POST /source-packets` (404 → `/intake`) | **No** |
| **POST /api/claudia/v1/worker-output** | `type=worker_output`; preserve metadata; payload (`task_id`, `worker`, `summary`, etc.) | `claudia_worker` | Yes | `POST /worker-outputs` (404 → `/intake`) | **No** |
| **GET /api/claudia/v1/packets** | Placeholder list (`persistence_not_implemented`, empty `packets[]`) | `claudia_read` | Yes | None (no Core passthrough yet) | **No** |
| **GET /api/claudia/v1/packets/{packet_id}** | Placeholder detail (`packet: null`, honest message) | `claudia_read` | Yes | None | **No** |

## Source packet behavior

- Enforced `type: "source"` via `normalize_source_packet()`.
- Caller `route`, `source_id`, `reply_channel` preserved when provided; technical fallbacks (`gateway`, `gateway:<packet_id>`) when missing (Package 4 rules).
- Non-envelope keys (e.g. `source_type`, `content_ref`) land in `payload` via `_extract_payload`; Gateway does not invent business content.
- Full Package 4 envelope fields; `audit_required` defaults true.

## Worker output packet behavior

- Enforced `type: "worker_output"` via `normalize_worker_output_packet()`.
- Caller-supplied `task_id`, `worker`, `summary` (and other non-envelope fields) preserved in `payload` only when provided.
- Same envelope and forwarding rules as source packets.

## Packet list/detail behavior

- **No durable Gateway storage** and no claim of canonical persistence.
- `GET /packets` returns `status: persistence_not_implemented`, `packets: []`, `persistence: false`, `count: 0`.
- `GET /packets/{packet_id}` returns the requested `packet_id` with `packet: null` and the same honesty about local storage.
- Future packages may add safe Core passthrough when Core exposes list/detail APIs.

## Core-unconfigured behavior

`CLAUDIA_CORE_URL` unset → POST routes return `ok: false`, `status: core_not_configured`, `forwarded: false`, explicit message that nothing was forwarded or executed locally. GET placeholders still return 200 with `core_configured: false`.

## Core-unreachable behavior

Connect/timeout/HTTP errors on forward → `core_unreachable`, `core_timeout`, or `core_error`; messages state **no local execution occurred**.

## Forwarding behavior

1. Normalize packet envelope.
2. `POST` to specialized Core path (`/source-packets` or `/worker-outputs`).
3. On HTTP **404** only, retry `POST /intake` with same normalized packet (documented fallback; Gateway remains non-authoritative).
4. Response includes `source_path` or `worker_output_path` (`intake_fallback` when applicable).

## Auth behavior

| Route | Bearer | Session (`AUTH_ENABLED=true`) |
|-------|--------|-------------------------------|
| `POST /sources` | `claudia_intake` required | Logged-in user allowed |
| `POST /worker-output` | `claudia_worker` required | Logged-in user allowed |
| `GET /packets`, `GET /packets/{id}` | `claudia_read` required | Logged-in user allowed |

`claudia_intake` alone does **not** authorize `POST /worker-output` for Bearer tokens. Routes are not auth-exempt when auth is enabled. `AUTH_ENABLED=false` continues to allow test/local access per existing Gateway pattern.

## Safety guarantees

1. All routes under `/api/claudia/v1` only.
2. POST bodies normalize to Package 4 envelope with correct `type`.
3. Route/source/reply metadata preserved; no invented worker results or source content.
4. Core-unconfigured/unreachable responses are safe and non-executing.
5. Gateway does not run agent_loop, LLM, shell, MCP, or tools from new code paths.
6. Packet list/detail do not pretend Gateway is source of truth.
7. Package 6 chat-to-Claudia tests still pass.

## Tests / checks run

```bash
python3 -m compileall -q app.py core routes src
venv/bin/python -m pytest -q \
  tests/test_claudia_source_worker_routes.py \
  tests/test_claudia_messages.py \
  tests/test_claudia_chat_demotion.py \
  tests/test_claudia_gateway_routes.py \
  tests/test_claudia_token_scopes.py \
  tests/test_claudia_packets.py \
  tests/test_claudia_console_mode.py
```

**Results:** compileall pass; **69 passed**.

## Known pytest baseline issue (Package 0)

Full-suite `pytest --collect-only` still has 2 pre-existing collection errors (unchanged):

- `tests/test_chat_image_routing.py`
- `tests/test_webhook_ssrf_resilience.py`

## Risks

- Core may not yet implement `/source-packets` or `/worker-outputs`; 404 fallback to `/intake` may be the only path until Core ships specialized endpoints.
- Placeholder GET routes may confuse integrators until Core passthrough or persistence is added — mitigated by explicit `persistence_not_implemented` status.

## Follow-ups

- Safe Core passthrough for `GET /packets` when Core list API exists.
- Package 8: upload route → source-packet bridge.
- Approval routes and connector demotion in later packages.

## Next recommended package

**Package 8 — Upload route source-packet bridge**
