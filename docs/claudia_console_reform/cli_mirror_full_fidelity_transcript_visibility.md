# CLI Mirror Full Fidelity Hermes Transcript Visibility Pass

**Date:** 2026-06-03  
**Repo:** `/Users/bretthoffman/Documents/claudia_console`  
**Scope:** Console UI only — show meaningful Hermes CLI activity as HERMES

## Root cause found

The answer-box persistence pass correctly kept state through hidden chrome, but the visibility policy still treated meaningful Hermes CLI output (status/progress bars, ruminating lines, interrupt hints, prompts, separators) as skippable “chrome.” CLI Mirror is meant to mirror the visible Hermes terminal faithfully, not hide operational output for chat-style cleanup.

## Files changed

- `static/js/claudiaCliMirrorHelpers.js` — full-fidelity visibility policy, `isControlOnlyChunk`, `isHermesCliStatusLine`, answer-box merge helpers, HERMES split-word append fix
- `static/js/claudiaCliMirror.js` — answer-box HERMES/RESPONSE append targets, meta.text for HERMES output
- `tests/test_claudia_cli_mirror_ui.py` — full-fidelity visibility and answer-box merge tests
- `docs/claudia_console_reform/cli_mirror_full_fidelity_transcript_visibility.md` — this note

## Behavior changed

- Status/progress bars, ruminating/deliberating lines, interrupt hints, prompts, separators, and tool output render as **HERMES** (visible)
- Only true control-only/empty/duplicate redraw/user-echo chunks are skipped
- In-box HERMES activity merges across RESPONSE boundaries (status between answer lines stays in one HERMES group)
- In-box RESPONSE prose merges across intervening in-box HERMES status lines
- Exact duplicate HERMES redraw chunks suppressed via `lastHermesVisibleNorm`
- HERMES append preserves split-word reassembly (no newline between `Available Ski` + `lls`)

## Behavior intentionally unchanged

- Answer-box state persistence through status events (state not cleared by visible HERMES)
- Duplicate input echo does not clear answer-box state
- USER immediate render, PTY output echo suppression, optimistic USER non-prunable
- Startup banner HERMES, Welcome/Tip RESPONSE, answer prose → RESPONSE
- WARNING/ERROR visible with key redaction; raw debug unmodified
- Core/Hermes/PTY untouched

## Full-fidelity Hermes visibility policy

| Content | Role |
|---------|------|
| Status/progress bars | HERMES |
| Ruminating/deliberating | HERMES |
| msg=interrupt / queue / steer hints | HERMES |
| Prompt lines (`❯`) | HERMES |
| Separators / layout lines | HERMES |
| Tool/command output | HERMES |
| Startup banner/tools/skills | HERMES |
| Answer prose inside answer box | RESPONSE |
| Welcome/Tip startup prose | RESPONSE |

## Skip-only true control/debug artifact policy

Skip only when:

- Normalized text is empty
- ANSI/control-only (`isControlOnlyChunk` / `isRawNoise`)
- Bracketed paste / cursor-show-hide toggles only
- Exact duplicate HERMES redraw (same normalized content as previous visible HERMES chunk)
- PTY user-input echo matching recent USER (`●` + same text)

## Answer-box state persistence policy

- Opener after user input sets `inHermesAnswerBox`
- Visible HERMES status during box does **not** clear state
- Answer prose → RESPONSE with `answerProse` merge flag
- In-box status → HERMES with `answerBoxActivity` merge flag
- Closer clears state; new distinct USER input clears state

## Response separation policy

- Final answer prose inside answer box → **RESPONSE**
- Multiple answer lines merge into one RESPONSE group (newline separated)
- HERMES activity before/during answer remains **HERMES**
- HERMES → RESPONSE boundary at first answer prose; in-box status after first answer line appends to prior in-box HERMES group, not a new post-RESPONSE block when still inside answer flow

## Dynamic pattern matching policy

Runtime logic uses normalized text patterns only (box drawing, status line shapes, prose heuristics). **No sequence numbers** are used in runtime logic (no sequence numbers from debug runs such as `#22` or `#69`). Tests may use sequence labels only as fixture comments.

## Tests / checks run

```bash
bash -n start-macos.sh
python3 -m compileall -q app.py core routes src
node --check static/js/claudiaCliMirror.js
node --check static/js/claudiaCliMirrorHelpers.js
venv/bin/python -m pytest -q tests/test_claudia_cli_mirror_ui.py
```

## Risks

- High-fidelity mode produces more HERMES text (intended); transcript may feel busier than Simple Chat
- Duplicate redraw dedupe may hide legitimate repeated status lines if identical
- In-box merge heuristics depend on `answerBoxActivity` / `answerProse` flags

## Recommended live smoke test

1. Restart Console, hard refresh, start CLI Mirror session  
2. Confirm startup shows HERMES banner + Welcome/Tip RESPONSE  
3. Send `say hello! and what is your name`  
4. Confirm USER once, HERMES shows ruminating/status/progress/interrupt lines, RESPONSE contains both answer lines

## Matrix 1 — Hermes visibility policy

| Event/text | Before | After |
|------------|--------|-------|
| ruminating/deliberating line | hidden | HERMES |
| model/context/progress status bar | hidden | HERMES |
| msg=interrupt / queue / steer hint | hidden | HERMES |
| prompt/status redraw with visible text | hidden | HERMES |
| tool/command output | HERMES | HERMES |
| ANSI/control-only chunk | hidden | hidden |
| PTY echo of user input | hidden | hidden |
| exact duplicate redraw | visible duplicate | hidden dedupe |

## Matrix 2 — Answer/response separation

| Event/text | Before | After |
|------------|--------|-------|
| USER send | immediate USER | immediate USER |
| answer-box opener pattern | hidden/state | hidden/state |
| visible HERMES status between opener and content | hidden | HERMES visible |
| first answer prose | RESPONSE | RESPONSE |
| second answer prose | RESPONSE (if state ok) | RESPONSE merged |
| answer-box closer pattern | hidden/state off | hidden/state off |
| HERMES prompt/status after answer | hidden | HERMES visible |

## Matrix 3 — Startup behavior

| Event/text | Before | After |
|------------|--------|-------|
| startup banner/tool list | HERMES | HERMES |
| Available Skills list | HERMES | HERMES |
| Welcome to Hermes Agent | RESPONSE | RESPONSE |
| decorative Tip line | RESPONSE | RESPONSE |
| startup before user input | no answer-box | no answer-box |

## Matrix 4 — Preserved behavior

| Behavior | Must remain true |
|----------|------------------|
| USER appears once immediately | Yes |
| PTY echo suppressed | Yes |
| startup banner remains HERMES | Yes |
| RESPONSE separate from HERMES | Yes |
| no blank groups | Yes |
| warning visible/redacted | Yes |
| raw debug unchanged | Yes |
| expand/minimize unchanged | Yes |
| compact input panel unchanged | Yes |
| Core/Hermes untouched | Yes |
