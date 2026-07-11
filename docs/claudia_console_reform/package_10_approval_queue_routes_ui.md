# Package 10 — Approval queue routes and UI placeholder

| Field | Value |
|-------|-------|
| **Package** | Package 10 — Approval queue routes and UI placeholder |
| **Date/time** | 2026-06-02 |
| **Repo path** | `/Users/bretthoffman/Documents/odysseus` |
| **Prior notes** | `package_00` … `package_09_console_dashboard_skeleton.md` |

## Objective

Add minimal Nexus Gateway approval list and human resolution forwarding. Core owns interpretation, audit, and execution; Gateway captures decision metadata and POSTs to Core only.

## Files changed

| File | Change |
|------|--------|
| `src/nexus_approvals.py` | **New** — `build_approval_resolution()`, decision validation |
| `src/nexus_scopes.py` | `authorize_nexus_admin()` |
| `src/nexus_client.py` | `_forward_get_to_core()`, `list_approvals()`, `resolve_approval()` |
| `routes/nexus_routes.py` | Refined `GET /approvals`, new `POST /approvals/{id}/resolve` |
| `static/js/nexusDashboard.js` | Approvals list + forward-resolution form |
| `static/style.css` | Approval form/list styles |
| `tests/test_nexus_approval_routes.py` | **New** |
| `tests/test_nexus_dashboard_skeleton.py` | Updated for allowed approval POST |
| `docs/console_reform/package_10_approval_queue_routes_ui.md` | **New** |

## Behavior changed

### `GET /api/nexus/v1/approvals`

- Auth: `nexus_read` (Bearer) or session.
- Core configured: `GET {NEXUS_CORE_URL}/approvals` passthrough when successful.
- Core unconfigured/unavailable: honest placeholder (`pending_count: 0`, empty list).

### `POST /api/nexus/v1/approvals/{approval_id}/resolve`

- Auth: `nexus_admin` (Bearer) or session.
- Validates `decision` ∈ `approved`, `rejected`, `needs_changes`, `cancelled`.
- `resolved_by` from `effective_user(request)` when available.
- Forwards JSON to `POST {NEXUS_CORE_URL}/approvals/{id}/resolve`.
- No local execution of approved action; no intake fallback.

### Dashboard

Approvals card shows queue status, item list (when Core returns data), and a minimal **Forward resolution** form calling only the Gateway resolve route.

## Behavior intentionally unchanged

- No connector/email/calendar/shell/MCP demotion.
- Other Gateway routes, chat bridge, upload bridge, Packages 1–9.
- No new token scopes.

## Routes added or changed

| Route | Change |
|-------|--------|
| `GET /api/nexus/v1/approvals` | **Changed** — Core passthrough or placeholder |
| `POST /api/nexus/v1/approvals/{approval_id}/resolve` | **New** |

## Approval route matrix

| Route | Purpose | Bearer scope | Session allowed? | Core target | Local execution? |
|-------|---------|--------------|------------------|-------------|------------------|
| **GET /api/nexus/v1/approvals** | List/read queue | `nexus_read` | Yes | `GET /approvals` or placeholder | **No** |
| **POST /api/nexus/v1/approvals/{id}/resolve** | Forward human decision | `nexus_admin` | Yes | `POST /approvals/{id}/resolve` | **No** |

## Approval safety matrix

| Action | Gateway behavior | Core responsibility | Local Odysseus execution? |
|--------|------------------|---------------------|---------------------------|
| **list approvals** | GET passthrough or placeholder | Canonical queue | **No** |
| **approve** | Forward `decision: approved` metadata | Interpret + execute if allowed | **No** |
| **reject** | Forward `decision: rejected` | Record + halt | **No** |
| **needs changes** | Forward `decision: needs_changes` | Route back to worker/human | **No** |
| **cancel** | Forward `decision: cancelled` | Cancel pending work | **No** |

## UI behavior

- Displays pending count, status message, and approval IDs when Core returns items.
- Empty state when no items.
- Manual resolve form: approval ID, decision select, optional reason → `POST /api/nexus/v1/approvals/{id}/resolve` only.
- Shows JSON result in `<pre>`; refreshes dashboard on success.
- Does not call legacy chat, tasks, shell, MCP, email, or calendar routes.

## Auth behavior

- List: `authorize_nexus_read` — `nexus_intake` alone is insufficient for Bearer.
- Resolve: `authorize_nexus_admin` — `nexus_read` alone cannot resolve for Bearer.
- Session-authenticated users may use both when `AUTH_ENABLED=true`.

## Core-unconfigured behavior

- **GET:** placeholder with `pending_count: 0`, explicit Core-not-configured message.
- **POST:** `status: core_not_configured`, `forwarded: false`; decision echoed in response; no local side effects.

## Core-unreachable behavior

- **GET:** placeholder after failed Core GET (no local queue fabrication).
- **POST:** `core_unreachable` / `core_timeout` / `core_error`; message states no local execution.

## Forwarding behavior

1. Validate resolution body (`src/nexus_approvals.py`).
2. Attach `resolved_by`, preserve `packet_id`, `trace_id`, `workspace`, `permissions`, `reason`.
3. `POST` to Core with `X-Nexus-Gateway-Secret` when set.
4. Return Gateway envelope + `approval_id`, `decision` in response.
5. **No** fallback to Odysseus agent, tools, or connectors.

## Safety guarantees

1. Routes only under `/api/nexus/v1`.
2. Resolution does not execute approved work locally.
3. Gateway is non-authoritative.
4. Honest placeholders when Core unavailable.
5. Dashboard avoids dangerous legacy execution routes.
6. Packages 1–9 tests remain passing.

## Frontend files changed

- `static/js/nexusDashboard.js`
- `static/style.css` (minimal)

## Tests / checks run

```bash
python3 -m compileall -q app.py core routes src
venv/bin/python -m pytest -q \
  tests/test_nexus_approval_routes.py \
  tests/test_nexus_dashboard_skeleton.py \
  tests/test_nexus_upload_processing_guards.py \
  tests/test_nexus_upload_bridge.py \
  tests/test_nexus_source_worker_routes.py \
  tests/test_nexus_messages.py \
  tests/test_nexus_chat_demotion.py \
  tests/test_nexus_gateway_routes.py \
  tests/test_nexus_token_scopes.py \
  tests/test_nexus_packets.py \
  tests/test_console_mode.py
grep -R "/api/shell\|/api/mcp\|/api/chat_stream\|/api/email/send\|/api/calendar\|/api/tasks" -n static/js/nexus* 2>/dev/null
```

**Results:** compileall pass; **100 passed**. Grep on `static/js/nexus*`: **no forbidden matches**.

## Known pytest baseline issue (Package 0)

Full-suite `pytest --collect-only` still has 2 pre-existing collection errors:

- `tests/test_chat_image_routing.py`
- `tests/test_webhook_ssrf_resilience.py`

## Risks

- Core may not implement `/approvals` or `/approvals/{id}/resolve` yet — Gateway returns error/placeholder honestly.
- Dashboard manual resolve is operator tooling, not a full approval inbox UX.
- Session users can resolve when logged in (same as other Gateway session auth).

## Follow-ups

- Package 11: connector demotion (email/calendar write safety).
- Richer approval cards when Core returns structured approval objects.
- Per-approval approve/reject buttons when list items include stable IDs from Core.

## Next recommended package

**Package 11 — Connector demotion pass 1: email/calendar write safety**
