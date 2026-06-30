# Package Bridge 11B — CLI Mirror Mode Switch, Input Clarity, and Reattach Persistence

## Package name

Bridge 11B — CLI Mirror Mode Switch, Input Clarity, and Reattach Persistence

## Objective

Fix CLI Mirror usability before Bridge 12 session persistence/resume design:

- Keep **Simple Chat | CLI Mirror** visible in both modes
- Clarify session title vs Hermes input fields
- Reattach to Core-owned PTY sessions when switching modes, navigating away, or refreshing — without stopping the session

## Files changed

| File | Change |
|------|--------|
| `static/js/claudiaCliMirror.js` | Persistent top-bar mode toggle; sectioned UI; session reattach/resume; stream dedup guard |
| `static/js/claudiaCliMirrorHelpers.js` | Session ID + mode localStorage helpers |
| `static/style.css` | Top-bar toggle layout; session setup / transcript / Hermes input sections |
| `tests/test_claudia_cli_mirror_ui.py` | Bridge 11B static and helper tests |
| `docs/claudia_console_reform/package_bridge_11b_cli_mirror_mode_switch_input_clarity_reattach.md` | This note |

## Mode switch changes

- **Simple Chat | CLI Mirror** segmented control moved from `.chat-input-bar` (hidden in CLI Mirror) to **`.chat-top-bar`**, so it stays visible in both modes.
- Active mode uses existing `mode-toggle-btn active` styling and `aria-pressed`.
- Selected mode persists via `localStorage` key `claudia_console_interaction_mode` (unchanged from Bridge 09).

## Input clarity changes

Three visual sections in the CLI Mirror panel:

1. **Session setup** — session title field, helper text (“Used only to name…”), Start / Refresh / Stop / Ctrl+C, session list
2. **Live Hermes transcript** — polished cards + raw drawer
3. **Hermes input** — label “Send input to Hermes”, helper text, placeholder, Send button

Behavior:

- Session title input disabled once a session is attached/started; read-only **Active session title** line shown
- Bottom Hermes textarea disabled until a running session is attached
- Start session button grouped with setup; Send grouped with Hermes input

## Reattach/persistence behavior

### Switching Simple Chat ↔ CLI Mirror

- Leaving CLI Mirror: closes local `EventSource` only; **does not** call stop
- Persists last session ID to localStorage on attach/start/stop and when leaving CLI Mirror
- Returning to CLI Mirror: `_resumeCliMirror()` refreshes session list, fetches session metadata + transcript, reconnects stream if running

### Invalid / stopped sessions

- **404** on saved session ID → friendly “Previous session not found” alert, clears saved ID, offers refresh/attach
- **Stopped** session → shows stopped transcript; user can start a new session
- **Running session without local ID** → existing “Attach to running session” card (no auto-start)

### Tab / surface return

- `visibilitychange` and debounced `window.focus` call `_scheduleResumeCliMirror()` when CLI Mirror mode is active
- Re-fetches transcript and reconnects stream without duplicate EventSource if already connected to same session

### Browser refresh

- Restores interaction mode from localStorage
- On CLI Mirror init, `_resumeCliMirror()` attempts reattach to `claudia_console_cli_mirror_session_id`

### 409 conflict on start

- Shows conflict card with attach action; does **not** clear existing transcript

## LocalStorage keys used

| Key | Purpose |
|-----|---------|
| `claudia_console_interaction_mode` | `simple_chat` or `cli_mirror` |
| `claudia_console_cli_mirror_session_id` | Last attached/active CLI Mirror session ID |

## Tests/checks run

```bash
cd claudia_console
node --check static/js/claudiaCliMirror.js static/js/claudiaCliMirrorHelpers.js
pytest tests/test_claudia_cli_mirror_ui.py tests/test_claudia_cli_relay.py tests/test_claudia_messages.py -q
```

Bridge 11B tests cover:

- Mode toggle in chat top bar (visible in CLI Mirror)
- Switch-back control exists
- Mode + session ID localStorage helpers
- Session title and Hermes input labels/helper text
- Mode switch does not call stop
- Reattach/resume helpers and duplicate EventSource guard
- Gateway-only paths unchanged

## Manual smoke instructions

**Terminal 1 — Core:**

```bash
cd /Users/bretthoffman/Documents/Claudia/claudia_system
CLAUDIA_ENABLE_HERMES_PTY=true ./start-core-api.sh
```

**Terminal 2 — Console:**

```bash
cd /Users/bretthoffman/Documents/Claudia/claudia_console
CLAUDIA_CONSOLE_MODE=true CLAUDIA_CORE_URL=http://127.0.0.1:8080 ./start-macos.sh
```

**Browser:**

1. Open Console and log in as admin.
2. Confirm the **Simple Chat | CLI Mirror** switch is visible in the chat top bar.
3. Switch to CLI Mirror.
4. Confirm you can switch back to Simple Chat from the same top-bar control.
5. Confirm the upper field is labeled **Session title** with setup helper text.
6. Confirm the bottom field is labeled **Send input to Hermes** with Hermes helper text.
7. Start a session.
8. Send `/help`.
9. Switch back to Simple Chat — confirm chat still works.
10. Switch back to CLI Mirror — confirm same session/transcript returns and stream reconnects.
11. Navigate to another Console tab/surface and back — confirm CLI Mirror does not reset unnecessarily.
12. Refresh the browser — confirm reattach or friendly attach option.
13. Stop the session.

## Known limitations

- In-app modal navigation (e.g. settings overlay) may not trigger `visibilitychange`; debounced `focus` helps but is not perfect for every surface.
- Full transcript reload on resume may briefly flicker while re-rendering cards.
- Hermes native resume / multi-tab session sync deferred to Bridge 12.
- Session title rename after start is not supported (read-only display only).

## Next recommended package

**Bridge 12 — CLI Mirror Session Persistence and Resume Design**
