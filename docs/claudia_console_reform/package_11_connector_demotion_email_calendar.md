# Package 11 — Connector demotion pass 1: email/calendar write safety

| Field | Value |
|-------|-------|
| **Package** | Package 11 — Connector demotion pass 1: email/calendar write safety |
| **Date/time** | 2026-06-02 |
| **Repo path** | `/Users/bretthoffman/Documents/odysseus` |
| **Prior notes** | `package_00` … `package_10_approval_queue_routes_ui.md` |

## Objective

When `CLAUDIA_CONSOLE_MODE=true`, block direct external email and calendar writes (SMTP send, IMAP mailbox mutations, scheduled send queueing, CalDAV/local event CRUD that can writeback). Preserve read/list surfaces and internal date/time metadata (parsing, `dtstart`/`dtend` on packets, ICS import to local DB, calendar `quick-parse`).

## Files changed

| File | Change |
|------|--------|
| `src/connector_console_guard.py` | **New** — `block_connector_write()` / `connector_write_disabled()` |
| `routes/email_routes.py` | Guards on send, schedule, draft, IMAP mutators |
| `routes/calendar_routes.py` | Guards on create/update/delete events |
| `tests/test_claudia_connector_email_calendar_guards.py` | **New** |
| `docs/claudia_console_reform/package_11_connector_demotion_email_calendar.md` | **New** |

## Behavior changed

### Email (`CLAUDIA_CONSOLE_MODE=true`)

Blocked before SMTP/IMAP work: `POST /send`, `POST /schedule`, `POST /draft`, mailbox flag/move/delete/archive routes.

Returns `status: connector_write_disabled` with `connector: email` and `operation` name.

### Calendar (`CLAUDIA_CONSOLE_MODE=true`)

Blocked before DB/writeback: `POST /events`, `PUT /events/{uid}`, `DELETE /events/{uid}`.

Returns `status: connector_write_disabled` with `connector: calendar`.

### Legacy mode

Unchanged when `CLAUDIA_CONSOLE_MODE` is off.

## Behavior intentionally unchanged

- Package 1 email pollers remain off in Console Mode (unchanged).
- Email/calendar **read** routes (list, read, search, attachments, folders, contacts).
- `GET /api/calendar/events`, `POST /api/calendar/sync` (pull from CalDAV).
- `POST /api/calendar/import` (local DB + date metadata).
- `POST /api/calendar/quick-parse` (NL date/time parsing for UI).
- Local calendar list/create/update/delete **calendar containers** (no CalDAV writeback on those handlers).
- `POST /api/email/compose-upload` (local staging).
- `POST /api/email/ai-reply`, `POST /summarize`, `POST /extract-style` (LLM assist, no send — not in scope for P11).
- `unflag-spam` (local SQLite tags only).
- Claudia Gateway, chat bridge, upload bridge, approval routes.

## Email/calendar routes reviewed

All routes under `/api/email/*` and `/api/calendar/*` in `routes/email_routes.py` and `routes/calendar_routes.py`; poller autonomy via `routes/email_pollers.py` (Package 1).

## Email/calendar route classification matrix

| Route or pattern | Connector | Classification | Console Mode behavior | External write in Console Mode? |
|------------------|-----------|----------------|------------------------|----------------------------------|
| `POST /api/email/send` | email | external write | blocked | **No** |
| `POST /api/email/schedule` | email | external write (queued send) | blocked | **No** |
| `POST /api/email/draft` | email | IMAP draft append | blocked | **No** |
| `POST /api/email/mark-read`, `mark-unread` | email | IMAP flag write | blocked | **No** |
| `POST /api/email/archive`, `move` | email | IMAP move | blocked | **No** |
| `DELETE /api/email/delete*`, `odysseus/reminders` | email | IMAP delete | blocked | **No** |
| `POST /api/email/mark-answered`, `clear-answered` | email | IMAP flag write | blocked | **No** |
| `POST /api/email/compose-upload` | email | local staging | allowed | **No** |
| `GET /api/email/list`, `read`, `search`, attachments | email | read | allowed | **No** |
| `POST /api/email/ai-reply`, `summarize`, `extract-style` | email | LLM assist (no send) | allowed* | **No** |
| `POST /api/email/{uid}/unflag-spam` | email | local DB tag | allowed | **No** |
| Email pollers (startup) | email | autonomous | disabled (P1) | **No** |
| `POST /api/calendar/events` | calendar | event create (+ CalDAV writeback) | blocked | **No** |
| `PUT /api/calendar/events/{uid}` | calendar | event update (+ writeback) | blocked | **No** |
| `DELETE /api/calendar/events/{uid}` | calendar | event delete (+ writeback) | blocked | **No** |
| `GET /api/calendar/events` | calendar | read (local DB + RRULE expand) | allowed | **No** |
| `POST /api/calendar/sync` | calendar | CalDAV pull (read into DB) | allowed | **No** |
| `POST /api/calendar/import` | calendar | local ICS import (metadata) | allowed | **No** |
| `POST /api/calendar/quick-parse` | calendar | internal date/time parse | allowed | **No** |
| `POST/PUT/DELETE /api/calendar/calendars*` | calendar | local calendar metadata | allowed | **No** |
| `GET /api/calendar/calendars`, `export` | calendar | read | allowed | **No** |
| `POST /api/calendar/config`, `test` | calendar | settings / probe | allowed† | **No** |

\*LLM routes not demoted in P11 (connector-write focus); may be addressed in a later model-routing package.  
†Config/test may contact remote server but do not send mail or mutate calendar events via guarded paths.

## Internal date/time behavior preserved

### Reviewed and preserved

- **`POST /api/calendar/quick-parse`** — Parses natural language into `dtstart`/`dtend` for UI; uses utility LLM for **metadata only**, not CalDAV write.
- **`POST /api/calendar/import`** — ICS import stores events in local SQLite with timezone-aware `dtstart`/`dtend`; no CalDAV writeback in import path.
- **`GET /api/calendar/events`** — Reads/expands RRULE occurrences for display; internal scheduling view.
- **Packet envelopes (Packages 4–8)** — `created_at`, chat `reply_channel`, upload source packets unchanged; Claudia packets may still carry requested dates/times.
- **Task due dates / reminders** — Not globally disabled; task scheduler already off in Console Mode (Package 1).
- **`POST /api/email/schedule` validation** — Parses ISO8601 `send_at` but route is **blocked** before insert (no autonomous dispatch without Core).

### Guarded (external vs internal)

- **External writes** — SMTP send, IMAP mutations, event CRUD that triggers `writeback_event`, scheduled email DB insert for later poller dispatch.
- **Why different** — Internal metadata describes *when* something should happen; external writes *execute* on connectors without Claudia Core governance.

## Console Mode blocked response behavior

```json
{
  "ok": false,
  "success": false,
  "status": "connector_write_disabled",
  "claudia_console_mode": true,
  "connector": "email",
  "operation": "send",
  "message": "Claudia Console Mode is active. Direct connector writes are disabled. Route this request through Claudia Core approval/governance.",
  "guidance": "Route connector write requests through Claudia Core approval and governance. Use Claudia Gateway packets (intake, messages, source packets) for intake."
}
```

Does not claim Core handled the action. No packet auto-creation in this package (documented follow-up).

## Read-only surfaces preserved

Email list/read/search/attachments/folders; calendar list/events/sync pull; compose-upload staging; account/config reads.

## External-write surfaces guarded

Email send, schedule, draft, IMAP mutators; calendar event create/update/delete.

## Poller/autonomy status

`inprocess_pollers_enabled()` remains `False` when `CLAUDIA_CONSOLE_MODE=true` (Package 1). Scheduled-email poller would not dispatch in Console Mode even if rows existed; `POST /schedule` is now blocked at intake.

## Safety guarantees

1. Guards only when `CLAUDIA_CONSOLE_MODE=true`.
2. Guards run before SMTP/IMAP/CalDAV writeback helpers.
3. Legacy mode unchanged.
4. No `stream_agent_loop` or connector execution from guard paths.
5. Packages 1–10 tests pass.

## Tests / checks run

```bash
python3 -m compileall -q app.py core routes src
venv/bin/python -m pytest -q \
  tests/test_claudia_connector_email_calendar_guards.py \
  tests/test_claudia_approval_routes.py \
  tests/test_claudia_dashboard_skeleton.py \
  tests/test_claudia_upload_processing_guards.py \
  tests/test_claudia_upload_bridge.py \
  tests/test_claudia_source_worker_routes.py \
  tests/test_claudia_messages.py \
  tests/test_claudia_chat_demotion.py \
  tests/test_claudia_gateway_routes.py \
  tests/test_claudia_token_scopes.py \
  tests/test_claudia_packets.py \
  tests/test_claudia_console_mode.py
```

**Results:** compileall pass; **107 passed**.

## Known pytest baseline issue (Package 0)

Full-suite `pytest --collect-only` still has 2 pre-existing collection errors:

- `tests/test_chat_image_routing.py`
- `tests/test_webhook_ssrf_resilience.py`

## Risks

- LLM email assist routes (`ai-reply`, `summarize`) still call models in Console Mode (not connector writes).
- Local calendar/ICS data can still be edited in DB via import; operators cannot create events via API until Core routing exists.
- Cancel scheduled email (`DELETE /scheduled/{id}`) still mutates local schedule DB only.

## Follow-ups

- Optional: auto-create Claudia task/intake packet on blocked write.
- Package 12: shell/MCP/file/research demotion.
- Demote or route LLM connector-assist paths through Core in a later package.

## Next recommended package

**Package 12 — Connector demotion pass 2: shell/MCP/file/research safety**
