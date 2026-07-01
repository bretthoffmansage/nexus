# Nexus Calendar Scheduled Task Dispatch v1

Package: `nexus_calendar_scheduled_task_dispatch_v1`

## Previous Calendar architecture

The Calendar page (`components/workspace/port/CalendarWorkspace.tsx`) was a legacy port of `static/js/calendar.js`:

- Month grid UI only; week/agenda showed empty Connector-required states.
- All controls disabled when `calendarAdapterMeta.availability === "connector_required"`.
- `ToolAvailabilityBanner` displayed “Connector required”.
- Copy referenced CalDAV, `.ics` import, and Claudia local calendar store.
- `lib/adapters/calendar/adapter.ts` returned stub failures for `listCalendars` / `listEvents`.
- `lib/navigation/toolRegistry.ts` marked calendar `connector_required`.
- **No Convex persistence** — no `nexusScheduledEvents` table or scheduler.

## Final Calendar architecture

Nexus owns a **private per-user scheduled-event store** in Convex (`nexusScheduledEvents`). Each event is a one-time future task definition. A **server-side recurring cron** (60s) on Convex:

1. Marks past-due `scheduled` events as `due`.
2. Atomically dispatches eligible due events into the existing global `nexusTasks` queue.
3. Reconciles linked task status and recovers stale dispatch claims.

Claudia receives normal queued tasks; no calendar-specific Connector protocol. The browser never fires schedules.

```
User → Calendar UI → Convex CRUD (nexusScheduledEvents)
                              ↓ (at/after scheduledForUtc)
                     Cron dispatcher → nexusTasks + queueSequence
                              ↓
                     Claudia Connector (unchanged P6 claim/execute)
                              ↓
                     Status/result projected back onto event
```

## Event schema

Table: `nexusScheduledEvents`

| Area | Fields |
|------|--------|
| Identity | `ownerClerkUserId`, `_id`, `createdAt`, `updatedAt`, `createdBy` |
| Presentation | `title`, `description?`, `localScheduledDate`, `localScheduledTime`, `timezone`, `oneTime: true` |
| Task definition | `taskRequest`, `requestedToolId`, `revision` |
| Schedule | `scheduledForUtc` (authoritative UTC instant) |
| Dispatch | `scheduleStatus`, `dispatchState`, `dispatchClaimToken?`, `dispatchStartedAt?`, `dispatchedAt?`, `linkedTaskId?`, `queueSequence?`, `lateDispatch?`, `latenessMs?`, `lastDispatchError?` |
| Projection | `queuedAt?`, `claimedAt?`, `startedAt?`, `completedAt?`, `failedAt?`, `cancelledAt?`, `progressMessage?`, `terminalResultSummary?`, `terminalErrorCode?`, `terminalUserSafeMessage?` |
| Archive | `deletedAt?`, `deletedBy?`, `hiddenFromCalendar?` |

`nexusTasks` extended with optional `scheduledEventId` and `taskKind: "scheduled_task"` metadata.

## Ownership and privacy

- Every event row stores `ownerClerkUserId` from verified Clerk identity.
- All queries/mutations use `requireKnowledgeReader` + `requireOwnedScheduledEvent`.
- Cross-user access returns `scheduled_event_not_found` (no existence leak).
- Scheduler creates tasks with the event owner's `ownerClerkUserId`.
- Clients cannot set `linkedTaskId`, dispatch tokens, or queue sequence.

## Timezone model

- User supplies IANA timezone (default: browser `Intl` timezone).
- Server computes `scheduledForUtc` via `convex/lib/calendarTimezone.ts` (`localDateTimeToUtcMs`).
- Stores `localScheduledDate` (YYYY-MM-DD) and `localScheduledTime` (HH:mm) for calendar display.
- Due comparison uses UTC only.
- Invalid IANA zones and malformed local components reject with `scheduled_event_invalid_time`.

## Scheduler model

`convex/crons.ts` — interval **60 seconds** → `scheduledEventDispatch.runScheduledEventMaintenance`:

1. `markDueScheduledEvents` — `scheduled` → `due` when `scheduledForUtc <= now`
2. `dispatchDueScheduledEvents` — bounded batch (`maxDispatchPerRun: 25`)
3. `reconcileScheduledEvents` — project task status; recover stale `dispatching` claims (5 min timeout)

Configuration: `convex/lib/calendarScheduleConfig.ts`

## Scheduling precision

**Minute-level v1.** A 60s cron means dispatch occurs at or after the scheduled UTC instant, typically within one cron interval (e.g. 3:00 PM scheduled → 3:00–3:01 PM dispatch). Not second-precise.

## Due-event detection

Events eligible when:

- `scheduledForUtc <= now`
- `scheduleStatus` in `scheduled` | `due`
- `dispatchState` not `dispatched`
- no `linkedTaskId`
- not `deletedAt` / `hiddenFromCalendar`

## Exactly-once dispatch

Per event:

1. Atomic claim → `dispatching` + unique `dispatchClaimToken`
2. Check idempotency key `schedule:{eventId}` on `nexusTasks`
3. If task exists, link and skip insert
4. Else allocate `queueSequence`, insert one task, link `linkedTaskId`
5. On insert failure, revert to `undispatched`/`due` for retry

Repeated cron passes and concurrent claims cannot create duplicate tasks for the same event.

## Global queue integration

Uses existing:

- `nexusTasks`
- `nexusQueueCounter` / `allocateQueueSequence`
- Normal claim/start/complete/fail via `connectorTasks.ts`

No `calendarTasks`, `scheduledTaskQueue`, or second counter.

Task metadata:

```json
{
  "kind": "scheduled_task",
  "scheduledEventId": "...",
  "scheduledForUtc": 1234567890,
  "explicitUserAction": "schedule",
  "lateDispatch": true
}
```

## Late-run recovery

If Nexus scheduler was unavailable at the scheduled instant:

- Event stays `due`/`scheduled` with no `linkedTaskId`
- Next cron pass dispatches with `lateDispatch: true`, `latenessMs` recorded
- Original `scheduledForUtc` unchanged
- Claudia offline does **not** block queue creation — task remains `queued`

## Edit rules

Editable while **no `linkedTaskId`** (`scheduled`, `due`, recoverable `dispatching`):

- title, description, taskRequest, tool, date/time, timezone
- Edit increments `revision` and clears dispatch claim state

Not editable after dispatch: task request, tool, schedule time.

## Delete/archive rules

- Future undispatched: soft delete (`hiddenFromCalendar`, `deletedAt`) — never dispatches
- Queued/running: **blocked** from calendar removal (active task continues)
- Completed/failed/cancelled: removable from calendar view; linked task history retained in `nexusTasks` / `nexusTaskResults`

Events remain on calendar until explicitly removed.

## Status projection

| Task status | Event status |
|-------------|--------------|
| (none, future) | `scheduled` |
| (none, past) | `due` |
| claiming | `dispatching` |
| `queued` | `queued` |
| `claimed`/`running`/`cancel_requested` | `running` |
| `completed` | `completed` |
| `failed` | `failed` |
| `cancelled` | `cancelled` |

Projection via `patchScheduledEventForTaskStatus` in `connectorTasks.ts` and reconciliation cron.

## Result projection

Event detail queries `nexusTaskResults` and `nexusTaskSources` through owned task linkage. User-safe answer text and sources only — no lease/HMAC/internal paths.

## UI behavior

- Month view: events on `localScheduledDate`, status icons, click day → create, click chip → detail
- Week/Agenda: disabled in v1 (honest tooltips)
- Quick add: opens schedule dialog (no NL parser)
- Legacy Connector banner and CalDAV copy **removed**
- `toolRegistry` calendar `availability: "available"`

## Requested-tool policy

Allowlist in `CALENDAR_SCHEDULE.allowedScheduledToolIds`:

- `vault.agentic_retrieval`
- `membership_io.transcript_retrieve`

**Excluded v1:** `obsidian.dropzone.process_document` (requires immutable attachment).

## Configuration

`convex/lib/calendarScheduleConfig.ts`:

- `schedulerIntervalSeconds: 60`
- `maxDispatchPerRun: 25`
- `maxReconcilePerRun: 50`
- `dispatchClaimTimeoutMs: 300000`
- Title/task length limits
- Allowed tool IDs

## Tests

`tests/nexus-calendar-scheduled-dispatch.test.ts` — ownership, persistence, timezone, dispatch timing, exactly-once, delete, edit, tool allowlist.

## Live verification

Not performed in this package commit. Manual checklist in product requirements applies.

## Limitations

- One-time events only (no recurrence, CalDAV, `.ics`)
- Month view only (week/agenda disabled)
- ~60s dispatch granularity
- No per-user timezone preference store (timezone per event + browser default)

## Rollback notes

- Remove cron entry in `convex/crons.ts`
- Revert `nexusScheduledEvents` table and UI to legacy adapter
- Existing dispatched tasks remain in `nexusTasks` (safe)
