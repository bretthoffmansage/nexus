# CLI Mirror Transcript Border and Expanded Metadata Polish Pass

**Date:** 2026-06-03  
**Repo:** `/Users/bretthoffman/Documents/claudia_console`  
**Scope:** Console UI only — transcript border and expanded metadata positioning

## Motivation

Live Hermes Transcript showed too many nested borders: outer transcript window, inner scroll area, plus per-group HERMES/RESPONSE borders (including green RESPONSE outline). Individual group borders added visual noise without aiding readability. Expanded session metadata also sat too close to the right edge of the transcript window.

## Files changed

- `static/style.css` — transparent group borders; expanded metadata inset
- `tests/test_claudia_cli_mirror_ui.py` — border and metadata CSS tests
- `docs/claudia_console_reform/cli_mirror_transcript_border_metadata_polish.md` — this note

## Behavior changed

- Individual `.claudia-cli-mirror-stream-group` wrappers use `border-color: transparent` (1px border width preserved for spacing).
- Role variants (HERMES, RESPONSE, USER, SYSTEM, ERROR, SESSION) no longer show colored borders.
- Expanded transcript metadata inset from `right: 16px` (18px when panel expanded) with small `padding-right`.

## Behavior intentionally unchanged

- Group DOM structure, grouping logic, labels, timestamps, content rendering
- HERMES `pre` / horizontal scroll; RESPONSE `pre-wrap` / prose font
- Outer `.claudia-cli-mirror-transcript` container border and background
- Transcript expand/minimize (except metadata position), raw debug, send input, session controls
- Core/Hermes/PTY APIs, auth, Gateway routes, Console Mode, backend runtime

## Border visibility policy

| Layer | Policy |
|-------|--------|
| Outer transcript window (`.claudia-cli-mirror-transcript`) | Visible border preserved |
| Individual stream groups | Border width kept; `border-color: transparent` |
| Role-specific accent borders | Removed (transparent) |
| Labels/content | Unchanged |

## Expanded metadata positioning policy

- Default meta offset: `right: 16px`, `padding-right: 4px`
- Expanded panel: `right: 18px`, `padding-right: 6px`
- Shown only when transcript expanded and active session (existing JS behavior)

## Tests / checks run

```bash
bash -n start-macos.sh
python3 -m compileall -q app.py core routes src
node --check static/js/claudiaCliMirror.js
node --check static/js/claudiaCliMirrorHelpers.js
venv/bin/python -m pytest -q tests/test_claudia_cli_mirror_ui.py
```

## Risks

- Transparent borders still occupy 1px; removing border entirely would shrink layout slightly (intentionally avoided).
- Metadata inset is subtle; very long session titles may still approach transcript text on narrow widths.

## Recommended live smoke test

1. Restart Console, hard refresh, start CLI Mirror session.
2. Confirm HERMES/RESPONSE blocks have no visible inner borders; outer transcript window border remains.
3. Expand transcript — session title and Running chip sit slightly inset from the right inner edge.

## Matrix 1 — Transcript borders

| Element | Before | After | Layout preserved? |
|---------|--------|-------|-------------------|
| Outer Live Hermes Transcript window | Visible border | Visible border | Yes |
| Inner transcript container/window | Visible border | Visible border | Yes |
| HERMES group wrapper | Visible border | Transparent border | Yes (1px kept) |
| RESPONSE group wrapper | Green border | Transparent border | Yes (1px kept) |
| Group labels/timestamps | Visible | Visible | Yes |
| Group content | Unchanged | Unchanged | Yes |

## Matrix 2 — Expanded metadata

| State | Before | After |
|-------|--------|-------|
| Expanded active session | `right: 8px` | `right: 18px` + padding |
| Expanded no session | Hidden | Hidden |
| Minimized/default | Hidden | Hidden |
| After stop | Hidden / minimized | Hidden / minimized |

## Matrix 3 — Preserved behavior

| Behavior | Must remain true |
|----------|------------------|
| Transcript grouping | Yes |
| HERMES full output preservation | Yes |
| RESPONSE separate from HERMES | Yes |
| Raw debug toggle | Yes |
| Transcript expand/minimize | Yes |
| Send input | Yes |
| Session controls | Yes |
| Core/Hermes untouched | Yes |
