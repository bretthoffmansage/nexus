# Package Bridge 13 — CLI Registry Transcript Pagination UI Alignment

| Field | Value |
|-------|-------|
| **Package** | Bridge 13 — CLI Registry Transcript Pagination UI Alignment |
| **Date** | 2026-06-03 |
| **Repo** | `console` |

## Objective

Align Console CLI Mirror UI with Core Bridge 13 registry-backed session history and transcript pagination, while preserving Bridge 11B reattach behavior.

## Files changed

| File | Change |
|------|--------|
| `static/js/nexusCliMirror.js` | Active/stopped sections, multi-console copy, load-older transcript, event counts |
| `static/js/nexusCliMirrorHelpers.js` | Session list note for one-active + multi-console |
| `static/style.css` | Section titles, multi-console note, pagination bar |
| `src/nexus_client.py` | Transcript `before_seq` / `after_seq` relay |
| `routes/nexus_routes.py` | Gateway transcript pagination params |
| `tests/test_nexus_cli_mirror_ui.py` | Bridge 13 static tests |

## Session list / history changes

- **Active session** section for running/starting rows with Attach
- **Stopped / viewable** section with View transcript
- Shows `output_event_count`, idle, timestamps
- Shows `resume_unavailable_reason` on stopped rows (no Resume button)
- Multi-console note in Session setup area

## Transcript pagination behavior

- Initial load: `GET .../transcript?limit=200`
- If `has_more_before`: **Load older transcript** button uses `before_seq`
- Older cards prepended without full transcript reset
- Bridge 11B reattach unchanged

## Multi-console model copy

> One CLI Mirror session can run at a time. Multiple Console clients can attach to the same running session. Use Simple Chat for separate one-shot requests from other devices.

## Tests / checks run

```bash
cd console
pytest tests/test_nexus_cli_mirror_ui.py tests/test_nexus_cli_relay.py tests/test_nexus_messages.py -q
node --check static/js/nexusCliMirror.js static/js/nexusCliMirrorHelpers.js
```

## Manual smoke instructions

Same as Core Bridge 13 doc — verify two Console clients attach to one live session; after Core restart stopped history + transcript view works; Simple Chat concurrent requests safe.

## Known limitations

- No Resume action (Core does not implement resume)
- Load older prepends cards only (raw drawer not paginated)
- Session title remains Core-owned read-only after start

## Next recommended package

**STOP after Bridge 13 operator smoke.** Do not proceed to Hermes native resume until smoke passes.
