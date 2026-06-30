# CLI Mirror Response Role Grouping Refinement Pass

**Date:** 2026-06-03  
**Repo:** `/Users/bretthoffman/Documents/claudia_console`  
**Scope:** Console UI only — transcript display role grouping refinement

## Root cause

The continuous stream rendering pass grouped all “Hermes-like” categories (`hermes_output`, `final_like`, `tool_like`, `shell_like`) under a single **HERMES** display role. That collapsed assistant-facing **RESPONSE** text into terminal output groups, losing the meaningful UI distinction between raw PTY/Hermes terminal output and user-facing response prose.

## Files changed

- `static/js/claudiaCliMirrorHelpers.js` — `TRANSCRIPT_GROUP_ROLES.RESPONSE`, role normalization, `classifyStreamEvent` response/assistant handling
- `static/js/claudiaCliMirror.js` — pass payload into role normalization
- `static/style.css` — `.claudia-cli-mirror-stream-response` styling
- `tests/test_claudia_cli_mirror_ui.py` — RESPONSE grouping tests
- `docs/claudia_console_reform/cli_mirror_response_role_grouping_refinement.md` — this note

## Behavior changed

- `final_like` and explicit `response`/`assistant` events map to display role **RESPONSE**, not **HERMES**
- Consecutive **RESPONSE** chunks merge into one RESPONSE group
- **HERMES** → **RESPONSE** and **RESPONSE** → **HERMES** start new visible groups
- **HERMES, RESPONSE, HERMES** renders as three separate groups
- RESPONSE groups use green-tinted border and inherited (prose) font; HERMES keeps monospace terminal styling

## Behavior intentionally unchanged

- Core PTY APIs, Hermes, session lifecycle, auth, Gateway routes, Console Mode, backend runtime
- Session controls (Start/Stop, Ctrl+C, send input, minimize/expand)
- Raw transcript debug (all events, unmodified payloads)
- Chunk reassembly, ANSI normalization, progressive paint, session reset clearing

## Role normalization policy

| Raw type / source | Display role | Notes |
|-------------------|--------------|-------|
| `hermes_output`, tool/shell-like output | **HERMES** | Terminal banners, prompts, tool lists |
| `final_like`, `response`, `assistant` | **RESPONSE** | User-facing assistant prose |
| `user_input`, `input`, operator | **USER** | Operator input |
| `status`, session status | **SYSTEM** | System/status lines |
| `stopped` | **SESSION** | Session lifecycle |
| `error`, `warning` | **ERROR** | Error/warning cards |

## Grouping policy

Append to the current visible group **only** when the normalized display role exactly matches the previous visible group role.

| Sequence | Groups |
|----------|--------|
| HERMES, HERMES, HERMES | 1 × HERMES |
| RESPONSE, RESPONSE | 1 × RESPONSE |
| HERMES, RESPONSE | HERMES + RESPONSE |
| RESPONSE, HERMES | RESPONSE + HERMES |
| HERMES, RESPONSE, HERMES | 3 groups |
| USER, HERMES | USER + HERMES |
| Empty HERMES | Skipped (raw debug only) |

## Preserved transcript normalization behavior

- Split-word chunk reassembly (`ski` + `lls` → `skills`)
- No artificial separators between same-role chunks
- Real newlines preserved
- ANSI/OSC/orphan CSI stripped
- Carriage returns normalized (line overwrite)
- Progressive paint queue preserves order
- Raw debug unmodified

## Tests / checks run

```bash
bash -n start-macos.sh
python3 -m compileall -q app.py core routes src
node --check static/js/claudiaCliMirror.js
node --check static/js/claudiaCliMirrorHelpers.js
venv/bin/python -m pytest -q tests/test_claudia_cli_mirror_ui.py
```

## Risks

- Prose heuristics (`final_like`) may occasionally misclassify long terminal output as RESPONSE; explicit `response`/`assistant` event names and payload roles override when present
- Very short assistant replies under 48 chars remain **HERMES** unless tagged as response/assistant

## Recommended live smoke test

1. Restart Console and hard refresh.
2. Start CLI Mirror session.
3. Confirm startup banner/tool list appears as one **HERMES** block.
4. Confirm welcome/tip prose appears as a separate **RESPONSE** block.
5. Confirm subsequent prompt/status output appears as a new **HERMES** block.
6. Toggle raw transcript — all events still present.

## Matrix 1 — Role grouping

| Event sequence | Before | After |
|----------------|--------|-------|
| HERMES, HERMES, HERMES | 1 Hermes group | 1 HERMES group |
| RESPONSE, RESPONSE | 1 Hermes group | 1 RESPONSE group |
| HERMES, RESPONSE | 1 Hermes group | HERMES + RESPONSE |
| RESPONSE, HERMES | 1 Hermes group | RESPONSE + HERMES |
| HERMES, RESPONSE, HERMES | 1 Hermes group | 3 groups |
| USER, HERMES | 2 groups | 2 groups (unchanged) |
| Empty HERMES | Skipped | Skipped |

## Matrix 2 — Display role policy

| Raw type/source | Display role | Notes |
|-----------------|--------------|-------|
| `hermes_output` | HERMES | Terminal/stream output |
| tool/shell-like | HERMES | Tool lists, shell traces |
| `response` / `assistant` / `final_like` | RESPONSE | Assistant prose |
| user/operator input | USER | Operator boundary |
| system/session/status | SYSTEM / SESSION | Status events |
| error | ERROR | Error cards |

## Matrix 3 — Preserved fixes

| Fix | Must remain true |
|-----|------------------|
| Split word chunks join | Yes |
| No artificial separators | Yes |
| Real newlines preserved | Yes |
| ANSI fragments stripped | Yes |
| Carriage returns normalized | Yes |
| Progressive paint preserves order | Yes |
| Raw debug unmodified | Yes |
