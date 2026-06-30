# Bridge 09 — Console CLI Mirror UI Shell

| Field | Value |
|-------|-------|
| **Package** | Bridge 09 — Console CLI Mirror UI Shell |
| **Date** | 2026-06-02 |
| **Repo** | `claudia_console` |

## Objective

Build the first polished Claudia Console UI shell for **CLI Mirror Mode**, connecting to Bridge 08 Gateway CLI relay endpoints while preserving Simple Chat (Bridge 05) and the Odysseus-derived design language.

## Simple Chat vs CLI Mirror

| Mode | Path | Who runs Hermes |
|------|------|-----------------|
| **Simple Chat** | Console → Gateway → Core `POST /messages` → `hermes -z` | Core (one-shot) |
| **CLI Mirror** | Console → Gateway `/api/claudia/v1/cli/sessions/*` → Core PTY | Core (persistent PTY) |

- **Simple Chat** is the default operator experience for message packets.
- **CLI Mirror** is an admin/operator mode that mirrors a Core-owned Hermes CLI session.
- The Console **does not spawn Hermes** — it only relays through the Gateway.

## Files changed

| File | Change |
|------|--------|
| `static/js/claudiaCliMirrorHelpers.js` | **New** — sanitize text, event classification, error mapping, Gateway URLs |
| `static/js/claudiaCliMirror.js` | **New** — CLI Mirror panel, session controls, SSE, transcript rendering |
| `static/js/claudiaConsoleMode.js` | Wire `initClaudiaCliMirror()` after Console Mode UI |
| `static/style.css` | CLI Mirror panel styles (card-based, responsive) |
| `tests/test_claudia_cli_mirror_ui.py` | **New** — static/syntax/gateway checks |
| `docs/claudia_console_reform/package_bridge_09_console_cli_mirror_ui_shell.md` | **New** — this note |

## UI surfaces changed

- **Interaction mode toggle** (Console Mode only): `Simple Chat | CLI Mirror` in the chat input toolbar; persisted in `localStorage` key `claudia_console_interaction_mode`.
- **CLI Mirror panel** (injected into `#chat-container`):
  - Header with status chip (`not connected` / `ready` / `running` / `stopped` / `error` / `stream disconnected`)
  - Session controls: Start, Refresh/list, Stop, Interrupt, session ID + copy
  - Styled operator transcript (event cards)
  - Collapsible raw transcript drawer (hidden by default)
  - Input bar (Enter send, Shift+Enter newline)
  - Warning/error cards for degraded states

When CLI Mirror is active, the normal chat history and chat input bar are hidden; switching back to Simple Chat restores them unchanged.

## Gateway endpoints used (browser → Gateway only)

| Method | Gateway path |
|--------|----------------|
| `GET` | `/api/claudia/v1/cli/sessions` |
| `POST` | `/api/claudia/v1/cli/sessions` |
| `GET` | `/api/claudia/v1/cli/sessions/{id}/transcript` |
| `POST` | `/api/claudia/v1/cli/sessions/{id}/input` |
| `GET` | `/api/claudia/v1/cli/sessions/{id}/stream` (SSE via `EventSource`) |
| `POST` | `/api/claudia/v1/cli/sessions/{id}/stop` |
| `POST` | `/api/claudia/v1/cli/sessions/{id}/interrupt` |

No direct Core URL calls from the browser.

## Streaming behavior

- On active session, opens `EventSource` to `.../stream?after_seq={lastSeq}`.
- Handles SSE event types: `hermes_output`, `hermes_input`, `session_status`, `heartbeat`, `session_stopped`, `error`.
- Heartbeats are not rendered in the styled transcript.
- Closes stream on mode switch, stop, or unmount; limited reconnect with backoff on disconnect.
- Does not create duplicate streams (closes prior `EventSource` before reconnect).

## Degraded states

Styled cards (not raw JSON) for:

- Claudia Core not configured (`core_not_configured`)
- Core unreachable
- Admin/auth required (401/403)
- Hermes PTY disabled on Core (`pty_disabled`)
- No active session / session conflict (409)
- Unknown session (404)
- Stream disconnect (after reconnect exhaustion)
- Stop/interrupt failures

Backend admin gating is unchanged; the UI does not bypass it.

## Enable Core PTY

```bash
cd claudia_system
CLAUDIA_ENABLE_HERMES_PTY=true ./start-core-api.sh
```

Simple Chat Hermes one-shot remains separate:

```bash
CLAUDIA_ENABLE_HERMES_EXECUTION=true  # Bridge 05 Simple Chat only
```

## Start both services

**Terminal 1 — Core:**

```bash
cd claudia_system
CLAUDIA_ENABLE_HERMES_PTY=true ./start-core-api.sh
```

**Terminal 2 — Console:**

```bash
cd claudia_console
CLAUDIA_CONSOLE_MODE=true CLAUDIA_CORE_URL=http://127.0.0.1:8080 ./start-macos.sh
```

**Browser:** http://127.0.0.1:7860

## Manual smoke instructions

1. Log in as admin (or use auth-disabled local dev).
2. Open chat/command center — confirm **Claudia Console Mode** banner.
3. Switch **Simple Chat → CLI Mirror** via the new toggle.
4. Click **Start session** — status chip should show **Running**; session ID appears.
5. Send `/help` in the CLI Mirror input — Hermes output cards appear in the transcript; raw drawer optional.
6. Confirm live SSE updates (or refresh transcript if stream lagging).
7. Click **Stop session** — stopped card; input disabled.
8. Switch back to **Simple Chat** — normal chat input and history visible.
9. Send a Simple Chat message — Bridge 05 `/messages` path still works.

Optional script (Gateway relay, no UI):

```bash
cd claudia_console
./scripts/test_claudia_cli_relay.sh
```

## Tests/checks run

```bash
cd claudia_console
pytest tests/test_claudia_cli_mirror_ui.py tests/test_claudia_cli_relay.py tests/test_claudia_messages.py -q
node --check static/js/claudiaCliMirror.js static/js/claudiaCliMirrorHelpers.js
```

Checks include:

- Bridge 08 CLI relay tests still pass
- Simple Chat tests still pass
- No `agent_loop` in new JS modules
- Gateway-only paths in frontend (no Core URL)
- JS syntax validation
- CSS/markup presence

## Known limitations

- First shell only — no structured ANSI/TUI parser; output is sanitized text blocks.
- Single-session attach (refresh picks first running session).
- SSE uses cookie session auth only (no custom headers on `EventSource`).
- No session resume UX beyond refresh/list.
- Interrupt errors may vary by Core state.
- Mobile layout is functional but transcript polish deferred to Bridge 10.

## Next recommended package

**Bridge 10 — CLI Mirror Transcript Polish and Structured Event Cards**

- Collapse noisy ANSI/TUI frames
- Detect tool calls, errors, status lines
- Improve raw drawer and mobile view
- Session resume when Core supports it cleanly
