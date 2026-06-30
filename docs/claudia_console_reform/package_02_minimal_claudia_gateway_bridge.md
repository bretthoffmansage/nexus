# Package 2 — Minimal Claudia Gateway bridge

| Field | Value |
|-------|-------|
| **Package** | Package 2 — Minimal Claudia Gateway bridge |
| **Date/time** | 2026-06-02 |
| **Repo path** | `/Users/bretthoffman/Documents/odysseus` |
| **Prior notes** | `package_00_baseline_repo_state.md`, `package_01_console_mode_flags.md` |

## Objective

Add a minimal, **non-authoritative** Claudia Gateway namespace at `/api/claudia/v1` with `GET /health` and `POST /intake`. Forward to Claudia Core when `CLAUDIA_CORE_URL` is set; otherwise return safe, non-executing responses. No Odysseus agent loop, tasks, tools, or local model execution on these paths.

## Files changed

| File | Change |
|------|--------|
| `src/claudia_client.py` | **New** — env config, httpx forward/probe, response envelope |
| `routes/claudia_routes.py` | **New** — Gateway routes |
| `app.py` | Register Claudia router; auth exempt for `GET /api/claudia/v1/health` |
| `.env.example` | `CLAUDIA_CORE_URL`, `CLAUDIA_GATEWAY_SHARED_SECRET` |
| `tests/test_claudia_gateway_routes.py` | **New** — health/intake/forwarding/static-import safety tests |
| `docs/claudia_console_reform/package_02_minimal_claudia_gateway_bridge.md` | **New** — this note |

## Behavior changed

- New routes under `/api/claudia/v1` (see below).
- `GET /api/claudia/v1/health` added to `AUTH_EXEMPT_EXACT` (same pattern as `/api/health`).
- Startup log: `Claudia Gateway routes initialized (/api/claudia/v1)`.

## Behavior intentionally unchanged

- `/api/chat`, `/api/chat_stream`, sessions, auth model, login UI, branding
- Package 1 `CLAUDIA_CONSOLE_MODE` startup gates
- Ollama/local model support (Cookbook, settings, `llm_core`)
- All legacy Odysseus routes and autonomous runtimes (unchanged; not invoked by Gateway)

## New routes added

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/claudia/v1/health` | Gateway liveness; optional probe of `{CLAUDIA_CORE_URL}/health` |
| `POST` | `/api/claudia/v1/intake` | Accept JSON object packet; forward to `{CLAUDIA_CORE_URL}/intake` when configured |

Route prefix is exactly `/api/claudia/v1`.

## New env vars / config

| Variable | Purpose |
|----------|---------|
| `CLAUDIA_CORE_URL` | Base URL for Claudia Core (no trailing slash required). Unset = Core not configured. |
| `CLAUDIA_GATEWAY_SHARED_SECRET` | Optional; sent as `X-Claudia-Gateway-Secret` on forward/probe requests. Never logged. |

HTTP timeout for Core calls: **5 seconds** (`httpx.AsyncClient`, `trust_env=False`).

## Auth behavior

| Route | Auth |
|-------|------|
| `GET /api/claudia/v1/health` | **Exempt** from session auth when `AUTH_ENABLED` (listed in `AUTH_EXEMPT_EXACT`, mirrors `/api/health`) |
| `POST /api/claudia/v1/intake` | **Not exempt** — subject to normal `AuthMiddleware` when auth is enabled (same as most `/api/*` routes). Intake does not execute work locally; forwarding is the only side effect when Core is configured. |

No Clerk, no new API token scopes (Package 3).

## Core-unconfigured behavior

**`GET /api/claudia/v1/health`**

- `ok: true`, `status: gateway_ok`, `core_configured: false`, `forwarded: false`
- Message indicates Gateway operational, Core not configured

**`POST /api/claudia/v1/intake`**

- HTTP 200 with `ok: false`, `status: core_not_configured`, `forwarded: false`
- Preserves `packet_id` / `trace_id` from body when present; generates `trace_id` if missing
- **Does not** execute agent, tasks, tools, or local models

## Core-unreachable behavior

When `CLAUDIA_CORE_URL` is set but Core does not respond:

| Case | `status` | `forwarded` | Local execution |
|------|----------|-------------|-----------------|
| Connection error | `core_unreachable` | `false` | None |
| Timeout | `core_timeout` | `false` | None |
| HTTP 4xx/5xx on intake | `core_error` | `true` (request was sent) | None |

Health probe: Gateway remains `ok: true` / `gateway_ok` with `core_configured: true`, `forwarded: false`, and `core_status` describing the failure (e.g. `core_unreachable`).

## Forwarding behavior

When `CLAUDIA_CORE_URL` is set:

- Health: `GET {base}/health`
- Intake: `POST {base}/intake` with original JSON body
- Optional header: `X-Claudia-Gateway-Secret: <CLAUDIA_GATEWAY_SHARED_SECRET>`
- Success: Gateway envelope with `forwarded: true`, `status: forwarded`, `core` containing Core JSON body
- **No fallback** to Odysseus chat/agent if Core fails

## Safety guarantees

The Claudia Gateway bridge is **intake/routing only** and **non-authoritative**:

- `src/claudia_client.py` and `routes/claudia_routes.py` do **not** import `agent_loop`, `task_scheduler`, MCP, shell, email, calendar, memory, skills, or research modules
- No calls to `stream_agent_loop` (verified by tests and AST import scan)
- No background tasks started from Gateway code
- No canonical decisions, workspace writes, or connector execution
- Safe when `CLAUDIA_CONSOLE_MODE` is off or on (Gateway safety does not depend on Console Mode)
- Ollama/local models are not invoked by Gateway routes

## Response envelope (minimum)

Gateway responses include:

`ok`, `status`, `message`, `packet_id`, `trace_id`, `core_configured`, `forwarded`

Optional: `core_status`, `core` (Core JSON body on forward/probe).

## Tests / checks run

| Check | Result |
|-------|--------|
| `python3 -m compileall -q app.py core routes src` | **Pass** |
| `pytest -q tests/test_claudia_gateway_routes.py` | **Pass** (7 tests) |
| `pytest -q tests/test_claudia_console_mode.py` | **Pass** (17 tests; Package 1 regression) |
| Full pytest suite | **Not run** |

### Known pytest baseline (Package 0)

Pre-existing `pytest --collect-only` errors (unchanged):

- `tests/test_chat_image_routing.py`
- `tests/test_webhook_ssrf_resilience.py`

## Risks

| Risk | Note |
|------|------|
| Intake auth not scoped | Package 3 will add machine token scopes; until then intake follows session auth |
| Unauthenticated health | Mirrors `/api/health`; exposes Gateway/Core reachability only |
| No packet validation | Package 4 will add envelope normalization |
| Core contract drift | Assumes Core exposes `GET /health` and `POST /intake` at base URL |

## Follow-ups

1. **Package 3** — Claudia machine token scopes for Gateway/intake callers
2. **Package 4** — Full packet envelope normalization
3. Additional Gateway routes: `/messages`, `/source-packets`, `/worker-outputs`, `/tasks`, `/events`, `/approvals`
4. Chat path demotion (separate package)

## Next recommended package

**Package 3 — Claudia machine token scopes**

Add scoped API tokens for Gateway and automation callers without broadening session auth or executing work locally.

---

*End of Package 2 implementation note.*
