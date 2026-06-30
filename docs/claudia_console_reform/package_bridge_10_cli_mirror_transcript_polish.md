# Bridge 10 — CLI Mirror Transcript Polish and Structured Event Cards

| Field | Value |
|-------|-------|
| **Package** | Bridge 10 — CLI Mirror Transcript Polish and Structured Event Cards |
| **Date** | 2026-06-02 |
| **Repo** | `claudia_console` |

## Objective

Improve the CLI Mirror operator transcript so Hermes PTY output is easier to read inside the polished Claudia Console UI — without changing backend architecture or Simple Chat.

## Files changed

| File | Change |
|------|--------|
| `static/js/claudiaCliMirrorHelpers.js` | Classification heuristics, ANSI/noise cleanup, dedup helpers, raw drawer formatting, improved error cards |
| `static/js/claudiaCliMirror.js` | Dedup rendering, session list/attach UI, raw copy, actionable alerts, card metadata (time/seq) |
| `static/style.css` | Structured card styles, session list, raw drawer toolbar, mobile refinements |
| `tests/test_claudia_cli_mirror_ui.py` | Bridge 10 Node-eval tests + CSS/static checks |
| `docs/claudia_console_reform/package_bridge_10_cli_mirror_transcript_polish.md` | This note |

## Classification/cleanup logic added

**Display categories:** `user_input`, `slash_command`, `command`, `hermes_output`, `tool_like`, `shell_like`, `final_like`, `status`, `warning`, `error`, `stopped`, `heartbeat`, `raw_noise`.

**Heuristics (lightweight):**

- Input starting with `/` → `slash_command`
- `$`, `>`, `#` prefixes → `command`
- Error/traceback/401/403 patterns → `error`
- Warning/deprecated → `warning`
- Tool-ish verbs (running, executing, changed files, tests) → `tool_like`
- Shell stack traces / prompts → `shell_like`
- Long prose-like replies → `final_like`
- Empty, ANSI-only, spinner/TUI frames → `raw_noise` (hidden from main transcript)

**Cleanup:**

- Extended ANSI stripping (CSI + OSC sequences)
- Control character neutralization
- `normalizeForDedup` + `shouldCollapseDuplicate` for repeated identical output
- Collapsed repeats show “Repeated N× (collapsed)” on the last card
- Secret pattern redaction in styled text (`sk-…`, gateway secret literals)

## UI/card styles added

New card variants using existing panel/chat tokens:

- `-input`, `-slash`, `-command` — operator input
- `-output`, `-final` — Hermes assistant text
- `-tool`, `-shell` — activity/output patterns
- `-status`, `-warning`, `-error`, `-stopped` — lifecycle and faults

Cards show label, optional local time, and `#seq` when present.

## Raw drawer changes

- Summary clarifies **debug only — collapsed by default**
- Lines include `ts`, `#seq`, event name, and raw text
- **Copy raw** button copies drawer content (redacted)
- Raw drawer is not deduplicated — full debug trail preserved

## Mobile/responsive changes

- Shorter transcript max-height on small screens
- Wrapped control buttons (2-column)
- Stacked input bar + full-width Send
- Truncated session ID with copy
- Compact session list height

## Session list polish (Gateway-only)

- Refresh populates a session list with running/stopped chips
- **Attach** on running sessions (no Core resume added)
- Empty state: “No CLI Mirror session yet.”
- Note when Core supports one active PTY session

## Degraded states polish

`mapApiError` now includes actionable **action** hints for:

- Admin required
- Core not configured / unreachable
- PTY disabled (with `CLAUDIA_ENABLE_HERMES_PTY=true` guidance)
- Session conflict / unknown session
- Stream disconnected
- Stop/interrupt failures

## Tests/checks run

```bash
cd claudia_console
node --check static/js/claudiaCliMirror.js static/js/claudiaCliMirrorHelpers.js
pytest tests/test_claudia_cli_mirror_ui.py tests/test_claudia_cli_relay.py tests/test_claudia_messages.py -q
```

Bridge 10 adds Node-eval tests for ANSI stripping, heartbeat hiding, error/warning/slash classification, noise hiding, dedup, and raw line formatting.

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

1. Open http://127.0.0.1:7860 and log in as admin
2. Switch to **CLI Mirror**
3. **Start session** (or **Refresh sessions** → **Attach**)
4. Send `/help` — confirm readable cards, not ANSI/spinner flood
5. Open **Raw transcript** — confirm seq/ts/event detail; try **Copy raw**
6. Send a short normal input if credentials are configured
7. **Stop session**
8. Switch to **Simple Chat** — confirm messages still work

## Known limitations

- Heuristic classifier only — not a full Hermes/TUI parser
- `final_like` detection is best-effort
- Dedup may collapse legitimate repeated identical lines
- SSE still cookie-auth only
- No Core-side resume — attach uses existing Gateway list API
- Not xterm.js — styled cards remain the primary surface

## Next recommended package

**Bridge 11 — CLI Mirror Session Resume and Operator Controls**

- Better session list/attach behavior
- Optional Core resume if/when available
- Idle cleanup visibility
- Stronger stop/interrupt UX
- Possible dedicated operator role naming
