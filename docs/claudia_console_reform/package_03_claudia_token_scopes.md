# Package 3 — Claudia machine token scopes

| Field | Value |
|-------|-------|
| **Package** | Package 3 — Claudia machine token scopes |
| **Date/time** | 2026-06-02 |
| **Repo path** | `/Users/bretthoffman/Documents/odysseus` |
| **Prior notes** | `package_00` … `package_02_minimal_claudia_gateway_bridge.md` |

## Objective

Extend existing Odysseus API token scopes with Claudia Gateway machine scopes so clients (claudiactl, bridges, workers) can call Gateway intake without inheriting legacy chat, shell, MCP, or admin authority.

## Files changed

| File | Change |
|------|--------|
| `src/claudia_scopes.py` | **New** — scope constants, validation, `authorize_claudia_intake`, `require_legacy_chat_api_token` |
| `routes/claudia_routes.py` | `authorize_claudia_intake` on `POST /intake` |
| `routes/api_token_routes.py` | Optional `scopes` on token create; validate against known scopes |
| `routes/webhook_routes.py` | `POST /api/v1/chat` uses centralized `require_legacy_chat_api_token` |
| `.env.example` | Document Claudia API token scopes |
| `tests/test_claudia_token_scopes.py` | **New** — scope and intake auth tests |
| `tests/test_claudia_gateway_routes.py` | Set `AUTH_ENABLED=false` on intake tests without auth middleware |
| `docs/claudia_console_reform/package_03_claudia_token_scopes.md` | **New** — this note |

## Behavior changed

- **`POST /api/claudia/v1/intake`**
  - Bearer API token: requires `claudia_intake` scope (403 otherwise).
  - Browser/session: still allowed when authenticated (same as Package 2).
  - `AUTH_ENABLED=false`: intake allowed without scopes (operator-disabled auth).
- **`POST /api/tokens`**: optional `scopes` form field (comma-separated); validated; default remains `chat`.
- **`POST /api/v1/chat`**: scope check centralized in `require_legacy_chat_api_token` (still requires `chat`, not Claudia scopes).

## Behavior intentionally unchanged

- `GET /api/claudia/v1/health` — still auth-exempt (Package 2).
- Default new tokens from admin UI still `chat` only (UI unchanged).
- Chat stream routes (`/api/chat`, `/api/chat_stream`), Package 1 Console Mode, Gateway forward-only behavior, Ollama/local models, built-in auth.

## New scopes added / supported

| Scope | Constant |
|-------|----------|
| `claudia_intake` | `SCOPE_CLAUDIA_INTAKE` |
| `claudia_worker` | `SCOPE_CLAUDIA_WORKER` |
| `claudia_read` | `SCOPE_CLAUDIA_READ` |
| `claudia_admin` | `SCOPE_CLAUDIA_ADMIN` |

Legacy (unchanged): `chat`, `research`.

## Scope matrix

| Scope | Intended caller | Allowed now | Reserved / future | Explicitly not allowed |
|-------|-----------------|-------------|-------------------|------------------------|
| **claudia_intake** | claudiactl, messaging bridges, automation submitters | `POST /api/claudia/v1/intake` (Bearer + scope) | Full packet envelope (Pkg 4) | Legacy `POST /api/v1/chat`, shell, MCP, tasks, email, memory/skills write, agent loop |
| **claudia_worker** | Codex/worker output submitters | Recognized on token create | `POST /api/claudia/v1/worker-output` (not built yet) | Same as intake + local execution |
| **claudia_read** | Monitoring, status clients | Recognized on token create; helper `authorize_claudia_read` for future GET routes | Token-scoped Gateway reads | Admin wipe, shell, chat agent |
| **claudia_admin** | Future Gateway admin ops | Recognized on token create only | Gateway admin routes | Legacy Odysseus admin, shell, MCP, task runner |
| **chat** (legacy) | Companion, sync chat integrations | `POST /api/v1/chat` and existing chat-scoped behavior | — | Claudia intake unless also `claudia_intake` |
| **research** (legacy) | Documented in token list tests | Stored on tokens | Route-specific checks if any | Claudia intake, shell, admin |

## Auth behavior

### `POST /api/claudia/v1/intake`

| Caller | Requirement |
|--------|-------------|
| Bearer `ody_*` token | `claudia_intake` in `api_token_scopes` |
| Session cookie (logged-in user) | Valid session via `get_current_user` / `require_user` |
| `AUTH_ENABLED=false` | Allowed (no scope check) |
| Unauthenticated | 401 when auth configured |

### `GET /api/claudia/v1/health`

- Unauthenticated (listed in `AUTH_EXEMPT_EXACT` in `app.py`).
- `claudia_read` is **not** required for health in this package; reserved for future token-gated GET routes.

## Safety guarantees

- Claudia scopes are **additive**; default token creation remains `chat`.
- `claudia_intake` does **not** imply `chat` — verified by tests and `require_legacy_chat_api_token`.
- Gateway routes still do not call `stream_agent_loop`, task scheduler, MCP, shell, or local models.
- No broad admin grant from Claudia scopes.
- Safety does **not** depend on `CLAUDIA_CONSOLE_MODE`.

## Tests / checks run

| Check | Result |
|-------|--------|
| `python3 -m compileall -q app.py core routes src` | **Pass** |
| `pytest -q tests/test_claudia_token_scopes.py` | **Pass** (9 tests) |
| `pytest -q tests/test_claudia_gateway_routes.py` | **Pass** (7 tests) |
| `pytest -q tests/test_claudia_console_mode.py` | **Pass** (17 tests) |
| `pytest -q tests/test_api_token_routes.py` | **Pass** (5 tests) |
| Full pytest suite | **Not run** |

### Known pytest baseline (Package 0)

Pre-existing collect-only errors (unchanged):

- `tests/test_chat_image_routing.py`
- `tests/test_webhook_ssrf_resilience.py`

## Risks

| Risk | Note |
|------|------|
| Admin UI still mints `chat`-only tokens | Operators must pass `scopes=claudia_intake` via API/form for machine clients |
| Session users can post intake | Intentional for logged-in console; not a machine-only surface yet |
| `claudia_admin` reserved | Must not be wired to legacy admin routes in future packages |

## Follow-ups

1. **Package 4** — Packet envelope normalization and route preservation.
2. Admin UI optional scope picker (minimal) for `claudia_intake` tokens.
3. Wire `claudia_worker` when `POST /api/claudia/v1/worker-output` exists.
4. Optional token-scoped `GET` routes using `authorize_claudia_read`.

## Next recommended package

**Package 4 — Packet envelope normalization and route preservation**

Normalize intake packets into a stable envelope while keeping Gateway non-authoritative and preserving existing route behavior.

---

*End of Package 3 implementation note.*
