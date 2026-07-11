# Nexus Deep Research — request and response panel separation (v1)

Package: `nexus_deep_research_request_and_response_panel_separation_v1`

UI structure/presentation change only. No task creation, retry, id generation,
idempotency, Nexus metadata, request/rules composition, history filtering,
status lifecycle, result rendering, source provenance, Connector behavior, or
Convex schema is changed. No Nexus System file is touched.

## Current combined-layout problem

The right-side Deep Research area rendered the full submitted request, Report
rules, submission metadata, model/duration, lifecycle/status, and the report in
one continuous scroll (`.research-current-panel`). Users had to scroll past the
entire original request to reach the response.

## Request display authority

The selected task's canonical `requestText` (from `getMyTask` /
`projectDeepResearchTask` → `doc.requestText`) is the sole display source. It is
the immutable, already-composed request (research request + folded Report rules).
The collapsed preview and the modal both read `detailTask.requestText` — never the
left-side draft (`requestText`/`reportRules` form state), never reconstructed.

## New right-column structure

`.research-jobs` is now a transparent flex column (not a card):

1. `Current research` section title (fixed).
2. `.research-request-block` (fixed, `flex-shrink: 0`):
   - `.research-request-card` — a `<button>` titled **Request** (label styled like
     the Chat `.nexus-transcript-author` message labels), with a ≤3-line clamped
     preview (`-webkit-line-clamp: 3` + `display:-webkit-box` + `overflow:hidden`
     — no scrollbar, cannot grow with length, fewer lines when short). Hover/focus
     border indicates clickability; it is not a textarea.
   - `.research-request-metabar` — a **windowless** metadata row directly beneath
     the card (no border/background/shadow/radius; page background), 3 columns
     (`SUBMITTED`, `MODEL`, `DURATION`) that wrap at narrow widths.
3. `.research-response-panel` (also carries `.research-current-panel`) — the
   card-styled lower panel that fills remaining height and owns the scroll.

## Collapsed three-line preview

`.research-request-card-preview` uses line-clamp only; there is no `max-height`
and no `overflow-y`, so it never scrolls and never grows. Multi-paragraph, list,
long-rules, and Calendar-created requests all stay compact; a request shorter than
three lines uses only the lines it needs.

## Request detail modal

`RequestDetailModal` mirrors the accessible Nexus dialog pattern
(`CalendarEventDialog`): a `role="presentation"` backdrop that closes on click, an
inner `role="dialog" aria-modal="true" aria-labelledby`, a `×` close button
(`aria-label="Close"`), and a `<pre>` that preserves line breaks/lists with safe
wrapping. Content region (`.research-request-modal-body`) scrolls independently
(`overflow-y:auto`), unaffected by the lower panel. It shows only the title, the
full canonical request (including Report rules), and close controls — no editing
controls and no duplicated Submitted/Model/Duration.

Close: `×`, backdrop click, and `Escape` (added on top of the shared pattern).
On open, focus moves to the close button; on close, focus returns to the Request
panel button. The modal reads only text — it never mutates the request, the
selected task, or the unsent draft.

## Automatic collapsed behavior after submission

Submitting creates the task as before, selects it, and populates the Request
panel from its canonical request. A `useEffect` keyed on `detailTaskId` forces the
modal closed whenever the selected task changes, so a new submission (and a
History selection) always begins collapsed; the modal never auto-opens. The
left-side draft/submission flow is unchanged. The lower panel resets to the new
task's lifecycle via the existing status ladder.

## Historical-task behavior

Selecting a run from History uses the identical layout: the Request panel shows
that task's canonical request, the metadata row shows that task's Submitted/Model/
Duration, and the lower panel shows only its status/report/result. Applies to
completed, failed, blocked, and Calendar-created tasks (and older tasks whose
stored request already contains duplicated Report rules — shown honestly, never
mutated). The modal is read-only; opening it never changes the draft or the
selected task; there is no continuation affordance.

## Metadata placement

`SUBMITTED`, `MODEL`, `DURATION` render only in the windowless
`.research-request-metabar` directly under the Request card — removed from both
the Request card and the lower response panel, and never duplicated in the modal.
Data source/derivation is unchanged (`formatTime(createdAt)`,
`detailResult.model`, `formatResearchDuration(detailResult.durationMs)`).
State-specific: Submitted shows whenever a created timestamp exists; Model shows
when a result model exists; Duration shows only when a meaningful duration exists
(active runs with no duration omit it — no fake value).

## Response-panel contents by lifecycle

- Active: lifecycle status row, progress checkpoints, Cancel (when queued).
- Failed/blocked: failure/blocked heading + safe message, Try again (failed),
  Progress (retained for incomplete runs).
- Completed: status row, report Markdown, "Sources retrieved this run"; no
  Progress block (existing completed-report cleanup). No request body, no request
  preview, no Submitted/Model/Duration.

## Viewport / scroll preservation

The Chat-style `min-height: 0` chain is preserved. The scroll owner moved one
level deeper — from `.research-jobs` to `.research-response-panel` — keeping the
same principle: at `min-width: 901px` `.research-panel-layout` stays
`min-height:0` + `grid-template-rows: minmax(0,1fr)`, `.research-jobs` is a bounded
`overflow:hidden` flex column, and `.research-response-panel` is `flex:1` +
`min-height:0` + `overflow-y:auto`. The Request card + metadata row stay fixed on
top; the response body scrolls to its final line; the bottom edge tracks the
viewport; no document-level or horizontal overflow. Narrow (`max-width:900px`)
keeps the single-column, whole-section scroll; the metabar wraps; the modal fits
with margins and scrolls internally (no nested scroll trap).

## Accessibility

Request panel is a real `<button>` (`aria-haspopup="dialog"`,
`aria-label="Open the full submitted request"`). Modal uses `role="dialog"`,
`aria-modal`, labelled title, `Escape`, focus-in on open, focus-return on close,
and a labelled close control. Backdrop dismissal preserves the underlying task.

## Focused tests

- `tests/nexus-deep-research-request-panel.test.tsx` (new, 21): Request panel
  authority + 3-line clamp/no-scroll CSS + short/long compactness; request/rules
  absent from the lower panel; windowless metadata placement/absence + active-run
  duration omission; modal open/full-request/scrollable/no-edit/no-metadata/close
  via ×/backdrop/Escape/focus-return/draft+task untouched; new-submission stays
  collapsed (no auto-open); historical completed/failed/Calendar parity; sources
  and failure+retry+progress in the lower panel.
- `tests/nexus-deep-research-layout-scroll.test.tsx` (updated, 8): scroll-owner
  moved to `.research-response-panel` (`flex:1`/`min-height:0`/`overflow-y:auto`),
  `.research-jobs` bounded (`overflow:hidden`); all other viewport invariants and
  DOM containment assertions preserved.
- Regression: retry-and-history, progress-visibility, loading-state, handoff,
  report-rules, model-selection, model-submit all green (104).

## Live smoke plan

Not run here (browser preview is unavailable in this environment and the route is
Clerk-gated; live research/Connector calls are out of scope). Manual smoke when
authenticated: submit a run → confirm a collapsed Request panel + windowless
metadata row appear and the modal does not auto-open; open/close the modal via ×,
backdrop, and Escape and confirm focus returns; open a completed, a failed, and a
Calendar run from History and confirm the same layout, read-only modal, and
preserved draft; resize to confirm the response panel stays viewport-bound and the
metadata row wraps without a card background.

## Remaining limitations

`-webkit-line-clamp` is used for the preview (broadly supported across current
Chromium/WebKit/Firefox). The metadata row reflects `detailResult` availability,
so Model/Duration appear once the result document exists (unchanged data timing).
