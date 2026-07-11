# CLI Mirror Hermes Answer Output Classification Pass

**Date:** 2026-06-03  
**Repo:** `/Users/bretthoffman/Documents/console`  
**Scope:** Console UI only — classify Hermes `type: "output"` answer text as RESPONSE

## Root cause found

Hermes final assistant answers are emitted in Core session logs as `type: "output"` (PTY terminal text), not `type: "response"`. The previous Console pass mapped explicit `response`/`completion`/`final` events to RESPONSE, but treated all other output as generic HERMES. Actual answer prose inside the Hermes answer box (`╭─ ⚕ Hermes ─────╮` … `╰──────────────╯`) was merged into prompt/status redraw noise and not promoted to a visible RESPONSE group.

## Files changed

- `static/js/nexusCliMirrorHelpers.js` — `createHermesOutputClassifier`, `classifyHermesOutputText`, answer-box state, prompt/status chrome filters, output user-echo suppression, WARNING role
- `static/js/nexusCliMirror.js` — wire classifier into stream/transcript handlers; use cleaned meta text for RESPONSE/WARNING/ERROR
- `static/style.css` — `.nexus-cli-mirror-stream-warning` styling
- `tests/test_nexus_cli_mirror_ui.py` — real-ish log sequence and classification tests
- `docs/console_reform/cli_mirror_hermes_answer_output_classification.md` — this note

## Behavior changed

- Hermes answer-box prose inside `output` events classifies as **RESPONSE** (visible, separate from HERMES)
- Lightweight answer-box state tracks opener/closer across chunked output events
- PTY echo of user input in `output` events (`● say hi!…`) is suppressed (not duplicate USER/RESPONSE)
- Prompt/status redraw chrome (progress bars, `❯`, separators, `deliberating…`, interrupt chrome) is hidden from visible transcript
- Auxiliary title-generation failures classify as **WARNING** with API-key-like substrings redacted in visible text
- `TRANSCRIPT_GROUP_ROLES.WARNING` added for distinct WARNING label styling

## Behavior intentionally unchanged

- Core/Hermes/PTY APIs, auth, Gateway routes, Console Mode, session lifecycle, backend runtime
- Optimistic USER append + input-event echo suppression (`shouldSuppressUserInputEcho`)
- `_sendInFlight` guard, empty group pruning, nested payload extraction
- HERMES startup banner/tool list rendering (still HERMES, not RESPONSE)
- RESPONSE separate from HERMES; raw debug toggle unchanged (unredacted)
- Transcript expand/minimize, compact send panel, session controls

## Hermes output answer classification policy

1. Run `output`/`hermes_output` events through `createHermesOutputClassifier()` before grouping.
2. On opener line containing `╭` and `Hermes`, enter answer-box state.
3. While in answer box, non-border, non-chrome lines with letters classify as **RESPONSE** (`FINAL_LIKE`).
4. On closer line containing `╰` and `─`, exit answer-box state.
5. Explicit `response`/`completion`/`final` events still map to RESPONSE without classifier heuristics.
6. Startup banners and tool lists outside answer box remain **HERMES** via existing `classifyContentCategory`.

## Prompt/status chrome filtering policy

Suppress visible transcript (raw debug unchanged) for normalized output matching:

- Model/context/progress status bars (`gpt-* │ 0/128K │ [░░] 0%`)
- Interrupt chrome (`msg=interrupt`, `/queue`, `/bg`, `/steer`, `Ctrl+C cancel`)
- Prompt-only lines (`❯`, `>`)
- Separator/box-border-only lines
- `deliberating…` status
- ANSI/control-only chunks after normalization
- PTY user-input echo prefixed with `●` matching recent optimistic send

## Warning/error handling policy

- Lines matching `Auxiliary title generation failed` → **WARNING**
- Other warn/error heuristics from `classifyContentCategory` preserved
- Visible WARNING/ERROR text uses `redactSecrets()` (`vck_…`, `sk-…` truncated); raw debug drawer unmodified

## Tests / checks run

```bash
bash -n start-macos.sh
python3 -m compileall -q app.py core routes src
node --check static/js/nexusCliMirror.js
node --check static/js/nexusCliMirrorHelpers.js
venv/bin/python -m pytest -q tests/test_nexus_cli_mirror_ui.py
```

## Risks

- Answer-box heuristics may miss answers if Hermes changes box drawing characters
- Conservative prose detection inside answer box could still miss very short replies without letters
- Classifier state resets on transcript reload; pagination replay must preserve event order
- WARNING redaction relies on pattern heuristics; unusual secret formats may still appear in styled view

## Recommended live smoke test

1. Restart Console, hard refresh, start CLI Mirror session.
2. Send: `say hi! and tell me your name`
3. Confirm USER appears **once**
4. Confirm RESPONSE shows answer text (e.g. `hi! i'm ChatGPT 😄`)
5. If auxiliary title warning appears, confirm it is WARNING (not RESPONSE) and key is redacted
6. Toggle raw **db** debug to compare full event stream

## Matrix 1 — Real log event behavior

| Event / sequence | Before | After |
|------------------|--------|-------|
| type input `say hi!…` | USER once (after echo fix) | USER once |
| output echo `● say hi!…` | Possible HERMES noise | Suppressed |
| output status/progress bar | HERMES noise or blank group | Hidden |
| output Hermes answer box opener | HERMES chrome | Hidden (state only) |
| output answer content `hi! i'm ChatGPT 😄` | Hidden in HERMES noise | **RESPONSE** visible |
| output answer box closer | HERMES chrome | Hidden |
| output title generation 401 warning | HERMES or hidden | **WARNING** visible, redacted |
| output prompt redraw `❯` | HERMES noise | Hidden |

## Matrix 2 — Classification policy

| Normalized output text | Display role |
|------------------------|--------------|
| startup banner/tool list | HERMES |
| model/context/progress status bar | skip (hidden) |
| msg=interrupt chrome | skip (hidden) |
| Hermes answer box border | skip (hidden) |
| Hermes answer prose | RESPONSE |
| prompt symbol only | skip (hidden) |
| auxiliary title generation warning | WARNING |
| ANSI/control-only text | skip (hidden) |

## Matrix 3 — Preserved behavior

| Behavior | Must remain true |
|----------|------------------|
| USER appears once | Yes |
| RESPONSE separate from HERMES | Yes |
| HERMES startup full output | Yes |
| no blank visible groups | Yes |
| raw debug toggle | Yes |
| transcript expand/minimize | Yes |
| compact input panel | Yes |
| session controls | Yes |
| Core/Hermes untouched | Yes |
