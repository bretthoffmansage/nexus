# CLI Mirror Continuous Transcript Stream Rendering Pass

**Date:** 2026-06-03  
**Repo:** `/Users/bretthoffman/Documents/claudia_console`  
**Scope:** Console UI only (Live Hermes Transcript rendering)

## Root cause

The Live Hermes Transcript rendered one bordered card per PTY stream event via `_renderCard()`. Hermes startup output arrives as many consecutive `hermes_output` chunks, so the UI repeated the **HERMES** label and drew borders between partial ASCII/logo/tool-list fragments. PTY chunk boundaries also split words (e.g. `ski` + `lls`) and leaked partial ANSI CSI fragments (`[38;5;136m`) because each chunk was sanitized and displayed in isolation.

## Files changed

- `static/js/claudiaCliMirrorHelpers.js` — chunk raw extraction, terminal normalization, group roles, paint queue
- `static/js/claudiaCliMirror.js` — consecutive group append renderer (`_appendTranscriptEvent`)
- `static/style.css` — `.claudia-cli-mirror-stream-*` terminal-style groups
- `tests/test_claudia_cli_mirror_ui.py` — grouping, normalization, paint queue tests
- `docs/claudia_console_reform/cli_mirror_continuous_transcript_stream_rendering.md` — this note

## Behavior changed

- Consecutive Hermes-like events (`hermes_output`, `final_like`, `tool_like`, `shell_like`) merge into one visual group with a single **HERMES** label.
- Raw chunk text appends to a per-group buffer before normalization; no artificial separators between chunks.
- `normalizeTerminalText()` handles ANSI/OSC stripping, orphan CSI fragments, carriage-return line overwrites, and preserves real newlines.
- Fast progressive paint via `createTranscriptPaintQueue()` (rAF slices for large bursts).
- CSS uses monospace `pre-wrap` stream bodies instead of per-chunk cards.

## Behavior intentionally unchanged

- Core PTY APIs, Hermes, session lifecycle, auth, Gateway routes, Console Mode
- Start/Stop session, minimize/expand, Send Ctrl+C, send input, raw transcript toggle
- Raw debug drawer still logs every event payload
- Session status chip and stream reconnect logic

## Transcript grouping policy

| Boundary | New group? |
|----------|------------|
| Same Hermes-like role back-to-back | No — append |
| USER → HERMES | Yes |
| HERMES → USER | Yes |
| SYSTEM / ERROR / SESSION | Yes — own role group |
| Empty / heartbeat / raw noise | Skipped visibly |
| Session reset / transcript clear | Reset all groups |

Hermes-like roles grouped as `hermes`: `hermes_output`, `final_like`, `tool_like`, `shell_like`.

## Chunk reassembly and terminal normalization policy

1. `extractTranscriptChunkRaw()` — raw field extraction without trim/normalize.
2. Append raw chunks in order to group buffer (no inserted spaces/newlines).
3. `normalizeTerminalText(buffer)` for display only.
4. Strip ANSI/OSC, orphan `[38;5;136m`-style CSI fragments, harmful controls.
5. `\r` overwrites current line; `\n` preserves line breaks.
6. Raw debug payloads remain unmodified.

## Progressive paint policy

- Small chunks (≤96 chars) paint immediately.
- Larger chunks split (~48 chars) and flush up to 4 slices per animation frame.
- Queue cleared on session/transcript reset.
- Falls back to `setTimeout(0)` when `requestAnimationFrame` unavailable (tests).

## Empty event handling

Label-only / whitespace / spinner noise events remain hidden from the styled transcript via existing `classifyStreamEvent` + `hasVisibleTranscriptText`.

## CSS / terminal rendering

- One border per role group (`.claudia-cli-mirror-stream-group`)
- Body: `white-space: pre-wrap`, monospace, `overflow-x: auto`, no per-chunk borders

## Tests / checks run

```bash
bash -n start-macos.sh
python3 -m compileall -q app.py core routes src
venv/bin/python -m pytest -q tests/test_claudia_cli_mirror_ui.py
node --check static/js/claudiaCliMirror.js
node --check static/js/claudiaCliMirrorHelpers.js
```

## Risks

- Orphan CSI regex may remove rare literal `[123m` text in prose (unlikely in PTY banners).
- Carriage-return redraw heuristics simplify to line overwrite (may differ from true terminal emulator).
- Load-older prepend merges consecutive same-role events within the fetched batch only.

## Recommended live smoke test

1. Restart Console and hard refresh.
2. Start CLI Mirror session.
3. Confirm Hermes startup banner / tool list / skills list render as **one** continuous monospace block with a single **HERMES** label.
4. Confirm words like `skills` are not split across artificial rows and no raw `[38;5;136m` fragments appear.
5. Toggle raw transcript — all events still present.
6. Send user input — new **USER** group appears; Hermes reply continues in a new **HERMES** group.

## Matrix 1 — Transcript grouping

| Event sequence | Before | After |
|----------------|--------|-------|
| HERMES, HERMES, HERMES | 3 cards, 3 labels | 1 group, 1 label, appended text |
| HERMES, RESPONSE, HERMES (no user) | 3 cards | 1 Hermes group |
| USER, HERMES | 2 cards | 2 groups (USER then HERMES) |
| SYSTEM, HERMES | 2 cards | 2 groups |
| Empty HERMES event | Skipped | Skipped (raw debug only) |
| New session start | Prior cards cleared | Groups + paint queue cleared |

## Matrix 2 — Chunk / terminal normalization

| Case | Before | After |
|------|--------|-------|
| `ski` + `lls` split word | Two rows/cards | `skills` in one buffer |
| chunk without trailing `\n` + next chunk | Possible gap/separator | Direct append |
| chunk ending in `\n` | Sometimes lost | Preserved |
| ANSI color/style | Partial leaks possible | Stripped |
| cursor / clear-line CSI | Raw fragments | Stripped |
| `\r` progress redraw | Duplicate lines | Line overwrite |
| raw debug event | Full payload | Unchanged |

## Matrix 3 — Rendering behavior

| Content type | Before | After |
|--------------|--------|-------|
| ASCII art / logo | Split across cards | Continuous pre-wrap block |
| tool list | Split | Continuous |
| multi-line response | Split | Continuous |
| normal sentence | Single card | Grouped stream |
| empty event | Hidden | Hidden |
| raw debug event | Full line | Full line |

## Matrix 4 — Progressive paint

| Case | Behavior |
|------|----------|
| small chunk | Immediate append |
| large chunk | Queued slice paint via rAF |
| multiple queued chunks | Ordered flush, max 4/frame |
| session reset | Queue cleared |
| no requestAnimationFrame | setTimeout fallback |

## Matrix 5 — UI sections

| Section | Changed? |
|---------|----------|
| Live Hermes Transcript | Yes — stream groups |
| Raw transcript | No |
| Session Setup | No |
| Send input panel | No |
| Start/Stop controls | No |
