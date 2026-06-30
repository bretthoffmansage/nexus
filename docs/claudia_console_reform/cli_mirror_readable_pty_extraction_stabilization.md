# CLI Mirror Readable PTY Extraction Stabilization Pass

**Date:** 2026-06-03  
**Repo:** `/Users/bretthoffman/Documents/claudia_console`  
**Scope:** Console UI only — stabilize styled transcript after user messages

## Root cause found

The styled transcript classifier operated on lightly normalized PTY text (`normalizeTerminalText`) rather than a dedicated readable-display extraction layer. After user send, Hermes emits terminal redraw streams: cursor show/hide toggles, bracketed-paste modes, cursor-position fragments, and orphan SGR color leftovers often survived normalization as visible strings like `[?25h`, `38;5;136m`, or `[79C`. Those fragments were classified as HERMES and rendered as broken groups. At the same time, meaningful post-send chunks (status bars, synthesizing lines, answer prose inside answer boxes) were sometimes skipped or misclassified because classification mixed raw redraw residue with real content.

Startup worked because it is mostly append-only banner output. Post-send output is a redraw stream that cannot be treated as clean display chunks without extraction.

## Files changed

- `static/js/claudiaCliMirrorHelpers.js` — `extractReadablePtyText`, `isControlDebrisOnly`, orphan control stripping, `classifyHermesOutputText` uses readable extraction, `hasVisibleTranscriptText` hardened
- `static/js/claudiaCliMirror.js` — group body fallback uses `extractReadablePtyText`
- `tests/test_claudia_cli_mirror_ui.py` — control debris, status/synthesizing, answer-box, post-send sequence, startup regression tests
- `docs/claudia_console_reform/cli_mirror_readable_pty_extraction_stabilization.md` — this note

## Behavior changed

- Styled transcript classification uses **clean display text** from `extractReadablePtyText`, not raw PTY bytes
- Pure control debris (`[?25h`, `[?7h`, cursor moves, orphan SGR fragments) is skipped — no visible HERMES groups
- Meaningful status/progress, synthesizing/ruminating, interrupt hints, and in-box status remain visible as HERMES
- Answer prose inside answer-box state renders as RESPONSE after readable extraction
- Chunks with both debris and meaningful text keep the meaningful text after stripping

## Behavior intentionally unchanged

- Raw debug remains full-fidelity (uses `extractTranscriptText` / `normalizeTerminalText`, not readable extraction)
- Startup banner/tools/skills → HERMES; Welcome/Tip → RESPONSE
- USER appears once immediately; PTY `●` echo suppressed
- Answer-box state persistence through status redraws
- Full-fidelity HERMES visibility for meaningful CLI activity
- WARNING/ERROR with key redaction
- Core/Hermes/PTY/auth/Gateway/backend untouched
- Compact input panel, expand/minimize unchanged

## Readable PTY extraction policy

For each PTY output event used by the **styled transcript**:

1. Extract raw text from the event payload
2. Strip ANSI CSI sequences, OSC hyperlinks/codes, bracketed-paste toggles
3. Remove orphan control fragments (`[?25h`, `[79C`, `38;5;136m`, etc.)
4. Normalize CRLF / CR / `\r\r\n` into readable lines via carriage-return handling
5. Drop pure control debris; keep box drawing, emoji, progress bars, Unicode prose
6. Classify the resulting `displayText`

Preserved visible characters include: `╭ ╮ ╰ ╯ ─ │ ⚕ ❯ ░ █ ⏲ ⏱` and readable Unicode.

## Control debris suppression policy

`isControlDebrisOnly(displayText)` returns true for standalone fragments such as:

- `[?25h`, `[?7h`, `[?2004h`, `[?2004l`
- `[2 q`, `[0 q`, `[K`, `[J`, `[79C`, `[4D`, `[3A`
- Orphan SGR leftovers: `38;5;136m`, `5;136m`
- ANSI-only chunks with no visible content after extraction

These never create styled transcript groups. If a chunk mixes debris with prose, debris is stripped and prose is kept.

## Answer-box classification policy

Pattern/state based — **runtime does not use event sequence numbers**:

- After user input, a line containing `╭` and `⚕ Hermes` opens answer-box state (not startup `Hermes Agent` banner)
- While in answer-box: status/progress → HERMES; answer prose → RESPONSE; control-only → skip
- A line containing `╰` and repeated `─` closes answer-box state
- New distinct USER input clears stale answer-box state
- State is not cleared by cursor/status/control chunks

## Full-fidelity HERMES visibility policy

Meaningful Hermes CLI activity remains visible:

- Model/status/progress bars
- `msg=interrupt` / queue / steer / Ctrl+C hints
- Synthesizing / ruminating / deliberating lines
- Tool output, separators, prompt glyphs
- In-box status redraws (merged into HERMES groups)

Only **pure** terminal control debris is hidden from styled transcript.

## Dynamic pattern matching policy

All classification is pattern/state based on normalized display content and classifier state (`inHermesAnswerBox`, `hasUserSentInput`, echo dedupe windows). Runtime logic does not use sequence numbers. Debug sequence numbers in fixtures are examples only.

## Tests/checks run

```bash
bash -n start-macos.sh
python3 -m compileall -q app.py core routes src
node --check static/js/claudiaCliMirror.js
node --check static/js/claudiaCliMirrorHelpers.js
venv/bin/python -m pytest -q tests/test_claudia_cli_mirror_ui.py
```

## Risks

- Over-aggressive orphan stripping could remove edge-case visible content if it resembles control fragments
- Very short answer lines (`yes`, `ok`) rely on answer-box prose heuristics — monitored by tests
- Heavy ANSI status lines depend on extraction preserving box-drawing and progress bar characters

## Recommended live smoke test

1. Restart Console and hard refresh
2. Start CLI Mirror session
3. Send: `hi! im brett. what is your name`
4. Confirm:
   - USER appears once immediately
   - HERMES shows meaningful status/synthesizing/progress (not `[?25h`)
   - RESPONSE shows answer prose (e.g. `hey brett! i'm chatgpt…`)
   - WARNING shows auxiliary title warning if present
   - Raw debug still shows full PTY output including control sequences

---

## Matrix 1 — Control debris suppression

| Input | Before | After |
|-------|--------|-------|
| `[?25h` | Visible broken HERMES group | Skipped — no styled group |
| `[?7h` | Possible visible debris | Skipped |
| `[?2004h` / `[?2004l` | Possible visible debris | Skipped |
| `[79C` / `[4D` / `[3A` | Possible visible debris | Skipped |
| `38;5;136m` orphan | Possible visible color fragment | Skipped |
| ANSI-only chunk | Blank or debris group | Skipped |
| Status line with ANSI + meaningful text | Sometimes debris-only misread | Visible HERMES with clean text |
| Box drawing line (`╭─ ⚕ Hermes`) | Visible (opener) | Visible — opens answer-box state after user input |

## Matrix 2 — Post-send transcript behavior

| Event/text | Before | After |
|------------|--------|-------|
| USER input | Once, immediate | Unchanged — once, immediate |
| PTY echo with `●` user text | Sometimes duplicate USER | Suppressed when matching recent USER |
| Status/progress line | Sometimes hidden or debris | Visible HERMES |
| Synthesizing/ruminating line | Sometimes missing | Visible HERMES |
| Answer-box opener | State set; border skipped | Unchanged — state set after user input |
| Answer prose | Sometimes missing | Visible RESPONSE |
| Answer-box closer | Closes state | Unchanged |
| Auxiliary warning | Visible WARNING | Unchanged — visible WARNING with redaction |
| Control-only `[?25h` | Broken visible HERMES | Skipped entirely |

## Matrix 3 — Preserved behavior

| Behavior | Must remain true |
|----------|------------------|
| Startup banner remains HERMES | Yes |
| Welcome/Tip remains visible | Yes — RESPONSE |
| USER appears once immediately | Yes |
| RESPONSE separate from HERMES | Yes |
| Meaningful HERMES activity visible | Yes |
| No blank/control-debris groups | Yes |
| Raw debug unchanged | Yes |
| Compact input panel unchanged | Yes |
| Expand/minimize unchanged | Yes |
| Core/Hermes untouched | Yes |
