# Nexus Calendar Deep Research and Cross-App Copy Alignment (v1)

Package: `nexus_calendar_deep_research_and_cross_app_copy_alignment_v1`

## Shared architecture

Direct and scheduled Deep Research converge on one path:

- **Direct:** Deep Research page → `nexusTasks` → Claudia Connector → `research.hermes_deep_research` → terminal result → Deep Research report rendering
- **Scheduled:** Calendar event due → existing Calendar dispatcher → one `nexusTasks` row → same Connector tool → same terminal result → Calendar projection + Tasks + Deep Research history

No second queue, worker, endpoint, research-history table, or Claudia tool was added.

## Strict Claudia metadata

Calendar-dispatched Deep Research uses the same five `taskMetadata` keys as direct submission:

- `kind` = `deep_research`
- `sourcePage` = `nexus_deep_research`
- `explicitUserAction` = `research`
- `researchRequestId`
- `idempotencyKey`

Calendar linkage is stored on Nexus-owned fields (`nexusScheduledEvents`, `nexusTasks.scheduledEventId`, `linkedTaskId`) — not in Claudia `taskMetadata`.

## Calendar scheduled-tool registry

`convex/lib/calendarScheduledTools.ts` adds:

| Field | Value |
|-------|-------|
| Display label | Deep Research |
| Tool ID | `research.hermes_deep_research` |
| Task kind | `deep_research` |
| Input mode | `structured_deep_research` |
| Connector capability | required |

## Calendar form behavior

`CalendarEventDialog` shows scheduling fields plus shared Deep Research inputs (`DeepResearchRequestFields`):

1. Event name
2. Date / Time
3. Timezone
4. Task type
5. Research request + composed character count
6. Report rules (canonical default)
7. Model selector (display only)
8. Notes (optional)

## Report rules reuse

Composition and validation live in `convex/lib/deepResearchRequestCompose.ts` (re-exported to the browser). Calendar stores raw request + optional `deepResearchReportRules` on the scheduled event; dispatch composes final `requestText`.

## Identifier behavior

Server-built on create/dispatch:

- `deepResearchRequestId` on event: `cal-dr-req:{eventId}`
- Execution `idempotencyKey`: `schedule:{eventId}` (existing Calendar architecture)

## Exactly-once dispatch

Repeated five-minute scheduler passes reuse `by_owner_and_idempotency_key` and `linkedTaskId` — at most one task per event fire.

## Deep Research history inclusion

`deepResearch:listMyDeepResearchTasks` filters by `taskKind`, `requestedToolId`, and owner — not by `sourcePage`. Calendar-created tasks appear in Current/Recent Research automatically.

## Tasks page inclusion

Calendar-dispatched tasks are normal `nexusTasks` rows and appear on the Tasks page without a separate list.

## Skills surface update

Deep Research skill surfaces: **Deep Research · Calendar · Connector** (not Chat or Library).

## Copy changes

| Surface | New copy |
|---------|----------|
| Deep Research subtitle | Hermes agent + Web, Transcript, Knowledge Vault runtime |
| Library subtitle | Upload or Create documents to train the Knowledge Vault |
| Tasks notice | Your requests are saved and queued privately in Nexus. Execution waits for the Connector |
| Skills intro | Tools and capabilities available to Nexus to use through Chat, Calendar, Library, or the Connector. |

## Focused tests

- `tests/nexus-calendar-deep-research.test.ts`
- `tests/nexus-cross-app-copy.test.tsx`
- Updated: membership registry, deep-research handoff, report-rules, p5-ui, skills-related assertions

## Live verification (operator-controlled)

1. Confirm Connector advertises `research.hermes_deep_research`.
2. Create a future Calendar Deep Research event with request, rules, model display, and schedule fields.
3. When due, confirm exactly one task with five-key metadata and composed `requestText`.
4. Confirm task in Tasks and Deep Research Current Research.
5. Confirm Connector claims it; blocked/completed results project on Calendar.
6. Confirm completed report in Deep Research recent history; no duplicate after later scheduler passes.

## Operator capability dependency

Active Connector `allowedToolIds` must include `research.hermes_deep_research`. Nexus does not modify live allowlists automatically.

## Rollback notes

Revert Calendar registry entry, scheduled-event fields, dispatch branch, dialog UI, shared form helper, Skills/copy edits, and spec. No Claudia System changes required for rollback.
