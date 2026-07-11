# CLI Mirror Transcript Layout Polish and Debug Toggle Pass

**Date:** 2026-06-03  
**Repo:** `/Users/bretthoffman/Documents/console`  
**Scope:** Console UI polish only

## Root cause / motivation

CLI Mirror transcript grouping and truncation fixes are functionally correct, but three polish gaps remained:

1. HERMES terminal output used `pre-wrap`, causing ASCII/box-drawing drift.
2. Raw transcript debug always consumed vertical space even when operators rarely need it.
3. Live Hermes Transcript could not expand to use space occupied by the CLI Mirror header and Session Setup panel.

## Files changed

- `static/js/nexusCliMirror.js` — raw debug toggle, transcript expand/minimize, expanded metadata
- `static/style.css` — role-specific terminal formatting, toggle/expand styles, expanded layout
- `tests/test_nexus_cli_mirror_ui.py` — layout polish tests
- `docs/console_reform/cli_mirror_transcript_layout_polish_debug_toggle.md` — this note

## Behavior changed

- **HERMES** stream bodies use `white-space: pre`, horizontal scroll, `tab-size: 4`, no ligatures.
- **RESPONSE** stream bodies remain `pre-wrap` with inherited prose font.
- Raw transcript debug section hidden by default; amber square toggle in Send input panel top-right shows/hides it.
- Live Hermes Transcript has `+` / `−` expand control; expanded mode hides header/status and Session Setup, grows transcript area, shows session title + status chip inside transcript top-right.
- Stop session or loss of active session returns transcript to minimized layout.

## Behavior intentionally unchanged

- Core PTY APIs, Hermes, session lifecycle, auth, Gateway routes, Console Mode, backend runtime
- Transcript role grouping (HERMES vs RESPONSE)
- Chunk preservation, ANSI normalization, split-word reassembly
- Raw transcript capture and copy behavior when visible
- Session Start/Stop, Send Ctrl+C, send input, setup panel minimize interaction

## Terminal formatting policy

| Role | CSS policy |
|------|------------|
| HERMES | `pre`, monospace, `overflow-x: auto`, `tab-size: 4`, no ligatures |
| RESPONSE | `pre-wrap`, inherited font, readable prose |
| USER/SYSTEM/ERROR | Default stream body styling |

Horizontal scroll on wide HERMES output is acceptable and preferred over wrapping ASCII art.

## Raw debug toggle behavior

| State | Raw section | Toggle | Layout |
|-------|-------------|--------|--------|
| Default load | Hidden | Inactive (no glow) | Send input panel higher |
| Toggle on | Visible (details collapsed) | Active glow | Raw drawer appears above input |
| Toggle off | Hidden | Inactive | Space reclaimed |
| Transcript expanded | Follows toggle state | Independent | Raw section still between transcript and input when visible |
| No active session | Hidden if toggled off | Works independently | N/A |

Visibility only — raw event capture unchanged.

## Transcript expanded/minimized behavior

| State | Header/status | Session Setup | Transcript | Send input | Metadata |
|-------|---------------|---------------|------------|------------|----------|
| Minimized (default) | Visible | Visible | Normal height | Visible | Hidden |
| Expanded + active session | Hidden | Hidden | Large scrollable | Visible | Title + Running chip |
| Expanded + no session | N/A (cannot expand) | Visible | Normal | Visible | Hidden |
| Minimized after stop | Restored | Restored | Normal | Visible | Hidden |

Expanded mode is UI-only; streaming and transcript content unaffected.

## Tests / checks run

```bash
bash -n start-macos.sh
python3 -m compileall -q app.py core routes src
node --check static/js/nexusCliMirror.js
node --check static/js/nexusCliMirrorHelpers.js
venv/bin/python -m pytest -q tests/test_nexus_cli_mirror_ui.py
```

## Risks

- Very wide HERMES banners require horizontal scroll (by design).
- Expanded transcript on small viewports may still need page scroll.
- Raw debug toggle state is not persisted across reload (defaults hidden).

## Recommended live smoke test

1. Restart Console, hard refresh, start CLI Mirror session.
2. Confirm HERMES ASCII/tool lists align better with horizontal scroll instead of wrapping.
3. Toggle amber square — raw debug appears/disappears; details still collapsed by default.
4. Click `+` on Live Hermes Transcript — header/setup hide, transcript grows, session title/status show top-right.
5. Click `−` — normal layout restores.

## Matrix 1 — Terminal formatting

| Role | Before | After |
|------|--------|-------|
| HERMES | `pre-wrap`, may wrap ASCII | `pre`, horizontal scroll, tab-size 4 |
| RESPONSE | `pre-wrap` prose | Unchanged `pre-wrap` prose |
| USER | Generic stream body | Unchanged |
| SYSTEM/ERROR | Generic stream body | Unchanged |
| Raw debug | `pre-wrap` in drawer | Unchanged when visible |

## Matrix 2 — Raw debug visibility

| State | Raw debug section | Toggle button | Layout impact |
|-------|-------------------|---------------|---------------|
| Default page load | Hidden | Inactive | More vertical space for transcript/input |
| Toggle on | Visible, collapsed details | Glowing/active | Raw drawer above input |
| Toggle off | Hidden | Inactive | Space reclaimed |
| Transcript expanded | Follows toggle | Independent | Same toggle behavior |
| No active session | Hidden by default | Toggle still works | N/A |

## Matrix 3 — Transcript expand/minimize

| State | Header/status | Session Setup | Transcript | Send input | Session metadata |
|-------|---------------|---------------|------------|------------|------------------|
| Minimized/default | Visible | Visible | Standard max-height | Visible | Hidden |
| Expanded + active | Hidden | Hidden | Large/flex grow | Visible | Title + status chip |
| Expanded + no session | Cannot expand | Visible | Standard | Visible | Hidden |
| Minimized after stop | Restored | Restored | Standard | Visible | Hidden |

## Matrix 4 — Preserved behavior

| Behavior | Must remain true |
|----------|------------------|
| Core/Hermes untouched | Yes |
| Session start/stop unchanged | Yes |
| Transcript chunks preserved | Yes |
| RESPONSE separate from HERMES | Yes |
| Raw debug data captured | Yes |
| Model selector/chat unaffected | Yes |
