# Bridge 11 — CLI Mirror Session Resume and Operator Controls

| Field | Value |
|-------|-------|
| **Package** | Bridge 11 — CLI Mirror Session Resume and Operator Controls |
| **Date** | 2026-06-02 |
| **Repo** | `console` (+ Core metadata in `system`) |

## Objective

Improve CLI Mirror session management so operator sessions are safer, easier to attach/resume, clearer to stop/interrupt, and more understandable — without changing Simple Chat or Gateway architecture.

## Files changed

| File | Change |
|------|--------|
| `static/js/nexusCliMirrorHelpers.js` | Session list meta, time formatting, conflict mapping, attach helpers |
| `static/js/nexusCliMirror.js` | Operator warning, attach offer, session list polish, no auto-attach, stop/interrupt UX |
| `static/style.css` | Operator warning, attach offer, session row, title input styles |
| `tests/test_nexus_cli_mirror_ui.py` | Bridge 11 static/JS checks |
| `scripts/README.md` | Bridge 11 reference |

Core companion: `system` Bridge 11 (`bridge_11_core_cli_session_controls.md`).

## UI controls changed

- **Operator Mode warning** banner (polished, non-blocking)
- **Session title** input before Start
- **Attach to running session** offer banner (no automatic attach on refresh)
- **Session list** shows title, phase/status chip, started/last active, truncated ID
- **Attach** for running sessions; **View transcript** for stopped sessions
- **Send Ctrl+C** label with confirm dialog (Interrupt ≠ Stop)
- Stop/interrupt/start disabled states tied to running session + `can_start_new`
- 409 conflict card with **Attach to running session** action button

## Session list/attach behavior

- Refresh loads Gateway list metadata: `active_session_id`, `can_start_new`, `attachable_session_ids`, `cleanup_policy`
- Does **not** auto-attach — operator must click Attach or the attach offer
- Note: “Core currently supports one active CLI Mirror session.”
- Switching away and back to CLI Mirror refreshes list; operator can re-attach manually

## Stop/interrupt UX

| Control | Behavior |
|---------|----------|
| **Stop session** | Ends Core PTY; disables input; shows stopped card |
| **Send Ctrl+C** | Confirms first; sends interrupt; session stays running |
| Already stopped | Stop safe; interrupt shows not-running notice |

## Operator warning

> CLI Mirror mirrors a live Hermes session owned by Nexus Core. Commands may trigger tools, file operations, or external actions depending on Hermes configuration.

Labels consistently use **Operator Mode**, **CLI Mirror**, and **admin/operator access**.

## Tests/checks run

```bash
cd console
node --check static/js/nexusCliMirror.js static/js/nexusCliMirrorHelpers.js
pytest tests/test_nexus_cli_mirror_ui.py tests/test_nexus_cli_relay.py tests/test_nexus_messages.py -q
```

## Manual smoke instructions

**Terminal 1 — Core:**

```bash
cd /Users/bretthoffman/Documents/Nexus/system
NEXUS_ENABLE_HERMES_PTY=true ./start-core-api.sh
```

**Terminal 2 — Console:**

```bash
cd /Users/bretthoffman/Documents/Nexus/console
NEXUS_CONSOLE_MODE=true NEXUS_CORE_URL=http://127.0.0.1:8080 ./start-macos.sh
```

**Browser:**

1. Open http://127.0.0.1:7860 — log in as admin
2. Switch to **CLI Mirror** — confirm Operator Mode warning
3. **Refresh sessions**
4. Enter a session title → **Start session**
5. Send `/help`
6. Switch to Simple Chat, then back to CLI Mirror
7. **Refresh sessions** → **Attach to running session** (not auto-attached)
8. **Send Ctrl+C** (confirm) if safe
9. **Stop session** — input disabled, stopped status
10. Switch to **Simple Chat** — confirm messages still work

## Known limitations

- No Hermes native resume (`resume_supported: false` on Core)
- Single active PTY session (unchanged)
- Attach = reconnect to existing session ID + stream/transcript (not PTY respawn)
- Idle cleanup enforced on Core only when env timeout is set

## Next recommended package

**Bridge 12 — CLI Mirror Session Persistence and Resume Design** (Hermes resume feasibility, session registry/history, transcript pagination, idle enforcement UX).
