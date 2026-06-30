# CLI Mirror Transcript Rendering Cleanup Pass

**Package / pass name:** CLI Mirror Transcript Rendering Cleanup Pass  
**Date / time:** 2026-06-03 (local)  
**Repo path:** `/Users/bretthoffman/Documents/claudia_console`

## Root cause

1. **Incomplete text extraction** — `classifyStreamEvent()` only read `raw`, `text`, `message`, and `content`. Core/registry transcript events often store body text in `delta`, `data`, `output`, `line`, or nested `payload.*` fields. Labels (HERMES / RESPONSE) rendered while body text was empty.
2. **Whitespace-only events** — `visible: Boolean(text)` treated whitespace as visible, producing label-only cards.
3. **CSS class bleed** — Transcript rows used chat classes (`msg-ai`, `body`) that could interfere with mirror-specific layout.

## Files changed

| File | Change |
|------|--------|
| `static/js/claudiaCliMirrorHelpers.js` | Added `extractTranscriptText()`, `hasVisibleTranscriptText()`; improved `classifyStreamEvent()`; updated labels; raw drawer uses full extraction |
| `static/js/claudiaCliMirror.js` | `_renderCard()` skips empty label-only rows; removed chat `body` class from transcript pre |
| `static/style.css` | Explicit transcript body color/display; mirror card input/output styling |
| `tests/test_claudia_cli_mirror_ui.py` | Extraction and empty-row static/Node tests |
| `docs/claudia_console_reform/cli_mirror_transcript_rendering_cleanup.md` | This note |

## Behavior changed

- Live Hermes Transcript extracts text from common event shapes and renders readable rows with label + content.
- Empty / label-only / noop status / heartbeat events are hidden from the main transcript.
- Labels normalized: USER, HERMES, RESPONSE, SYSTEM, etc.
- Raw transcript debug still records all events (verbose JSON fallback when no text extracted).

## Behavior intentionally unchanged

- Core PTY/session APIs, Gateway routes, auth, Console Mode
- Session start/stop, attach, stream reconnect
- Raw transcript drawer (collapsed by default)
- Session controls and Send input to Hermes panel

## Transcript event extraction policy

Priority in `extractTranscriptText()`:

1. Top-level: `text`, `content`, `message`, `delta`, `output`, `line`, string `data`, `raw`
2. Nested: `payload.*` and object `data.*` for the same fields
3. String payloads rendered directly
4. `lines[]` arrays joined with newlines

All values pass through `sanitizeTranscriptText()` (ANSI/control strip + redaction in display meta).

## Empty event handling

- `hasVisibleTranscriptText()` requires non-whitespace after sanitize/trim
- `classifyStreamEvent()` marks empty/noise/noop status as `raw_noise`, `visible: false`
- `_renderCard()` returns early when display text is empty (except status/stopped/error/warning categories)

## Tests / checks run

```bash
bash -n start-macos.sh
python3 -m compileall -q app.py core routes src
venv/bin/python -m pytest -q tests/test_claudia_cli_mirror_ui.py
```

**Results:** 42 passed (`tests/test_claudia_cli_mirror_ui.py`); `bash -n start-macos.sh` OK; `compileall` OK.

## Risks

- Unknown future Core event shapes may still need adapter fields added to `extractTranscriptText()`.
- Aggressive noop status filtering may hide useful short status strings (unlikely in operator use).
- Dedup collapse still applies to identical consecutive chunks.

## Recommended live smoke test

1. Restart Console and hard-refresh browser.
2. Open CLI Mirror, start a session.
3. Send `/help` or a short prompt via Send input to Hermes.
4. Confirm Live Hermes Transcript shows readable multi-line text under HERMES/USER/RESPONSE labels — not empty bordered rows.
5. Expand Raw transcript to verify verbose events still available for debug.

---

## Matrix 1 — Transcript rendering

| Event shape | Before | After |
|-------------|--------|-------|
| `content` / `text` / `message` | Rendered when present | Unchanged (primary path) |
| `delta` / `output` / `line` / string `data` | Often label-only row | Text extracted and rendered |
| `payload.content` / nested `data.content` | Often label-only row | Text extracted and rendered |
| String event | Not handled | Rendered directly |
| Empty / label-only event | Empty HERMES/RESPONSE row | Skipped in main transcript |
| Raw debug event | Raw line with partial fields | Full payload JSON fallback in raw drawer |

## Matrix 2 — UI sections

| Section | Before | After |
|---------|--------|-------|
| Live Hermes Transcript | Many empty label rows | Readable chronological transcript |
| Raw transcript | Partial text in raw lines | Full extraction + JSON fallback |
| Session controls | Unchanged | Unchanged |
| Send input panel | Unchanged | Unchanged |
