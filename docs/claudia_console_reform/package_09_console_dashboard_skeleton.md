# Package 9 — Console dashboard skeleton

| Field | Value |
|-------|-------|
| **Package** | Package 9 — Console dashboard skeleton |
| **Date/time** | 2026-06-02 |
| **Repo path** | `/Users/bretthoffman/Documents/odysseus` |
| **Prior notes** | `package_00` … `package_08b_upload_processing_guards.md` |

## Objective

Add a read-only legacy local console dashboard using existing Odysseus UI patterns (sidebar tool + modal). Display Gateway/Core status and honest placeholders for packets, workers, Tool Factory, Housekeeping, connectors, and approvals—without executing work or requiring Nexus Core.

## Files changed

| File | Change |
|------|--------|
| `src/nexus_client.py` | `gateway_read_placeholder()` |
| `routes/nexus_routes.py` | `GET /workers`, `/tools`, `/connectors`, `/housekeeping`, `/approvals` |
| `static/js/nexusDashboard.js` | **New** — read-only dashboard module |
| `static/index.html` | Sidebar **legacy local console** button |
| `static/app.js` | Import `nexusDashboard.js` + click handler |
| `static/style.css` | Minimal `.nexus-dash-*` styles |
| `tests/test_nexus_dashboard_skeleton.py` | **New** |
| `docs/console_reform/package_09_console_dashboard_skeleton.md` | **New** |

## Behavior changed

### Backend

Five new **read-only** Gateway GET routes return `status: placeholder`, `read_only: true`, empty `items[]`. Auth: `nexus_read` (Bearer) or session when `AUTH_ENABLED=true`.

### Frontend

Sidebar **legacy local console** opens a draggable modal that fetches only `/api/nexus/v1/*` GET endpoints (health, packets, placeholders). Auto-refresh every 60s while open. No POST/write actions.

## Behavior intentionally unchanged

- Login page, global branding, legacy chat/tasks/calendar tools.
- Package 1–8B Gateway, chat bridge, upload bridge, processing guards.
- `GET /health` remains unauthenticated.
- No approval resolution POST (Package 10).

## Dashboard modules/cards added

1. Gateway status  
2. Core status (from health)  
3. Task packets (from `/packets`)  
4. Packet persistence (from `/packets`)  
5. Pending approvals (placeholder)  
6. Worker outputs (static note + workers placeholder)  
7. Workers (placeholder)  
8. Nexus Tool Factory (placeholder)  
9. Housekeeping (placeholder)  
10. Connectors (placeholder)  

## Dashboard module matrix

| Module/Card | Data source | Current behavior | Writes? | Local execution? |
|-------------|-------------|------------------|---------|------------------|
| Gateway status | `GET /api/nexus/v1/health` | Live Gateway envelope | **No** | **No** |
| Core status | `GET /api/nexus/v1/health` | `core_configured` / `forwarded` flags | **No** | **No** |
| Task packets | `GET /api/nexus/v1/packets` | Placeholder list (`persistence_not_implemented`) | **No** | **No** |
| Packet persistence | `GET /api/nexus/v1/packets` | Honest non-persistent status | **No** | **No** |
| Approvals | `GET /api/nexus/v1/approvals` | Placeholder (`pending_count: 0`) | **No** | **No** |
| Worker outputs | Static copy + workers placeholder | Not implemented | **No** | **No** |
| Workers | `GET /api/nexus/v1/workers` | Placeholder | **No** | **No** |
| Tool Factory | `GET /api/nexus/v1/tools` | Placeholder | **No** | **No** |
| Housekeeping | `GET /api/nexus/v1/housekeeping` | Placeholder | **No** | **No** |
| Connectors | `GET /api/nexus/v1/connectors` | Placeholder | **No** | **No** |

## Routes added or reused

| Route | Purpose | Auth | Placeholder or live? | Local execution? |
|-------|---------|------|----------------------|------------------|
| `GET /api/nexus/v1/health` | Gateway + Core probe | None | **Live** status | **No** |
| `GET /api/nexus/v1/packets` | Packet list honesty | `nexus_read` / session | Placeholder | **No** |
| `GET /api/nexus/v1/workers` | Worker registry | `nexus_read` / session | Placeholder | **No** |
| `GET /api/nexus/v1/tools` | Tool Factory | `nexus_read` / session | Placeholder | **No** |
| `GET /api/nexus/v1/connectors` | Connectors | `nexus_read` / session | Placeholder | **No** |
| `GET /api/nexus/v1/housekeeping` | Housekeeping | `nexus_read` / session | Placeholder | **No** |
| `GET /api/nexus/v1/approvals` | Approval queue read | `nexus_read` / session | Placeholder | **No** |

## Auth behavior

Dashboard browser fetches use `credentials: 'same-origin'` (session cookie). Bearer tokens are not embedded in the frontend. Placeholder routes follow Package 3 `authorize_nexus_read`; health remains public.

## Placeholder behavior

All new surfaces return `ok: true`, `status: placeholder`, explicit `message`, `read_only: true`, `items: []`. They do not claim Gateway is canonical for workers/tools/approvals.

## Safety guarantees

1. Dashboard is read-only (GET only in JS).  
2. No `stream_agent_loop`, shell, MCP, email, calendar, chat stream, or task run calls from dashboard code.  
3. No Nexus Core required for UI to load.  
4. Honest non-canonical placeholders.  
5. Packages 1–8B tests remain passing.

## Frontend files changed

- `static/js/nexusDashboard.js` (new)  
- `static/index.html` (sidebar button)  
- `static/app.js` (module import + click handler)  
- `static/style.css` (dashboard layout)

## Tests / checks run

```bash
python3 -m compileall -q app.py core routes src
venv/bin/python -m pytest -q \
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
grep -R "/api/shell\|/api/mcp\|/api/chat_stream\|/api/email/send\|/api/calendar" -n static/js/nexus* static/index.html
```

**Results:** compileall pass; **91 passed**. Grep on `static/js/nexus*`: **no matches** for forbidden legacy execution routes (`/api/chat_stream`, shell, MCP, email send, calendar).

## Known pytest baseline issue (Package 0)

Full-suite `pytest --collect-only` still has 2 pre-existing collection errors:

- `tests/test_chat_image_routing.py`
- `tests/test_webhook_ssrf_resilience.py`

## Risks

- When `AUTH_ENABLED=true`, placeholder GETs return 403 for unauthenticated users; health still works but packet/approval cards may show load errors until logged in.
- Dashboard does not indicate `NEXUS_CONSOLE_MODE` env server-side (display-only regardless).

## Follow-ups

- Package 10: approval queue routes + UI actions (still read-first).
- Core passthrough when Nexus Core exposes live worker/connector/housekeeping APIs.
- Optional: show `NEXUS_CONSOLE_MODE` banner from a small config endpoint.

## Next recommended package

**Package 10 — Approval queue routes and UI placeholder**
