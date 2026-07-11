# Package 4 — Packet envelope normalization and route preservation

| Field | Value |
|-------|-------|
| **Package** | Package 4 — Packet envelope normalization and route preservation |
| **Date/time** | 2026-06-02 |
| **Repo path** | `/Users/bretthoffman/Documents/odysseus` |
| **Prior notes** | `package_00` … `package_03_nexus_token_scopes.md` |

## Objective

Normalize `POST /api/nexus/v1/intake` bodies into a stable Nexus Core packet envelope before forwarding or returning a safe stub response. Preserve caller route/source/reply metadata; use explicit technical fallbacks only when missing.

## Files changed

| File | Change |
|------|--------|
| `src/nexus_packets.py` | **New** — `normalize_nexus_packet`, validation, constants |
| `routes/nexus_routes.py` | Normalize before `forward_intake`; 422 on validation errors; `created_by` from `effective_user` |
| `src/nexus_client.py` | `forward_intake` expects pre-normalized packet (removed duplicate ID generation) |
| `tests/test_nexus_packets.py` | **New** — normalization and forwarding tests |
| `tests/test_nexus_gateway_routes.py` | Updated forward tests for normalized packets; AST check includes `nexus_packets.py` |
| `docs/console_reform/package_04_packet_envelope_route_preservation.md` | **New** — this note |

## Behavior changed

- **`POST /api/nexus/v1/intake`** always normalizes the JSON body into a full envelope before Core forward or stub response.
- Invalid `type`, `priority`, `status`, or non-object `payload`/`permissions` → **422** with `{"status":"validation_error","message":...,"field":...}`.
- Gateway response `packet_id` / `trace_id` reflect the **normalized** envelope (including generated IDs).
- Core receives the normalized packet JSON, not the raw unnormalized body.

## Behavior intentionally unchanged

- `GET /api/nexus/v1/health`, Package 3 auth (`nexus_intake` / session), Package 1 Console Mode, chat routes, Ollama, token scopes, no new Gateway routes.

## Packet fields supported

All Nexus Core envelope fields are emitted on every normalized packet:

`packet_id`, `type`, `route`, `source_id`, `reply_channel`, `payload`, `created_by`, `created_at`, `workspace`, `priority`, `permissions`, `status`, `parent_packet_id`, `trace_id`, `audit_required`

**Allowed types:** `task`, `message`, `source`, `worker_output`, `approval`, `audit`, `housekeeping`, `system`

**Allowed priorities:** `low`, `normal`, `high`, `urgent`

**Allowed statuses:** `new`, `accepted`, `processing`, `completed`, `failed`, `cancelled`, `rejected`

## Field behavior matrix

| Field | If provided | If missing | Notes |
|-------|-------------|------------|-------|
| **packet_id** | Preserved (non-empty string) | UUID generated | |
| **type** | Preserved if valid | Default `task` | Reject unknown types |
| **route** | Preserved | Technical fallback `gateway` | Not business provenance |
| **source_id** | Preserved | Technical fallback `gateway:<packet_id>` | Not business provenance |
| **reply_channel** | Preserved (any JSON value) | `null` | |
| **payload** | Preserved if `payload` key is object | Non-envelope keys copied into `payload`; or `{}` if only envelope keys | See payload rules below |
| **created_by** | Preserved | `effective_user(request)` or `gateway` | |
| **created_at** | Preserved (non-empty string) | Current UTC ISO8601 (`Z`) | |
| **workspace** | Preserved | `null` | String or object if provided |
| **priority** | Preserved if valid | `normal` | Reject invalid |
| **permissions** | Preserved if object | `{}` | Reject non-object |
| **status** | Preserved if valid | `new` | Reject invalid |
| **parent_packet_id** | Preserved | `null` | |
| **trace_id** | Preserved (non-empty string) | UUID generated | |
| **audit_required** | Preserved if boolean | `true` | Reject non-boolean |

### Payload rules

1. If body contains `payload` and it is a JSON object → use it as-is.
2. If body contains `payload` and it is not an object → **422**.
3. If body has no `payload` key → all keys not in `ENVELOPE_FIELDS` become `payload` (may be `{}`).

## Route preservation behavior

- Caller-supplied `route`, `source_id`, `reply_channel`, `parent_packet_id`, `workspace`, and `permissions` are copied without reinterpretation.
- Missing `route` / `source_id` use **documented technical fallbacks** (`gateway`, `gateway:<packet_id>`) — not claims about original business routing.
- Gateway does not invent Slack/email/user route provenance.

## Validation behavior

| Failure | HTTP | Response shape |
|---------|------|----------------|
| Invalid JSON | 400 | FastAPI default |
| Non-object body | 400 | Detail string |
| Bad `type` / `priority` / `status` | 422 | `validation_error` + `field` |
| Bad `payload` / `permissions` / `audit_required` | 422 | `validation_error` + `field` |

## Core-unconfigured behavior

After normalization, `forward_intake` returns `ok: false`, `status: core_not_configured`, with normalized `packet_id` and `trace_id`. No local execution.

## Core-unreachable behavior

Unchanged from Package 2: `core_unreachable` / `core_timeout` / `core_error` with normalized IDs in the Gateway envelope. No agent fallback.

## Forwarding behavior

`POST {NEXUS_CORE_URL}/intake` receives the **full normalized envelope** JSON. Headers unchanged (`X-Nexus-Gateway-Secret` when configured).

## Auth behavior (Package 3)

Unchanged: Bearer requires `nexus_intake`; session users allowed when authenticated; `AUTH_ENABLED=false` for tests/operator mode.

## Safety guarantees

- `src/nexus_packets.py` does not import `agent_loop`, `task_scheduler`, MCP, shell, or email modules.
- Normalization does not execute tasks, tools, or local models.
- Gateway remains non-authoritative; Nexus Core owns decisions.
- Does not depend on `NEXUS_CONSOLE_MODE`.

## Tests / checks run

| Check | Result |
|-------|--------|
| `python3 -m compileall -q app.py core routes src` | **Pass** |
| `pytest -q tests/test_nexus_packets.py` | **Pass** (12 tests) |
| `pytest -q tests/test_nexus_gateway_routes.py` | **Pass** (7 tests) |
| `pytest -q tests/test_nexus_token_scopes.py` | **Pass** (9 tests) |
| `pytest -q tests/test_console_mode.py` | **Pass** (17 tests) |
| Full pytest suite | **Not run** |

### Known pytest baseline (Package 0)

Pre-existing collect-only errors (unchanged):

- `tests/test_chat_image_routing.py`
- `tests/test_webhook_ssrf_resilience.py`

## Risks

| Risk | Note |
|------|------|
| Technical `route`/`source_id` defaults | Callers should set real metadata for production bridges |
| `created_at` not validated as ISO | Preserved opaque string if supplied |
| Loose body → payload | `{ "foo": 1 }` becomes `payload.foo`, not top-level envelope |

## Follow-ups

1. **Package 5** — Chat path demotion, phase 1: backend safety guard.
2. Stricter `created_at` validation if Core requires it.
3. Optional `validation_warnings` in Gateway response for defaulted fields.

## Next recommended package

**Package 5 — Chat path demotion, phase 1: backend safety guard**

Add backend guards so legacy chat/agent paths respect Console/Gateway reform without full UI demotion yet.

---

*End of Package 4 implementation note.*
