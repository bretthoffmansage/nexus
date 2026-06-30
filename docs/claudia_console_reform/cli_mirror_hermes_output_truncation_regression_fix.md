# CLI Mirror Hermes Output Truncation Regression Fix Pass

**Date:** 2026-06-03  
**Repo:** `/Users/bretthoffman/Documents/claudia_console`  
**Scope:** Console UI only — Live Hermes Transcript truncation regression

## Root cause found

**Primary:** The progressive paint queue dropped pending HERMES text when a role boundary (HERMES → RESPONSE) triggered `_cancelTranscriptPaint()`, which cleared the queue without flushing. Only paint slices already flushed to the DOM were visible; remaining startup/tool-list chunks were silently discarded.

**Secondary contributors (mitigated):**
- Visible deduplication could skip consecutive chunks classified as identical after whitespace normalization.
- `isRawNoise()` could hide short partial PTY fragments lacking obvious alphanumeric content.

**Not the cause:** CSS clipping — stream group bodies had no max-height; the transcript container scrolls vertically.

## Files changed

- `static/js/claudiaCliMirror.js` — immediate buffer append; removed live paint queue and visible dedupe
- `static/js/claudiaCliMirrorHelpers.js` — relaxed noise filter; `appendTranscriptGroupBuffer`, `simulateTranscriptGroupSequence`, paint queue `flush()`
- `static/style.css` — explicit `max-height: none` / `overflow-y: visible` on stream bodies
- `tests/test_claudia_cli_mirror_ui.py` — HERMES preservation and truncation regression tests
- `docs/claudia_console_reform/cli_mirror_hermes_output_truncation_regression_fix.md` — this note

## Behavior changed

- All non-empty HERMES chunks append immediately to the group raw buffer (`buffer += rawChunk`) in order.
- Role boundary creates a new group without clearing prior group content.
- Visible deduplication disabled in the live transcript renderer.
- Partial tool-list/skill-list PTY fragments no longer classified as noise when they contain substantive characters.
- Paint queue retained in helpers (with `flush()`) for tests; live path uses immediate append for correctness.

## Behavior intentionally unchanged

- Core PTY APIs, Hermes, session lifecycle, auth, Gateway routes, Console Mode, backend runtime
- RESPONSE separate from HERMES grouping
- Raw transcript debug (all events, unmodified)
- Session controls, minimize/expand, split-word reassembly, ANSI stripping
- Single HERMES label per consecutive HERMES run

## Truncation fix policy

Every non-empty visible HERMES event appends to the current HERMES group buffer. Never replace the buffer with a single chunk. Never drop queued/pending text on role transition.

## Deduplication policy

Visible transcript deduplication **disabled** in `claudiaCliMirror.js`. Identical consecutive spinner redraws may repeat in the styled view; raw debug still captures all events. Helper `shouldCollapseDuplicate` remains for potential future use but is not applied to visible grouping.

## Paint queue policy

Live transcript rendering uses **immediate append** (correctness over animation). `createTranscriptPaintQueue` kept in helpers with a `flush()` method for unit tests and optional future re-enablement.

## CSS clipping policy

Stream group bodies: `max-height: none`, `overflow-y: visible`. Transcript container retains vertical scroll (`overflow-y: auto`); full group content expands within scrollable area.

## Tests / checks run

```bash
bash -n start-macos.sh
python3 -m compileall -q app.py core routes src
node --check static/js/claudiaCliMirror.js
node --check static/js/claudiaCliMirrorHelpers.js
venv/bin/python -m pytest -q tests/test_claudia_cli_mirror_ui.py
```

## Risks

- Disabling visible dedupe may show repeated identical spinner/status redraw lines in the styled transcript.
- Immediate append removes progressive paint animation for large bursts (acceptable tradeoff).

## Recommended live smoke test

1. Restart Console and hard refresh.
2. Start CLI Mirror session.
3. Confirm full Hermes startup banner, tool list, and skills output appear in **one complete HERMES group**.
4. Confirm RESPONSE welcome/tip appears as a separate **RESPONSE** block.
5. Confirm subsequent HERMES prompt/status appears as a new **HERMES** block.
6. Toggle raw transcript — all chunks still present.

## Matrix 1 — Truncation root cause

| Possible cause | Finding | Fix applied |
|----------------|---------|-------------|
| Empty/noise filtering | Partial fragments could be hidden | Relaxed `isRawNoise` for substantive text |
| Deduplication | Could skip identical normalized chunks | Removed visible dedupe from mirror renderer |
| Buffer overwrite | Not observed | Confirmed append-only via `appendTranscriptGroupBuffer` |
| Paint queue dropping | **Confirmed** — cleared on role change | Immediate append; queue `flush()` for tests |
| ANSI normalization | Not truncating content | No change |
| CSS clipping | Not the cause | Explicit no clip on stream bodies |
| Role transition | Triggered queue cancel | Immediate append avoids pending loss |

## Matrix 2 — HERMES preservation

| Event sequence | Expected visible result |
|----------------|-------------------------|
| HERMES chunk1, chunk2, chunk3 | 1 HERMES group with all chunks |
| HERMES split word across chunks | Joined in one HERMES group |
| HERMES ANSI split across chunks | Normalized, full text in HERMES group |
| HERMES, RESPONSE | Full HERMES then RESPONSE |
| HERMES, RESPONSE, HERMES | Three groups, all content visible |
| Empty HERMES event | Skipped (raw debug only) |

## Matrix 3 — Preserved behavior

| Behavior | Must remain true |
|----------|------------------|
| RESPONSE separate from HERMES | Yes |
| Consecutive RESPONSE chunks merge | Yes |
| Raw debug unmodified | Yes |
| No repeated HERMES labels per run | Yes |
| Split words join | Yes |
| ANSI fragments hidden | Yes |
| Session controls unchanged | Yes |
| No backend changes | Yes |
