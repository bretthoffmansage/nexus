# Nexus — Live Worker Activity Readback (v1)

**Status:** implemented · **Scope:** UI/readback only · **Package:**
`cross_repo_live_worker_activity_readback_v1`

Renders a safe, live "activity readback" while a Claudia worker task runs, on the
Deep Research page and the tool-backed Chat modes. Companion to Claudia's
`claudia_worker_activity_readback_v1.md`.

## Data model & persistence

No new table, queue, or endpoint. A `worker_activity` value is added to the
existing `nexusTaskProgressEvents.eventType` union (`convex/schema.ts`). The
structured, already-sanitized fields ride in the bounded `metadata`
(`surface`/`toolId`/`worker`/`phase`/`status`/`occurredAt`); `message` holds the
safe display line. Additive and backward-compatible: older tasks simply have no
such events, and any consumer that does not recognize the type ignores it.

- Allowlists + bounds are the single source of truth in `convex/lib/p5config.ts`
  (`WORKER_ACTIVITY_LIMITS`, `WORKER_ACTIVITY_SURFACES|WORKERS|PHASES|STATUSES|TOOL_IDS`),
  mirrored from Claudia's `core_api/worker_activity`.
- `connectorTasks.appendConnectorActivity` (internal mutation) reuses the same
  table, the same `appendProgress` writer, the same signed `/task` endpoint, and
  the same lease/ownership checks as `appendConnectorProgress`. It is a distinct
  mutation only so the richer worker-activity vocabulary cannot entangle the
  technical `tool_progress` stage validation. It **drops (accepts without
  storing)** any out-of-allowlist tuple, empty message, or over-cap event, and
  clamps the message — forward-compatible and safe. Ownership is copied from the
  task, never trusted from the request.
- `http.ts` adds a `worker_activity` action on the existing `/task` handler
  (`normalizeWorkerActivity` coerces only known fields).
- `taskProgress.listMyTaskProgress` (unchanged owner check:
  `requireKnowledgeReader` + `requireOwnedTask`) now also returns `metadata`, and
  returns the **latest** `limit` events (newest-first take, reversed to
  chronological order) rather than the oldest page — so a long Deep Research run,
  which can emit more than one page of activity while Hermes calls tools, always
  feeds the component the current lines. For a task with fewer than `limit` events
  this is identical to the prior ascending page (fallback unaffected).

## Shared component

`components/status/WorkerActivityFeed.tsx` renders **only the latest `visibleCount`**
`worker_activity` events in chronological order (`slice(-visibleCount)` after a
sequence sort) — a further event pushes the oldest visible line out. Chat uses the
default (`WORKER_ACTIVITY_LIMITS.visibleLineCount` = 4); Deep Research passes
`deepResearchVisibleLineCount` = 8, since Hermes tool calls produce richer activity.
It renders message text only (never raw payload, never `dangerouslySetInnerHTML`),
clamps length defensively, ignores unknown metadata, is an accessible
`role="status" aria-live="polite"` region, and shows nothing (or a caller-provided
fallback) when there is no activity. It is per-task: the caller passes exactly one
task's rows, so activity never leaks across tasks/users.

## Deep Research display rules (`ResearchWorkspace.tsx`)

- Shown while not successfully completed (queued/claimed/running/tool_progress/
  blocked/failed/cancelled/timed-out). When rich activity exists it **supersedes**
  the verbose technical Progress chip list; when it does not, the technical
  Progress list is preserved as the fallback.
- Hidden once the run is successfully completed (`isSuccessfullyCompletedResearchTask`),
  including historical successful runs. Failed historical runs still show stored
  activity. Retry starts a fresh task → fresh feed; the old failed task keeps its
  own events. It does not disturb the Request panel, the Submitted/Model/Duration
  row, or the viewport-bound response scroll.

## Chat display rules (`NexusChatWorkspace.tsx`)

- Applies to the tool-backed modes (`vault.agentic_retrieval`,
  `membership_io.transcript_retrieve`). While the latest task is running, the
  latest four "Retrieval activity" lines appear beneath the pending assistant
  message; the query is skipped for successful tasks (hidden) and runs while
  running or after failure (retained alongside the safe failure message). It is
  per-message/task.
- Not regressed: the SOURCES disclosure stays collapsed by default, the source
  cards, the 2× type-on animation (separate component), and message ownership.

## Guarantees

- No new endpoint, queue, WebSocket, SSE, or browser-to-Claudia channel; events
  ride the existing Connector → Convex task-progress path.
- Ownership/role access is preserved (owner-checked query; owner-copied writes).
- Backward-compatible: old tasks without activity fall back to the existing
  technical progress UI and never crash.

Focused tests: `tests/nexus-worker-activity-feed.test.tsx`,
`tests/nexus-worker-activity-backend.test.ts`,
`tests/nexus-deep-research-activity.test.tsx`, `tests/nexus-chat-activity.test.tsx`.
