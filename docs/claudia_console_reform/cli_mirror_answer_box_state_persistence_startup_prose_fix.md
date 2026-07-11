# CLI Mirror Answer Box State Persistence and Startup Prose Fix Pass

**Date:** 2026-06-03  
**Repo:** `/Users/bretthoffman/Documents/console`  
**Scope:** Console UI only — answer-box state persistence and startup Tip prose

## Root cause found

**Answer-box state cleared by duplicate input notification:** Streamed `hermes_input` echo events (matching the recent optimistic send) still invoked `noteUserInput()`, which unconditionally reset `inHermesAnswerBox = false`. When PTY echo arrived after the answer-box opener (common with non-adjacent event ordering), answer prose events lost answer-box context and were not promoted to RESPONSE.

**Startup Tip misclassification:** `isHermesStartupProseText` only matched lines starting with `Tip:`, not decorative-glyph variants like `✦ Tip: context.engine…`.

## Files changed

- `static/js/nexusCliMirrorHelpers.js` — answer-box state lifecycle, classification order, Tip glyph normalization, RESPONSE newline merge, echo-safe `noteUserInput`
- `static/js/nexusCliMirror.js` — pass `sessionId` into `classifyStreamEvent` for echo-aware input handling
- `tests/test_nexus_cli_mirror_ui.py` — answer-box persistence, delayed echo, Tip glyph tests
- `docs/console_reform/cli_mirror_answer_box_state_persistence_startup_prose_fix.md` — this note

## Behavior changed

- Answer-box state persists through hidden status/progress/interrupt/cursor chrome between opener and prose
- Duplicate streamed `hermes_input` echo no longer clears answer-box state (`noteUserInput` only resets on new distinct input; echo skips `noteUserInput` in `classifyStreamEvent`)
- Multi-line answer content merges into one RESPONSE group with newline separation
- Startup Tip lines with `✦` / decorative glyphs classify as RESPONSE prose
- Answer prose detection more permissive inside answer box (short phrases, unicode letters)
- Closer clears state only when `inHermesAnswerBox` is active

## Behavior intentionally unchanged

- Startup banner/tool/skills list remains HERMES
- USER immediate render, PTY echo suppression, status chrome hidden
- Answer-box opener only after user input; startup never enters answer-box mode
- WARNING redaction, raw debug unmodified
- Core/Hermes/PTY untouched

## Answer-box state persistence policy

Runtime logic uses **normalized text patterns only** — no event sequence numbers.

| Event pattern | State effect | Visible |
|---------------|--------------|---------|
| Opener `╭…⚕ Hermes` after user input | `inHermesAnswerBox = true` | hidden |
| Status/progress/interrupt chrome while in box | preserve state | hidden |
| Answer prose while in box | preserve state, mark content rendered | RESPONSE |
| Closer `╰…─…` while in box | `inHermesAnswerBox = false` | hidden |
| Duplicate user input echo | preserve state | suppressed |
| New distinct user input | clear answer-box state | USER |

Hidden chrome/ANSI-only chunks return `visible: false` but do **not** mutate answer-box state except via explicit opener/closer/new-input rules.

## Startup prose policy

| Pattern | Role |
|---------|------|
| Hermes Agent v*, Available Tools/Skills, tool lists | HERMES |
| Welcome to Hermes Agent! … | RESPONSE |
| Tip: … / ✦ Tip: … (glyph stripped) | RESPONSE |
| Welcome + Tip consecutive | merged RESPONSE group |

## Dynamic pattern matching policy

All runtime classification uses normalized text content patterns (box drawing, prose markers, chrome heuristics). **No sequence numbers** are used in runtime logic (no sequence numbers from debug runs such as `#22` or `#69`). Tests may reference sequence labels only as fixture comments.

## Tests / checks run

```bash
bash -n start-macos.sh
python3 -m compileall -q app.py core routes src
node --check static/js/nexusCliMirror.js
node --check static/js/nexusCliMirrorHelpers.js
venv/bin/python -m pytest -q tests/test_nexus_cli_mirror_ui.py
```

## Risks

- Tip detection relies on `Tip:` substring after glyph strip; unusual formatting may remain HERMES
- Answer-box opener pattern may need tuning if Hermes changes box title
- RESPONSE newline insertion applies only when merging consecutive RESPONSE group appends

## Recommended live smoke test

1. Restart Console, hard refresh, start CLI Mirror session  
2. Confirm startup banner is HERMES, Welcome + ✦ Tip are RESPONSE  
3. Send `say hello! and what is your name`  
4. Confirm USER appears once immediately  
5. Confirm visible RESPONSE contains both answer lines (`hey! i'm chatgpt…` and `what should i call you?`)

## Matrix 1 — Answer-box sequence behavior

| Event/text | Before | After |
|------------|--------|-------|
| answer-box opener pattern | state set | state set, hidden |
| status/progress redraw between opener and content | state lost (echo bug) | state preserved, hidden |
| interrupt chrome between opener and content | state lost possible | state preserved, hidden |
| first answer line: hey! i'm chatgpt… | missing / HERMES | RESPONSE |
| second answer line: what should i call you? | missing / HERMES | RESPONSE (merged) |
| answer-box closer pattern | state leak possible | state cleared, hidden |
| prompt redraw after closer | noise | hidden |

## Matrix 2 — Startup prose behavior

| Event/text | Before | After |
|------------|--------|-------|
| startup banner/tool list | HERMES | HERMES |
| Welcome to Hermes Agent | RESPONSE | RESPONSE |
| ✦ Tip: context.engine… | HERMES | RESPONSE |
| Tip line with decorative glyph | HERMES | RESPONSE |
| startup before user input | no answer-box | no answer-box |

## Matrix 3 — Preserved behavior

| Behavior | Must remain true |
|----------|------------------|
| USER appears once immediately | Yes |
| PTY echo suppressed | Yes |
| startup banner remains HERMES | Yes |
| RESPONSE separate from HERMES | Yes |
| no blank groups | Yes |
| status chrome hidden | Yes |
| warning redaction unchanged | Yes |
| raw debug unchanged | Yes |
| Core/Hermes untouched | Yes |
