# Package Bridge 08 — Console Gateway CLI relay skeleton

| Field | Value |
|-------|-------|
| **Package** | Bridge 08 — Console Gateway CLI relay skeleton |
| **Date** | 2026-06-03 |
| **Repo** | `console` |

## Objective

Expose Nexus Core Hermes PTY sessions through the Console Gateway at `/api/nexus/v1/cli/sessions/*`, including SSE stream relay — without building the CLI Mirror UI yet.

## Bridge 05 preservation note

Simple Chat (`POST /messages`, `nexus_chat_bridge`) is unchanged. CLI relay is admin-gated and separate.

## Files changed

| File | Change |
|------|--------|
| `src/nexus_client.py` | CLI forward + `relay_cli_session_stream()` |
| `routes/nexus_routes.py` | `/api/nexus/v1/cli/sessions/*` routes |
| `tests/test_nexus_cli_relay.py` | **New** |
| `scripts/test_nexus_cli_relay.sh` | **New** manual smoke |
| `scripts/README.md` | Bridge 08 note |

## New Gateway endpoints

| Method | Gateway | Core |
|--------|---------|------|
| `GET` | `/api/nexus/v1/cli/sessions` | `GET /hermes/sessions` |
| `POST` | `/api/nexus/v1/cli/sessions` | `POST /hermes/sessions` |
| `GET` | `/api/nexus/v1/cli/sessions/{id}` | `GET /hermes/sessions/{id}` |
| `POST` | `/api/nexus/v1/cli/sessions/{id}/input` | `POST .../input` |
| `GET` | `/api/nexus/v1/cli/sessions/{id}/transcript` | `GET .../transcript` |
| `GET` | `/api/nexus/v1/cli/sessions/{id}/stream` | `GET .../stream` (SSE relay) |
| `POST` | `/api/nexus/v1/cli/sessions/{id}/stop` | `POST .../stop` |
| `POST` | `/api/nexus/v1/cli/sessions/{id}/interrupt` | `POST .../interrupt` |

## Core forwarding behavior

- Uses existing `httpx` client; forwards `X-Nexus-Gateway-Secret` when configured
- Never spawns Hermes locally; never calls `agent_loop`
- `core_not_configured` / `core_unreachable` / `core_timeout` envelope when Core unavailable

## SSE relay behavior

`relay_cli_session_stream()` opens Core stream with long read timeout and passes through raw SSE chunks (event names preserved). On Core errors, emits a single Gateway `event: error` JSON payload.

## Auth behavior

All CLI routes use `authorize_nexus_admin()` — requires authenticated admin session or API token with `nexus_admin` scope. Does not weaken existing auth.

## Tests / checks run

```bash
cd /Users/bretthoffman/Documents/Nexus/console
venv/bin/pytest -q tests/test_nexus_cli_relay.py
venv/bin/pytest -q tests/test_nexus_messages.py tests/test_nexus_chat_demotion.py
```

## Manual smoke commands

```bash
# Terminal 1
cd /Users/bretthoffman/Documents/Nexus/system
NEXUS_ENABLE_HERMES_PTY=true ./start-core-api.sh

# Terminal 2
cd /Users/bretthoffman/Documents/Nexus/console
NEXUS_CONSOLE_MODE=true NEXUS_CORE_URL=http://127.0.0.1:8080 ./start-macos.sh

# Terminal 3
cd /Users/bretthoffman/Documents/Nexus/console
./scripts/test_nexus_cli_relay.sh
```

With `AUTH_ENABLED=true`, set `NEXUS_GATEWAY_BEARER_TOKEN` with `nexus_admin` scope.

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
