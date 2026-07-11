# CLI Mirror Send Input Panel Compact Layout Pass

**Date:** 2026-06-03  
**Repo:** `/Users/bretthoffman/Documents/console`  
**Scope:** Console UI only — Send input panel layout polish

## Motivation

The Send input panel duplicated guidance already present in the textarea placeholder. The raw debug toggle also sat above the input row, adding vertical clutter. Operators wanted a compact, symmetrical input bar with the debug toggle beside Send.

## Files changed

- `static/js/nexusCliMirror.js` — removed heading/helper; moved `db` toggle into input actions row
- `static/style.css` — compact panel padding, input actions row, bottom-aligned buttons
- `tests/test_nexus_cli_mirror_ui.py` — compact layout tests
- `docs/console_reform/cli_mirror_send_input_compact_layout.md` — this note

## Behavior changed

- Removed visible “Send input to Hermes” label and helper paragraph above the textarea.
- Placeholder and `aria-label` unchanged.
- Raw debug toggle moved to `.nexus-cli-mirror-input-actions` beside Send button (Send left, `db` right).
- Toggle button shows lowercase **db** with amber styling and active glow when raw debug is visible.
- Input panel uses symmetric compact padding (`10px 12px`).

## Behavior intentionally unchanged

- Core/Hermes/PTY APIs, session lifecycle, auth, Gateway routes, Console Mode, backend runtime
- Send input, Enter-to-send, raw debug capture/copy, raw section collapsed-by-default when visible
- Transcript grouping, expand/minimize, session setup, Start/Stop, Send Ctrl+C

## Send input panel layout before/after

| Element | Before | After |
|---------|--------|-------|
| Panel heading | Visible label | Removed |
| Helper text | Visible paragraph | Removed |
| Placeholder | Present | Unchanged |
| Send button | Beside textarea | Beside textarea (in actions group) |
| Raw debug toggle | Top-right of panel | Right of Send button, labeled `db` |
| Padding | Extra space above input | Compact, symmetrical |

## Raw debug button behavior

Unchanged functionally: hidden by default, toggle shows/hides raw section, details collapsed when visible, active glow on `db` when on.

## Tests / checks run

```bash
bash -n start-macos.sh
python3 -m compileall -q app.py core routes src
node --check static/js/nexusCliMirror.js
node --check static/js/nexusCliMirrorHelpers.js
venv/bin/python -m pytest -q tests/test_nexus_cli_mirror_ui.py
```

## Risks

- New users may rely only on placeholder text (mitigated by unchanged placeholder and aria-label).
- Very narrow mobile widths stack textarea above action row; Send and `db` remain paired.

## Recommended live smoke test

1. Restart Console, hard refresh, open CLI Mirror.
2. Confirm input panel has no heading/helper above textarea.
3. Confirm **Send** and amber **db** buttons sit on one row, bottom-aligned.
4. Click **db** — raw transcript appears; click again — hidden.

## Matrix 1 — Send input panel layout

| Element | Before | After |
|---------|--------|-------|
| Panel heading | “Send input to Hermes” | Removed |
| Helper text | Hermes session helper | Removed |
| Input placeholder | Unchanged | Unchanged |
| Send button | In input bar | In actions row |
| Raw debug toggle | Panel header | Beside Send, labeled `db` |
| Panel padding/spacing | Top-heavy | Compact/symmetrical |

## Matrix 2 — Raw debug toggle

| State | Button | Raw debug section | Layout |
|-------|--------|-------------------|--------|
| Default | Inactive `db` | Hidden | Compact input only |
| Active/toggled on | Glowing `db` | Visible, collapsed details | Raw drawer above input |
| Toggled off | Inactive `db` | Hidden | Compact input |
| After session start | Same toggle behavior | Same | Unchanged |
| After session stop | Same toggle behavior | Same | Unchanged |

## Matrix 3 — Preserved behavior

| Behavior | Must remain true |
|----------|------------------|
| Send input works | Yes |
| Raw debug data still captured | Yes |
| Raw debug collapsed by default when visible | Yes |
| Transcript expand/minimize unaffected | Yes |
| Session setup unaffected | Yes |
| Core/Hermes untouched | Yes |
