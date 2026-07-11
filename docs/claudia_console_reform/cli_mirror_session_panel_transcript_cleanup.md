# CLI Mirror Session Panel Simplification and Transcript Cleanup Pass

**Package / pass name:** CLI Mirror Session Panel Simplification and Transcript Cleanup Pass  
**Date / time:** 2026-06-03 (local)  
**Repo path:** `/Users/bretthoffman/Documents/console`

## Root cause

### Session setup panel
- Active sessions still showed setup labels and a redundant “Active session title: …” line.
- After stop, the title input retained the old value and blocked clean new-session setup.
- No way to collapse session controls while a session was running.

### Live Hermes Transcript
- `classifyStreamEvent()` only read top-level `raw`/`text`/`message`/`content`.
- Core/registry events often store body text in `delta`, `data`, `output`, `line`, or nested `payload.*`.
- Whitespace-only events rendered as label-only HERMES/RESPONSE rows.
- Transcript `<pre>` used chat `body`/`msg-ai` classes that could interfere with layout.

## Files changed

| File | Change |
|------|--------|
| `static/js/nexusCliMirror.js` | Active setup UI; minimize/expand; stop clears title; `_renderCard` empty-row guard |
| `static/js/nexusCliMirrorHelpers.js` | `extractTranscriptText()`, `hasVisibleTranscriptText()`; improved classification |
| `static/style.css` | Active/minimized setup panel; transcript body visibility |
| `tests/test_nexus_cli_mirror_ui.py` | Setup, minimize, transcript static/Node tests |
| `docs/console_reform/cli_mirror_session_panel_transcript_cleanup.md` | This note |

## Behavior changed

### Part A — Active session setup
- No session: full setup labels, empty editable title, Start enabled.
- Active session: labels hidden; title in read-only input; Start disabled.
- Stopped: setup labels return, title cleared, Start re-enabled.
- “Active session title:” line removed permanently.

### Part B — Minimize / expand
- Minimize control visible only while a session is running.
- Minimized: title input + Stop session + expand control only.
- Expanded active: simplified Part A view (Refresh, Ctrl+C, Session ID visible).
- Stop or session end: auto-expand, minimize hidden, no-session setup restored.
- Minimize state is in-memory only (not persisted across hard refresh).

### Part C — Transcript
- Readable label + content rows (USER, HERMES, RESPONSE, SYSTEM).
- Empty/noise/heartbeat/noop status skipped in main transcript.
- Raw transcript debug unchanged (collapsed by default).

## Behavior intentionally unchanged

- Core PTY/session APIs, Gateway routes, auth, Console Mode, Hermes execution
- Session start/stop handlers (backend); stream reconnect
- Send input to Hermes panel
- Raw transcript debug availability

## Active session panel behavior

- `.has-active-session` hides setup labels/helper.
- Title input shows active session title, disabled.
- Start session disabled; Refresh, Stop, Ctrl+C enabled per running state.
- Minimize (−) control in panel toolbar.

## Minimized panel behavior

- `.is-minimized` hides Refresh, Ctrl+C, Session ID, session note/list, Start.
- Shows title input, Stop session (stacked below title), expand (+) control.
- Does not stop session or disconnect stream.

## Stopped / no-session behavior

- `_setupPanelMinimized` reset to false.
- Setup labels/helper visible; title input cleared and editable.
- Start session re-enabled; minimize/expand controls hidden.

## Transcript event extraction policy

`extractTranscriptText()` checks, in order: `text`, `content`, `message`, `delta`, `output`, `line`, string `data`, `raw`, nested `payload.*`, object `data.*`, and `lines[]` arrays. Values pass through `sanitizeTranscriptText()`.

## Empty event handling

- `hasVisibleTranscriptText()` requires non-whitespace after trim.
- `classifyStreamEvent()` marks empty/noise events `visible: false`.
- `_renderCard()` skips rows with empty display text (except status/stopped/error/warning).

## Tests / checks run

```bash
bash -n start-macos.sh
python3 -m compileall -q app.py core routes src
venv/bin/python -m pytest -q tests/test_nexus_cli_mirror_ui.py
```

**Results:** 43 passed (`tests/test_nexus_cli_mirror_ui.py`); `bash -n start-macos.sh` OK; `compileall` OK.

## Risks

- Minimize state lost on hard refresh (intentional).
- Unknown future Core event shapes may need adapter fields in `extractTranscriptText()`.
- Minimized panel hides Session ID — operator must expand to copy ID.

## Recommended live smoke test

1. Restart Console; hard-refresh browser.
2. Open CLI Mirror — confirm full setup state (labels, empty title, Start enabled).
3. Start session — labels hide, title fills input, Start disables, minimize (−) appears.
4. Minimize — only title + Stop + expand (+) visible.
5. Expand — Refresh, Ctrl+C, Session ID return.
6. Send input; confirm Live Hermes Transcript shows readable text (not empty HERMES rows).
7. Stop session — panel expands, title clears, setup labels return, Start re-enabled.

---

## Matrix 1 — Session setup panel state

| State | Before | After | Minimize available? |
|-------|--------|-------|---------------------|
| No session | Full setup + duplicate helpers | Full setup, empty title | No |
| Active expanded | Labels + redundant active-title line | Labels hidden, title in input, Start disabled | Yes |
| Active minimized | N/A | Title + Stop + expand only | Yes (expand) |
| After stop | Stuck title, labels mixed | Full setup restored, title cleared | No |

## Matrix 2 — Controls behavior

| Control | No session | Active expanded | Active minimized | After stop |
|---------|------------|-----------------|------------------|------------|
| title input | Empty, editable | Filled, read-only | Filled, read-only | Empty, editable |
| Start session | Enabled | Disabled | Hidden | Enabled |
| Refresh sessions | Enabled | Enabled | Hidden | Enabled |
| Stop session | Disabled* | Enabled | Visible | Disabled* |
| Send Ctrl+C | Disabled* | Enabled | Hidden | Disabled* |
| Session ID copy | Visible | Visible | Hidden | Visible |
| Minimize/expand | Hidden | Minimize shown | Expand shown | Hidden |

*Per existing running/stopped rules.

## Matrix 3 — Transcript rendering

| Event shape | Before | After |
|-------------|--------|-------|
| content/text/message | Rendered when present | Unchanged |
| delta/output/line/payload.* | Label-only rows | Text extracted and shown |
| String event | Not handled | Rendered directly |
| Empty / label-only | Empty HERMES/RESPONSE rows | Skipped in main transcript |
| Raw debug | Partial fields | Full extraction + JSON fallback |

## Matrix 4 — UI sections

| Section | Before | After |
|---------|--------|-------|
| Session Setup | Noisy copy; no minimize | Active simplified; minimize/expand |
| Live Hermes Transcript | Empty label rows | Readable chronological text |
| Raw transcript | Unchanged | Unchanged (debug) |
| Send input panel | Unchanged | Unchanged |
