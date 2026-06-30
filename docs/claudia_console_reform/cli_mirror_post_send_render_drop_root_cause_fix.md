# CLI Mirror Post-Send Render Drop Root-Cause Fix Pass

**Date:** 2026-06-03  
**Repo:** `/Users/bretthoffman/Documents/claudia_console`  
**Scope:** Console UI only — restore post-send HERMES/RESPONSE styled transcript rendering

## Root cause found

Two compounding Console UI issues dropped all post-send styled output even though raw debug showed meaningful Hermes activity and answer prose:

1. **First-field payload bias:** `extractTranscriptChunkRaw` returned the first non-empty payload field (`text`, `content`, etc.). Live PTY events often place cursor/control redraw residue in `text` while the readable answer/status lives in sibling fields (`raw`, `output`, `chunk`, nested `data`). The classifier only saw control debris and returned `visible: false`.

2. **Append/prune mismatch:** Styled groups appended classifier-clean `meta.text`, but `appendTranscriptGroupBuffer` re-ran aggressive readable extraction on the accumulated buffer and `_pruneEmptyTranscriptGroup` checked `rawBuffer` instead of `displayText`, allowing newly created groups to be pruned when re-extraction differed from classifier output.

Raw debug remained correct because it still uses first-field `extractTranscriptText` / `normalizeTerminalText` (full-fidelity path unchanged).

## Files changed

- `static/js/claudiaCliMirrorHelpers.js` — `resolveBestPtyPayloadText`, `resolveStyledTranscriptChunkRaw`, `hasReadableDisplayGlyphs`, `diagnoseTranscriptEvent`, safer debris guard, classified append path, `musing` status hint
- `static/js/claudiaCliMirror.js` — classified append flag, prune uses `displayText`
- `tests/test_claudia_cli_mirror_ui.py` — split-field fixture, diagnostics, best-payload regression tests
- `docs/claudia_console_reform/cli_mirror_post_send_render_drop_root_cause_fix.md` — this note

## Behavior changed

- Styled transcript classification picks the **best readable payload field**, not the first non-empty field
- Chunks with control-only `text` plus meaningful `raw`/`output`/`chunk` now render HERMES/RESPONSE correctly
- Classifier-clean append preserves `displayText`; prune checks `displayText` first
- `diagnoseTranscriptEvent` exposes raw/best/display/role/visible/skip reason for debugging (tests/dev)
- `isControlDebrisOnly` never treats strings with letters, emoji, box drawing, or CLI glyphs as pure debris

## Behavior intentionally unchanged

- Raw debug first-field extraction and full-fidelity payloads
- Startup banner HERMES, Welcome/Tip RESPONSE
- USER once immediately, PTY echo suppression
- Answer-box state persistence, full-fidelity HERMES visibility
- WARNING/ERROR redaction
- Core/Hermes/PTY/Gateway/backend untouched

## Styled transcript pipeline after fix

For each SSE `hermes_output` event:

1. **Collect candidates** from all payload text fields (`text`, `raw`, `output`, `chunk`, nested `data`, etc.)
2. **Pick best raw** via `resolveBestPtyPayloadText` (longest meaningful readable extraction)
3. **Extract display text** with `extractReadablePtyText(bestRaw)`
4. **Skip** if empty or pure debris (`isControlDebrisOnly` with glyph guard)
5. **Classify** with `classifyHermesOutputText` / answer-box state machine
6. **Append** using classifier `meta.text` with `{ classifiedDisplay: true }`
7. **Render body** from `group.displayText`; prune only when both `displayText` and readable `rawBuffer` are empty

Runtime logic does not use sequence numbers.

## What was previously dropping the post-send answer

- Answer prose event: `{ text: "\x1b[?25h", raw: "hey brett! i'm chatgpt…" }`
- Classifier read `text` only → debris → `visible: false` → no RESPONSE group
- Same pattern dropped status/musing lines when control residue occupied `text`

## Tests/checks run

```bash
bash -n start-macos.sh
python3 -m compileall -q app.py core routes src
node --check static/js/claudiaCliMirror.js
node --check static/js/claudiaCliMirrorHelpers.js
venv/bin/python -m pytest -q tests/test_claudia_cli_mirror_ui.py
```

## Risks

- Best-field selection prefers longest readable string; rare dual-message payloads could pick the wrong field if two meaningful strings coexist in one event
- Classified append path must stay in sync with classifier `meta.text` to avoid display/body drift

## Recommended live smoke test

1. Restart Console and hard refresh
2. Start CLI Mirror session
3. Send: `hi! im brett. what is your name`
4. Confirm USER once; HERMES shows status/musing/progress (no `[?25h`); RESPONSE shows answer prose; WARNING shows auxiliary title warning if present
