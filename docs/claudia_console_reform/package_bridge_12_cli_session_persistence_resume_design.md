# Package Bridge 12 — CLI Mirror Session Persistence and Resume Design

| Field | Value |
|-------|-------|
| **Package** | Bridge 12 — CLI Mirror Session Persistence and Resume Design |
| **Date** | 2026-06-03 |
| **Repo** | `console` |
| **Type** | Design alignment (no Console code changes in Bridge 12) |

## Objective

Align Console CLI Mirror UX and persistence expectations with the Core Bridge 12 design **before** implementing session history, registry-backed transcript pagination, or Hermes native resume. Preserve Bridge 11B reattach behavior.

## Current state

| Behavior | Status |
|----------|--------|
| Simple Chat \| CLI Mirror top-bar toggle | Bridge 11B |
| Session title vs Hermes input clarity | Bridge 11B |
| localStorage mode + last session ID | `console_interaction_mode`, `console_cli_mirror_session_id` |
| Reattach on mode return / refresh / focus | `_resumeCliMirror()` — live Core registry only |
| Leave CLI Mirror without stopping PTY | Bridge 11B |
| Attach to running session | Manual attach card + list buttons |
| View stopped transcript | “View transcript” on stopped rows |
| 409 start conflict | Attach card; transcript preserved |
| Hermes native resume | **Not in Console** |
| Session history beyond Gateway list | **Not implemented** |
| Transcript pagination | Fixed `limit=200` reload |

Gateway relay paths unchanged: `/api/nexus/v1/cli/sessions/*` → Core `/hermes/sessions/*`.

---

## Audit findings (Console)

### localStorage today

| Key | Purpose | Limit |
|-----|---------|-------|
| `console_interaction_mode` | `simple_chat` \| `cli_mirror` | Mode only |
| `console_cli_mirror_session_id` | Last attached session | Single ID; no history |

After **Core restart**, Bridge 11B reattach → 404 → alert + clear ID. JSONL may still exist on Core disk but Console cannot see it until Bridge 13 registry.

### Fields Console already consumes

From `summarizeSessions()` / list rendering:

- `session_id`, `title`, `status`, `phase`
- `started_at`, `last_activity_at`, `idle_seconds`
- List meta: `can_start_new`, `active_session_id`, `attachable_session_ids`, `cleanup_policy`

From `_resumeCliMirror()` / attach:

- `GET /cli/sessions/{id}` metadata
- `GET .../transcript?limit=200`
- SSE stream with `after_seq`

### Gaps for persistence/resume UX

1. No **Active / Stopped** section grouping in list
2. No **Resume** action (only Attach / View transcript)
3. No display of `output_event_count`, transcript size, or `hermes_session_id`
4. No “resume unavailable” reason from Core
5. Full transcript reload on every resume (flicker)
6. No pagination / load older
7. No post–Core-restart history (empty list)
8. `attachable_session_ids` parsed but underused in UI
9. Multi-tab / multi-operator not coordinated

---

## Attach vs resume vs view transcript (Console terms)

| Operator action | Console behavior today | Future (post Bridge 13–14) |
|-----------------|------------------------|----------------------------|
| **Attach** | Reconnect to running session: transcript + SSE | Same; also after tab return (11B) |
| **View transcript** | `_attachSession(stopped)` — read-only cards, input disabled | Same; backed by JSONL pagination |
| **Resume** | Not offered | Button when Core `resumable: true`; creates **new** Nexus session linked to `hermes_session_id` |

**Preserve Bridge 11B:** switching to Simple Chat must **not** stop Core PTY; returning to CLI Mirror must reattach to last ID when registry knows it.

---

## Proposed Console UX model

### Session history list (Bridge 13+ UI)

```
┌─ Active ─────────────────────────────────────┐
│ ● Running — "Operator smoke"  [Attached]   │
│   Idle 12s · 84 events · Attach             │
└──────────────────────────────────────────────┘

┌─ Stopped ────────────────────────────────────┐
│ ○ Stopped — "CLI Mirror Session …"         │
│   [View transcript]  [Resume] (if resumable)│
│   or "Resume unavailable: …"               │
└──────────────────────────────────────────────┘
```

Rules:

- **One active session note** at top when `can_start_new === false`
- **Do not auto-resume** stopped sessions — operator clicks Resume
- **Do auto-reattach** (11B) only for last **attached** session ID when returning to CLI Mirror mode
- Show `idle_seconds`, `output_event_count`, optional transcript event count
- Show `resume_unavailable_reason` when `resumable === false` and session stopped
- 409 on start → existing conflict card (unchanged)

### Mode switch / reattach (unchanged in Bridge 12)

| Event | Console action |
|-------|----------------|
| → Simple Chat | Close EventSource; persist session ID |
| → CLI Mirror | `_resumeCliMirror()`: list, GET, transcript, stream |
| Page refresh | Restore mode + resume |
| Core restart + 404 | Friendly message; refresh list; attach card if running |

### Transcript loading (future)

1. Initial: `limit=100` recent events
2. Scroll / “Load older”: `before_seq`
3. Live: SSE `after_seq` from last rendered seq
4. Avoid full DOM reset when merging pages (reduce 11B flicker)

---

## Persistence model alignment

Console should treat **Core registry as source of truth** (Bridge 13):

| Source | Role |
|--------|------|
| Core `GET /cli/sessions` | History list after restart |
| Core `GET /cli/sessions/{id}` | Attach/resume eligibility |
| localStorage session ID | Hint for 11B reattach only |
| localStorage mode | UI mode preference |

On 404: clear local ID (11B) and show registry-backed history if available.

---

## Proposed lifecycle presentation

| Core `status` / `phase` | Console chip | Primary actions |
|-------------------------|--------------|-----------------|
| `running` / `idle` | Running / Idle | Attach, Send input, Stop, Ctrl+C |
| `starting` | Starting | Attach (wait) |
| `stopped` | Stopped | View transcript; Resume if `resumable` |
| `failed` | Failed | View transcript if `viewable` |
| Active conflict | Warning note | Attach; disable Start |

---

## Gateway / API expectations (future fields)

Bridge 12 Core adds (Console should consume in Bridge 13+):

```json
{
  "viewable": true,
  "resumable": false,
  "resume_unavailable_reason": "Hermes native session ID was not captured from PTY output.",
  "attachable": false,
  "output_event_count": 42,
  "hermes_session_id": null
}
```

Future endpoints:

- `POST /api/nexus/v1/cli/sessions/{id}/resume`
- Transcript: `?before_seq=&after_seq=&limit=`

No Gateway changes in Bridge 12.

---

## One-active-session rule (Console copy)

Display when `can_start_new === false`:

> One CLI Mirror PTY session can run at a time. Attach to the active session or stop it before starting another.

Resume (future) blocked with same rule if another session active.

---

## Risk analysis (Console-specific)

| Risk | Mitigation |
|------|------------|
| Operator confuses Attach vs Resume | Separate buttons + helper text in Bridge 13 UI |
| localStorage points to deleted session | 404 flow (11B) + registry list |
| Full transcript reload flicker | Incremental pagination (Bridge 13+) |
| Resume clicked without credentials | Show Core/Hermes error honestly |
| Stale attach after Core restart | Empty active section + attach offer |

---

## Bridge 12 Console code changes

**None.** Design alignment only. Bridge 11B behavior preserved.

---

## Tests / checks run

```bash
cd console
pytest tests/test_nexus_cli_mirror_ui.py tests/test_nexus_cli_relay.py tests/test_nexus_messages.py -q
node --check static/js/nexusCliMirror.js static/js/nexusCliMirrorHelpers.js
```

Confirms no regression from Bridge 12 (Console unchanged).

Future Bridge 13 Console tests should assert:

- Rendering of `viewable` / `resumable` / `resume_unavailable_reason`
- Active vs Stopped sections
- Resume button disabled when `resumable === false`

---

## Recommended next package

**Bridge 13 — Core CLI Session Registry and Transcript Pagination**

Console work in Bridge 13 (minimal):

- Consume registry-backed list after Core restart
- Optional: show new metadata fields in session list
- Still **no** Resume button until Bridge 14

**Bridge 14 (proposed):** Console Resume UX + Gateway relay for `POST .../resume`.

---

## Manual smoke (unchanged)

Bridge 11B smoke remains valid. After Bridge 13, add:

- Stop session → restart Core → confirm stopped session appears in list
- View transcript from registry-backed JSONL
- Confirm 11B reattach still works for **live** running session without mode switch stop
