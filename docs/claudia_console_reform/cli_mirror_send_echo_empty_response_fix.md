# CLI Mirror Send Echo and Empty Response Rendering Fix Pass

**Date:** 2026-06-03  
**Repo:** `/Users/bretthoffman/Documents/claudia_console`  
**Scope:** Console UI only — send echo dedupe and empty group fix

## Root cause found

**Duplicate USER input:** `_sendInput()` optimistically appended a USER group, then the PTY stream echoed the same `hermes_input` event and appended again into the same USER group, doubling visible text.

**Empty HERMES groups:** Some stream events passed visibility checks with raw bytes (ANSI/control-only) or were classified visible while `extractTranscriptChunkRaw()` missed nested payload fields (`payload.output`, `data.chunk`, etc.), creating label-only groups with empty normalized bodies.

## Files changed

- `static/js/claudiaCliMirrorHelpers.js` — expanded extraction, `resolveTranscriptChunkRaw`, user echo dedupe helpers
- `static/js/claudiaCliMirror.js` — send-in-flight guard, optimistic tracking, echo suppression, empty group prune
- `tests/test_claudia_cli_mirror_ui.py` — echo, empty group, extraction tests
- `docs/claudia_console_reform/cli_mirror_send_echo_empty_response_fix.md` — this note

## Behavior changed

- Optimistic USER render retained; streamed echo of same text within 15s is suppressed
- `_sendInFlight` prevents concurrent double-send
- Visible groups require `resolveTranscriptChunkRaw()` text that normalizes to visible content
- Empty groups pruned from DOM after append if normalization yields no visible text
- Extraction covers `stdout`, `stderr`, `chunk`, `value`, nested `payload.*`, `data.*`, `event.*`
- `completion` / `final` event names map to RESPONSE

## Behavior intentionally unchanged

- Core/Hermes/PTY APIs, auth, Gateway routes, Console Mode, session lifecycle, backend runtime
- HERMES startup preservation, RESPONSE separation, ANSI normalization, split-word reassembly
- Raw transcript capture, raw debug toggle, transcript expand/minimize, compact send panel

## Send dedupe policy

Track `_lastOptimisticUser` `{ text, sessionId, at }` on send. Suppress visible append of stream USER/input events when normalized text matches within `USER_INPUT_ECHO_DEDUPE_MS` (15s) for the same session.

## Empty group policy

Do not render visible groups unless `resolveTranscriptChunkRaw()` returns text that passes `hasVisibleTranscriptText()`. After append, `_pruneEmptyTranscriptGroup()` removes groups whose buffer normalizes to empty.

## Event extraction policy

Extract raw text from: `text`, `content`, `message`, `delta`, `output`, `line`, `stdout`, `stderr`, `chunk`, `value`, string `data`, nested `payload.*`, object `data.*`, nested `event.*`. Visibility and append both use `resolveTranscriptChunkRaw()`.

## Tests / checks run

```bash
bash -n start-macos.sh
python3 -m compileall -q app.py core routes src
node --check static/js/claudiaCliMirror.js
node --check static/js/claudiaCliMirrorHelpers.js
venv/bin/python -m pytest -q tests/test_claudia_cli_mirror_ui.py
```

## Risks

- Echo suppression window may hide legitimate repeated identical user input within 15s (rare)
- Deep fallback extraction could surface unexpected string fields if Gateway adds new shapes (raw debug still complete)

## Recommended live smoke test

1. Restart Console, hard refresh, start CLI Mirror session.
2. Send: `say hi! and tell me your name`
3. Confirm USER text appears **once**
4. Confirm HERMES and/or RESPONSE output is visible (not blank label-only groups)
5. Toggle raw **db** debug if output missing — compare event shapes with extraction helper

## Matrix 1 — Send/input behavior

| Case | Before | After |
|------|--------|-------|
| Click Send once | One POST; duplicate visible text | One POST; text once |
| Enter submit | Could overlap with in-flight | Guarded by `_sendInFlight` |
| Optimistic user display | Yes | Yes |
| PTY echoed same user input | Duplicated in USER group | Suppressed |
| Two different inputs | Both shown | Both shown |

## Matrix 2 — Empty response rendering

| Event shape | Before | After |
|-------------|--------|-------|
| Label-only HERMES | Blank visible group possible | Raw debug only |
| ANSI-only HERMES | Blank group possible | Raw debug only |
| HERMES `payload.output` | May miss content | Renders "hello" |
| HERMES `payload.data.chunk` | May miss content | Renders chunk |
| RESPONSE `payload.content` | May miss | Renders RESPONSE |
| `assistant` `data.message` | May miss | Renders RESPONSE |
| Unknown object event | Blank or dropped | Raw debug only unless string extracted |

## Matrix 3 — Preserved behavior

| Behavior | Must remain true |
|----------|------------------|
| HERMES startup full output | Yes |
| RESPONSE separate from HERMES | Yes |
| No repeated HERMES labels per run | Yes |
| Split words join | Yes |
| Raw debug toggle | Yes |
| Transcript expand/minimize | Yes |
| Compact input panel | Yes |
| Session controls | Yes |
| Core/Hermes untouched | Yes |
