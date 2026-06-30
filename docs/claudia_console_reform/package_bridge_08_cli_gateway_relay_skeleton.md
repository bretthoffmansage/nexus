# Package Bridge 08 — Console Gateway CLI relay skeleton

| Field | Value |
|-------|-------|
| **Package** | Bridge 08 — Console Gateway CLI relay skeleton |
| **Date** | 2026-06-03 |
| **Repo** | `claudia_console` |

## Objective

Expose Claudia Core Hermes PTY sessions through the Console Gateway at `/api/claudia/v1/cli/sessions/*`, including SSE stream relay — without building the CLI Mirror UI yet.

## Bridge 05 preservation note

Simple Chat (`POST /messages`, `claudia_chat_bridge`) is unchanged. CLI relay is admin-gated and separate.

## Files changed

| File | Change |
|------|--------|
| `src/claudia_client.py` | CLI forward + `relay_cli_session_stream()` |
| `routes/claudia_routes.py` | `/api/claudia/v1/cli/sessions/*` routes |
| `tests/test_claudia_cli_relay.py` | **New** |
| `scripts/test_claudia_cli_relay.sh` | **New** manual smoke |
| `scripts/README.md` | Bridge 08 note |

## New Gateway endpoints

| Method | Gateway | Core |
|--------|---------|------|
| `GET` | `/api/claudia/v1/cli/sessions` | `GET /hermes/sessions` |
| `POST` | `/api/claudia/v1/cli/sessions` | `POST /hermes/sessions` |
| `GET` | `/api/claudia/v1/cli/sessions/{id}` | `GET /hermes/sessions/{id}` |
| `POST` | `/api/claudia/v1/cli/sessions/{id}/input` | `POST .../input` |
| `GET` | `/api/claudia/v1/cli/sessions/{id}/transcript` | `GET .../transcript` |
| `GET` | `/api/claudia/v1/cli/sessions/{id}/stream` | `GET .../stream` (SSE relay) |
| `POST` | `/api/claudia/v1/cli/sessions/{id}/stop` | `POST .../stop` |
| `POST` | `/api/claudia/v1/cli/sessions/{id}/interrupt` | `POST .../interrupt` |

## Core forwarding behavior

- Uses existing `httpx` client; forwards `X-Claudia-Gateway-Secret` when configured
- Never spawns Hermes locally; never calls `agent_loop`
- `core_not_configured` / `core_unreachable` / `core_timeout` envelope when Core unavailable

## SSE relay behavior

`relay_cli_session_stream()` opens Core stream with long read timeout and passes through raw SSE chunks (event names preserved). On Core errors, emits a single Gateway `event: error` JSON payload.

## Auth behavior

All CLI routes use `authorize_claudia_admin()` — requires authenticated admin session or API token with `claudia_admin` scope. Does not weaken existing auth.

## Tests / checks run

```bash
cd /Users/bretthoffman/Documents/Claudia/claudia_console
venv/bin/pytest -q tests/test_claudia_cli_relay.py
venv/bin/pytest -q tests/test_claudia_messages.py tests/test_claudia_chat_demotion.py
```

## Manual smoke commands

```bash
# Terminal 1
cd /Users/bretthoffman/Documents/Claudia/claudia_system
CLAUDIA_ENABLE_HERMES_PTY=true ./start-core-api.sh

# Terminal 2
cd /Users/bretthoffman/Documents/Claudia/claudia_console
CLAUDIA_CONSOLE_MODE=true CLAUDIA_CORE_URL=http://127.0.0.1:8080 ./start-macos.sh

# Terminal 3
cd /Users/bretthoffman/Documents/Claudia/claudia_console
./scripts/test_claudia_cli_relay.sh
```

With `AUTH_ENABLED=true`, set `CLAUDIA_GATEWAY_BEARER_TOKEN` with `claudia_admin` scope.

## Known limitations

- No UI — API/skeleton only
- Admin gate is coarse (no separate CLI Mirror role yet)
- Stream relay holds HTTP connection open; clients should stop sessions
- No structured transcript cards or mode toggle

## Next recommended package

**Bridge 09 — Console CLI Mirror UI shell**

- Simple Chat | CLI Mirror tab
- Styled operator transcript + raw drawer
- Session controls wired to these Gateway endpoints

---

*End of Bridge 08 Console note.*
