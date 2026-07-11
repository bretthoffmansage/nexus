# nexus_deep_research_retry_and_history_workspace_v1

## Summary

Refines the Deep Research page so that:

1. every intentional `Research` submission is a **brand-new standalone execution**;
2. a terminal **failed** run offers **`Try again`**, which re-submits the failed run's
   exact request content as a new standalone execution (new identifiers, failed run
   untouched);
3. previous research is reviewed through a **Chat-style History drawer** instead of an
   inline `RECENT RESEARCH` list embedded at the bottom of the result panel.

This is a UI/interaction refinement over the existing handoff. No new queue, endpoint,
tool, result table, conversation model, or history authority is introduced.

## Execution path (unchanged)

```
Deep Research page
  → submitDeepResearch (existing mutation)
    → nexusTasks (existing shared queue)
      → Console Connector
        → research.hermes_deep_research
          → terminal result
            → existing Deep Research result renderer
```

Research runs remain **independent task executions**. There is no continuation parent,
no thread memory, no previous-task context injection, and no reuse of prior request
identity.

## Standalone-run semantics

`ResearchWorkspace.handleSubmit`:

- mints a **fresh `researchRequestId` and fresh `idempotencyKey`** on every click
  (`rotateResearchRequestSession()`), so no two intentional submissions share an
  execution identity and the backend never dedups a new intent as a prior run;
- submits the **current left-form fields** only (`requestText` composed from the
  Research request + Report rules via the canonical `composeDeepResearchRequestText`);
- passes exactly `{ requestText, researchRequestId, idempotencyKey }` — the model field
  is a UI preference and is never sent (unchanged);
- closes the History drawer, clears any historical selection, and selects the newly
  created task as **Current Research**.

The strict Nexus metadata contract is unchanged. The server bakes in exactly five
keys: `kind`, `sourcePage`, `explicitUserAction`, `researchRequestId`, `idempotencyKey`.
No continuation-related metadata is ever added.

## Failure retry behavior

When the selected/detail task is in a terminal **failed** lifecycle, the failed panel
shows **`Try again`** (replacing the former `Start new run`).

`handleTryAgain(failedTask)`:

1. reads the failed task's **canonical stored `requestText`** (the composed request +
   report rules, exactly as originally submitted);
2. mints a **new `researchRequestId` and new `idempotencyKey`**;
3. calls `submitDeepResearch` to create one **new** `nexusTasks` row with
   `tool = research.hermes_deep_research`, `kind = deep_research`, and the same request
   content;
4. never mutates or reopens the failed task; never reuses its idempotency key; performs
   no continuation;
5. resets the right panel to the new run's lifecycle (selects the new task) so the prior
   failed result is not rendered as the active run;
6. leaves the failed task immutable and still present in History.

### Identifier regeneration

Both `Research` and `Try again` regenerate `researchRequestId` **and** `idempotencyKey`.
The retry deliberately reuses only the *content* (`requestText`) — never the
execution-specific identifiers — so the retry is a distinct, non-deduplicated run.

### Duplicate-retry prevention

A synchronous `inFlightRef` guard plus the bounded `submitting` state disable the
`Research` and `Try again` controls while a submission is pending. One intentional click
creates exactly one task; a fast double-click cannot create two. If task creation fails
before persistence, a bounded error is shown and another intentional attempt is allowed.

## Immutable failed tasks

Retry creates a new task and never patches, reopens, or deletes the failed task. The
original detailed failure message (e.g. `Research tool policy validation failed.`) is
preserved on the failed task and remains visible when that historical run is reopened.

## No continuation model

Deep Research is not a conversation. There is no active-research-conversation object, no
continuation parent id, no previous-task context injection, no thread memory, and no
report follow-up. Historical research is strictly read-only: no Continue / Reply / Add /
Resume / Reopen / Send-follow-up affordances exist. The only action offered on a
historical **failed** task is `Try again`, which is a new standalone run.

## History architecture

### Chat History reuse

The Deep Research History drawer reuses the proven Chat History interaction and styling
with **no changes to Chat**:

- trigger: a `History` button in the workspace header (`legacy-port-head--split`),
  mirroring Chat's header-placed toggle, with `aria-expanded` / `aria-controls`;
- shell: the existing `.nexus-chat-history-shell` fixed drawer + `.nexus-chat-history-backdrop`
  overlay + slide-in panel (`.is-open`), matching Chat open/close and responsive behavior;
- panel: `.nexus-chat-history-panel` with `.nexus-chat-history-title`,
  `.nexus-chat-history-list-wrap` (scroll region), and `.nexus-chat-history-foot`;
- items: the existing research item classes (`.research-history-list`,
  `.research-history-item`, `.research-history-item--active`, `.research-history-title`,
  `.research-history-meta`).

`ResearchHistoryPanel` is a small presentational component. It receives already-fetched
data as props from `ResearchWorkspace` (single source of truth — no second query, no
second history authority).

### History content and filtering

History lists **only** the authenticated owner's Deep Research tasks, via the existing
`listMyDeepResearchTasks` query, which filters by `requestedToolId =
research.hermes_deep_research`, `taskKind = deep_research`, and owner, newest-first.

Both **direct** page submissions and **Calendar-created** research appear, because
Calendar dispatch creates its task through the identical `buildDeepResearchEnvelope`
(same tool id, kind, and five-key metadata). The only safe distinguishing marker is the
task row's top-level `scheduledEventId` (present for scheduled/Calendar tasks, absent for
direct submissions). `projectDeepResearchTask` now exposes a derived read-only
`fromCalendar` boolean for an optional Calendar badge — this is a projection enrichment
only; no schema, metadata, or write path changes.

Each item shows a bounded request title (first line/preview), lifecycle state
(Queued / Running / Completed / Failed / Blocked / …), submitted timestamp, and an
optional `· Calendar` indicator. The full report is never shown in the list.

### Opening historical research

Selecting a History item closes the drawer, clears no draft, and displays that task's
submitted request, progress, terminal state, and report in the right result panel
(read-only). It does not create a task, does not become an editable continuation, and
does not affect the next `Research` submission's identifiers.

## Draft / history separation

Four states are kept independent:

1. current left-side draft (`requestText`, `reportRules`);
2. active/newly submitted task;
3. selected historical task (`selectedTaskId`);
4. History drawer open/closed (`historyOpen`).

Opening/closing history never touches the draft; selecting a historical item only changes
the right-panel selection. Submitting clears the historical selection and shows the new
task. Retrying a failed task uses the failed task's stored content and does **not**
overwrite the current unsent draft.

## Inline Recent Research removal

The `RECENT RESEARCH` heading and inline task-card list are removed from the right result
panel. The right panel focuses only on the currently selected run (active, historical, or
empty). The single history list now lives in the drawer — no duplicate lists.

## Scrolling / viewport behavior

The viewport-bound layout from `nexus_deep_research_result_scrolling` is preserved: the
left request panel is stationary, the right result panel scrolls internally, and the
fixed-position History drawer overlays the viewport without affecting the result panel's
scroll containment. No document-level or horizontal overflow.

## Responsive behavior

The drawer follows Chat History's responsive drawer (fixed overlay + slide-in from the
right, backdrop to dismiss). At narrow widths the two-pane grid already collapses to a
single column; the drawer overlay avoids stacked competing scrollbars and keeps both the
left form and historical reports reachable.

## Focused tests

`tests/nexus-deep-research-retry-and-history.test.tsx`:

- Buttons: no left `New request`; failed → `Try again`; no `Start new run`; completed does
  not show retry UI.
- Standalone submission: `Research` mints a new `researchRequestId` + `idempotencyKey`;
  does not reuse a selected historical task's ids; sends exactly the five-key contract via
  the composed `requestText` with no continuation metadata; one click → one task;
  historical selection cleared; new task becomes the active view.
- Retry: preserves the failed task's composed request content; mints new ids; does not
  mutate or reuse the failed task's id; pending state prevents duplicate retries; right
  panel resets; failed task remains in History.
- History: inline Recent Research absent; History trigger renders; lists only Deep Research
  tasks; direct + Calendar research appear; newest-first; selecting opens read-only detail;
  selecting does not overwrite the draft; selecting creates no task; no continuation
  affordance; submitting closes History and clears selection; bounded empty/loading states;
  follows the Chat interaction pattern.

Updated existing focused tests:

- `nexus-deep-research-report-rules.test.tsx`: drop the removed `New request` reset case
  (draft-persistence cases unchanged).
- `nexus-deep-research-layout-scroll.test.tsx`: the removed inline Recent Research is no
  longer asserted in the right panel; report scroll-containment assertions retained.

Regression guards (existing tests, unchanged and still green): result Markdown rendering,
progress timeline, detailed failure messages, viewport scrolling, Calendar inclusion in
`listMyDeepResearchTasks`.

## Live smoke plan (not run here)

1. Submit a research request; confirm one new task with fresh ids and Current Research view.
2. Submit again; confirm a second, independent task (new ids), not a dedup.
3. Force a failed run; click `Try again`; confirm a brand-new queued run, the failed run
   unchanged and still listed in History with its original error.
4. Open History; confirm direct + Calendar tasks listed newest-first; open a completed run
   (read-only report) and a failed run (`Try again` only).
5. With an unsent draft, open/close History and open a historical item; confirm the draft
   is untouched; submit and confirm History closes and the new run shows.
```
