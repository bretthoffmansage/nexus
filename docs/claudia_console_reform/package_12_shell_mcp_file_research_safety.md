# Package 12 — Connector demotion pass 2: shell/MCP/file/research safety

| Field | Value |
|-------|-------|
| **Package** | Package 12 — Connector demotion pass 2: shell/MCP/file/research safety |
| **Date/time** | 2026-06-02 |
| **Repo path** | `/Users/bretthoffman/Documents/odysseus` |
| **Prior notes** | `package_00` … `package_11_connector_demotion_email_calendar.md` |

## Objective

When `CLAUDIA_CONSOLE_MODE=true`, block direct local execution: shell commands, MCP host connections, obvious document/workspace writes, and autonomous deep-research starts. Preserve read-only admin/config/status surfaces.

## Files changed

| File | Change |
|------|--------|
| `src/execution_console_guard.py` | **New** — `block_local_execution()`, `local_execution_disabled()`, `local_execution_disabled_sse()` |
| `routes/shell_routes.py` | Guards on `exec`, `stream`, `cookbook/packages/install` |
| `routes/mcp_routes.py` | Guards on `add_server`, `reconnect`, enable-toggle connect, OAuth connect |
| `routes/research_routes.py` | Guard on `POST /api/research/start` |
| `routes/document_routes.py` | Guards on create, update, delete document |
| `tests/test_claudia_execution_surface_guards.py` | **New** |
| `docs/claudia_console_reform/package_12_shell_mcp_file_research_safety.md` | **New** |

## Behavior changed

### Shell (`CLAUDIA_CONSOLE_MODE=true`)

Blocked before subprocess: `POST /api/shell/exec`, `POST /api/shell/stream`, `POST /api/cookbook/packages/install`.

- JSON routes return `status: local_execution_disabled`, `surface: shell`.
- Stream route returns SSE: `type: local_execution_disabled` + `[DONE]`.

### MCP (`CLAUDIA_CONSOLE_MODE=true`)

Blocked before `connect_server` / stdio spawn: `POST /api/mcp/servers`, `POST /api/mcp/servers/{id}/reconnect`, `PATCH /api/mcp/servers/{id}` when enabling, OAuth token exchange connect path.

Returns `surface: mcp`. No dedicated HTTP MCP `call_tool` route exists in this repo; agent-loop tool execution is out of scope for this package.

### Research (`CLAUDIA_CONSOLE_MODE=true`)

Blocked before `research_handler.start_research`: `POST /api/research/start`.

Returns `surface: research`.

### Documents (`CLAUDIA_CONSOLE_MODE=true`)

Blocked before DB writes: `POST /api/document`, `PUT /api/document/{doc_id}`, `DELETE /api/document/{doc_id}`.

Returns `surface: file`.

### Legacy mode

Unchanged when `CLAUDIA_CONSOLE_MODE` is off.

## Behavior intentionally unchanged

- Package 1–11 behavior (console kill switches, gateway, chat bridge, uploads, approvals, email/calendar write guards).
- Shell `GET /api/cookbook/packages` (read-only package probe listing).
- MCP `GET /servers`, `GET /tools`, `GET /servers/{id}/tools`, `PATCH /servers/{id}/tools` (disabled-tool metadata only).
- MCP `DELETE /servers/{id}` (config removal; no new host execution).
- MCP disable-only toggle (disconnect cleanup when turning off).
- Research read/history/status/stream/cancel/archive/delete/hide-image/spinoff routes (no new autonomous research job from guarded start).
- Document read/library/export/render routes.
- Chat, gateway packets, Ollama/model admin surfaces globally.
- `agent_loop.py`, `tool_execution.py`, `deep_research.py` internals (not deleted).

## Routes/surfaces reviewed

- `routes/shell_routes.py` — exec, stream, cookbook list/install
- `routes/mcp_routes.py` — all registered MCP admin routes
- `routes/research_routes.py` — all `/api/research/*` routes
- `routes/document_routes.py` — primary CRUD write paths (create, update, delete)
- `src/deep_research.py`, `src/mcp_manager.py`, `src/tool_execution.py` — classified; HTTP guards at route layer only

## Execution surface classification matrix

| Route or route pattern | Surface | Classification | Console Mode behavior | Local execution in Console Mode? |
|------------------------|---------|----------------|------------------------|----------------------------------|
| `POST /api/shell/exec` | shell | execution unsafe | blocked (`exec`) | **No** |
| `POST /api/shell/stream` | shell | execution unsafe | blocked SSE (`stream`) | **No** |
| `POST /api/cookbook/packages/install` | shell | execution unsafe (pip) | blocked (`cookbook_install`) | **No** |
| `GET /api/cookbook/packages` | shell | read/status | allowed | **No** |
| `GET /api/mcp/servers` | mcp | read/config | allowed | **No** |
| `GET /api/mcp/tools`, `GET /api/mcp/servers/{id}/tools` | mcp | read | allowed | **No** |
| `PATCH /api/mcp/servers/{id}/tools` | mcp | admin metadata | allowed | **No** |
| `POST /api/mcp/servers` | mcp | execution unsafe (stdio spawn) | blocked (`add_server`) | **No** |
| `POST /api/mcp/servers/{id}/reconnect` | mcp | execution unsafe | blocked (`reconnect`) | **No** |
| `PATCH /api/mcp/servers/{id}` (enable) | mcp | execution unsafe | blocked (`connect`) | **No** |
| `PATCH /api/mcp/servers/{id}` (disable) | mcp | admin disconnect | allowed | **No** |
| `DELETE /api/mcp/servers/{id}` | mcp | admin config | allowed | **No** |
| OAuth authorize/callback/exchange | mcp | mixed | authorize page allowed; connect blocked at exchange | **No** (connect) |
| HTTP MCP `call_tool` | mcp | n/a | no route in repo | **No** |
| `POST /api/research/start` | research | autonomous research unsafe | blocked (`start`) | **No** |
| `GET /api/research/active`, `status`, `library`, `detail`, `report` | research | read/history | allowed | **No** |
| `GET /api/research/stream/{id}` | research | progress read (SSE) | allowed | **No** |
| `POST /api/research/cancel`, archive, hide-image, delete | research | metadata/control | allowed | **No** |
| `POST /api/research/spinoff/{id}` | research | chat seed (no new research job) | allowed | **No** |
| `POST /api/document` | file | workspace/doc write | blocked (`create`) | **No** |
| `PUT /api/document/{doc_id}` | file | workspace/doc write | blocked (`update`) | **No** |
| `DELETE /api/document/{doc_id}` | file | workspace/doc write | blocked (`delete`) | **No** |
| `GET /api/documents/library`, `GET /api/document/{id}` | file | read | allowed | **No** |
| Other document routes (import-pdf, ai-tidy, restore, etc.) | file | needs deeper review | not guarded in P12 | legacy* |

\*Legacy document import/AI routes remain available in Console Mode; follow-up if full document demotion is required.

## Safe read/admin surfaces preserved

### Shell

- **Preserved:** `GET /api/cookbook/packages` — installed-package probes, no command execution.
- **Guarded:** `exec`, `stream`, `cookbook_install` — these run subprocesses or pip.

### MCP

- **Preserved:** server list, tool list, disabled-tool metadata patches, server delete, disable-only toggle.
- **Guarded:** add server, reconnect, enable-connect, OAuth connect — these spawn or attach MCP host processes that can run tools.

### Research

- **Preserved:** active list, status, library, detail, report HTML, progress stream, cancel, archive, delete, spinoff (reads existing artifacts; does not call `start_research`).
- **Guarded:** `start` only — launches `DeepResearcher` / model+tool loops locally.

### Documents

- **Preserved:** library listing, GET document, versions, render/export read paths.
- **Guarded:** create, update, delete — direct DB content mutation without Claudia Core.

Config/status/read surfaces do not invoke subprocesses, MCP sessions, or autonomous research; execution routes do.

## Console Mode blocked response behavior

JSON:

```json
{
  "ok": false,
  "success": false,
  "status": "local_execution_disabled",
  "claudia_console_mode": true,
  "surface": "shell|mcp|file|research",
  "operation": "...",
  "message": "Claudia Console Mode is active. Direct local execution is disabled. Route this request through Claudia Core worker/task governance.",
  "guidance": "..."
}
```

Shell stream SSE:

```
data: {"type":"local_execution_disabled", ...}
data: [DONE]
```

OAuth connect blocked returns HTML 403 with message (browser flow).

Auto packet creation on block: **not implemented** (follow-up).

## Local execution surfaces guarded

- Shell command execution and streaming
- Pip cookbook install
- MCP server add/reconnect/enable/OAuth-connect (host tool process attachment)
- Deep research panel start
- Document create/update/delete (primary CRUD writes)

## Research/autonomy status

- Panel/chat autonomous research **start** blocked at HTTP route.
- In-process `agent_loop` / `tool_execution` / chat-stream research triggers **not** demoted in P12 (Package 5 chat bridge demotes primary chat path; deeper agent/tool demotion is follow-up).
- Research history/read routes remain for Console UI.

## Safety guarantees

1. Guards activate only when `CLAUDIA_CONSOLE_MODE=true`.
2. Guards run before subprocess, `connect_server`, `start_research`, or document DB commits on guarded routes.
3. Responses are explicit and non-authoritative (do not claim Core executed work).
4. Legacy mode unchanged when flag is off.

## Tests/checks run

```bash
python3 -m compileall -q app.py core routes src
venv/bin/python -m pytest -q \
  tests/test_claudia_execution_surface_guards.py \
  tests/test_claudia_connector_email_calendar_guards.py \
  tests/test_claudia_approval_routes.py \
  tests/test_claudia_dashboard_skeleton.py \
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

## Results

- `compileall`: pass
- Focused Claudia package tests (P1–P12): **115 passed**
- New P12 tests: **8 passed** in `tests/test_claudia_execution_surface_guards.py`

## Known pytest baseline issue from Package 0

Collect-only may still report 2 pre-existing errors (not fixed in P12):

- `tests/test_chat_image_routing.py`
- `tests/test_webhook_ssrf_resilience.py`

## Risks

- Agent-loop and task-scheduler paths can still invoke MCP tools and research outside guarded HTTP routes.
- Document import/AI/tidy routes remain writable in Console Mode.
- OAuth authorize page still reachable (connect step blocked).

## Follow-ups

- Guard chat-stream / `trigger_research` / `tool_execution` in-process paths.
- Optional execution packet hints on blocked responses.
- Broader document route demotion if required.
- Package 13: memory, skills, model-routing demotion.

## Next recommended package

**Package 13 — Memory, skills, and model-routing demotion**
