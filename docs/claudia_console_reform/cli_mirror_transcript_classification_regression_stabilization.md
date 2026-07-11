# CLI Mirror Transcript Classification Regression Stabilization Pass

**Date:** 2026-06-03  
**Repo:** `/Users/bretthoffman/Documents/console`  
**Scope:** Console UI only — fix over-classification regression from answer-output pass

## Root cause found

Two compounding issues:

1. **Answer-box detection too broad** — `isHermesAnswerBoxOpener` matched any line with `╭` and `Hermes`, including the startup banner (`Hermes Agent v…`). Answer-box state entered during startup and never exited cleanly, promoting startup/tool-list output to RESPONSE and merging boundaries incorrectly.

2. **Optimistic USER suppressed as echo** — `_sendInput()` set `_lastOptimisticUser` before the optimistic `_appendTranscriptEvent()`. Echo dedupe (`shouldSuppressUserInputEcho`) then treated the optimistic render itself as a duplicate PTY echo and skipped it, making sent messages vanish until/unless a later stream event re-added them.

Secondary: `classifyContentCategory` prose heuristics promoted long startup/welcome lines to `FINAL_LIKE` inside the classifier fallback path, merging welcome text into misclassified RESPONSE groups.

## Files changed

- `static/js/nexusCliMirrorHelpers.js` — startup banner/prose helpers, conservative answer-box opener, `hasUserSentInput` gating, classification order fix, `noteUserInput()`
- `static/js/nexusCliMirror.js` — optimistic USER `{ optimistic: true }` bypass, `nonPrunable` USER groups, classifier `noteUserInput` on send
- `tests/test_nexus_cli_mirror_ui.py` — regression stabilization tests
- `docs/console_reform/cli_mirror_transcript_classification_regression_stabilization.md` — this note

## Behavior changed

- Startup banner/tool/skills list always **HERMES**; never enters answer-box state
- Welcome/Tip startup prose → **RESPONSE** in separate group from HERMES banner
- Answer-box RESPONSE promotion only after at least one USER input (`noteUserInput` / `hasUserSentInput`)
- Answer-box opener narrowed to `╭…⚕ Hermes` pattern (excludes `Hermes Agent`)
- Optimistic USER renders immediately and is not echo-suppressed
- Optimistic USER groups marked `nonPrunable` (empty-group cleanup cannot remove them)
- `classifyContentCategory` `FINAL_LIKE` no longer promoted to RESPONSE outside answer-box/startup-prose paths

## Behavior intentionally unchanged

- Core/Hermes/PTY APIs, auth, Gateway, session lifecycle, backend
- Post-user answer box → RESPONSE (`hi! i'm ChatGPT 😄`)
- PTY output user-echo suppression, prompt/status chrome hiding
- WARNING classification with key redaction, raw debug unmodified
- `_sendInFlight`, nested extraction, split-word reassembly, expand/minimize, compact send panel

## Classification order (output events)

1. Extract/normalize — empty/control-only → skip  
2. PTY echo of recent USER (`● …`) → skip  
3. Prompt/status chrome → skip  
4. Startup banner/tool list (`isHermesStartupBannerText`) → **HERMES**  
5. Startup welcome/tip prose (`isHermesStartupProseText`) → **RESPONSE**  
6. After user input: answer-box opener (`╭…⚕ Hermes`) → set state, skip border  
7. In answer box + prose → **RESPONSE**  
8. Answer-box closer → clear state, skip border  
9. Auxiliary/warn/error → **WARNING** / **ERROR**  
10. Else visible terminal output → **HERMES**

## Startup banner/prose policy

| Content | Role |
|---------|------|
| Hermes Agent v*, Available Tools/Skills, tool lists, Session: | HERMES |
| Welcome to Hermes Agent! … | RESPONSE (separate group) |
| Tip: … | RESPONSE (may merge with consecutive welcome/tip) |

Startup checks run **before** answer-box opener checks. Answer-box state is cleared when startup banner markers are seen.

## Answer-box activation policy

- Disabled until `noteUserInput()` / stream `hermes_input` / `_lastOptimisticUser` indicates user sent input
- Opener requires `╭` + `⚕ Hermes` pattern; rejects `Hermes Agent`, `Available Tools`, `Available Skills`
- New user input resets stale `inHermesAnswerBox` state

## USER stability policy

- Optimistic append uses `{ optimistic: true }` — bypasses echo dedupe
- `_lastOptimisticUser` still set for stream echo suppression of subsequent PTY events
- Stream `hermes_input` echo suppressed when matching optimistic text (non-optimistic path)
- USER groups from optimistic send are `nonPrunable`

## Tests / checks run

```bash
bash -n start-macos.sh
python3 -m compileall -q app.py core routes src
node --check static/js/nexusCliMirror.js
node --check static/js/nexusCliMirrorHelpers.js
venv/bin/python -m pytest -q tests/test_nexus_cli_mirror_ui.py
```

## Risks

- Welcome/Tip detection relies on line-prefix heuristics; alternate Hermes startup wording may stay HERMES
- Answer-box opener pattern may miss future Hermes box title changes
- `nonPrunable` optimistic USER groups persist even if somehow emptied (should not occur with normal text)

## Recommended live smoke test

1. Restart Console, hard refresh, start CLI Mirror session  
2. Confirm startup banner/tool list is **HERMES** (one group)  
3. Confirm Welcome/Tip appear as separate **RESPONSE** prose (not merged into banner)  
4. Send `say hi! and tell me your name` — USER appears **immediately once**  
5. Confirm final answer appears as **RESPONSE** (`hi! i'm ChatGPT 😄` or similar)

## Matrix 1 — Startup classification

| Event/text | Before | After |
|------------|--------|-------|
| Hermes Agent v + Available Tools | RESPONSE (wrong) | HERMES |
| Available Skills/tool list | Mixed into RESPONSE | HERMES |
| Welcome to Hermes Agent | Jammed into banner group | RESPONSE (separate) |
| Tip line | HERMES | RESPONSE (merged with welcome) |
| startup before user input | answer-box state active | answer-box inactive |
| startup after page reload/replay | Over-classified RESPONSE | HERMES + separate RESPONSE prose |

## Matrix 2 — Post-user answer classification

| Event/text | Before | After |
|------------|--------|-------|
| USER send | Vanished (echo dedupe bug) | USER immediate, stable |
| PTY echo of same user text | Duplicate or confusing | Suppressed |
| status/progress chrome | Noise | Hidden |
| answer box opener after user | Sometimes startup false positive | State only, after user input |
| answer prose after user | Missing or wrong group | RESPONSE visible |
| answer box closer | State leak | Hidden, state cleared |
| prompt redraw after answer | Noise | Hidden |

## Matrix 3 — Preserved behavior

| Behavior | Must remain true |
|----------|------------------|
| USER appears once immediately | Yes |
| startup full HERMES output preserved | Yes |
| RESPONSE separate from HERMES | Yes |
| no blank groups | Yes |
| raw debug unchanged | Yes |
| expand/minimize unchanged | Yes |
| compact input panel unchanged | Yes |
| Core/Hermes untouched | Yes |
