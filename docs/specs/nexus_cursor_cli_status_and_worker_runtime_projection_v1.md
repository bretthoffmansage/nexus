# Nexus Cursor CLI status and worker/runtime projection v1

Package: `nexus_cursor_cli_status_and_worker_runtime_projection_v1`

## Summary

Adds Cursor CLI as a first-class Claudia worker in the Nexus system-status
surface, extending the existing heartbeat → Connector-status → Status-page path
to accept, persist, derive freshness for, and render an eighth `cursor_cli`
component. Also introduces a single shared, allowlisted worker-label formatter
for future worker/runtime display, and documents the cross-repo blocker that
prevents wiring per-task worker display today.

No new endpoint, heartbeat, Connector route, Convex mutation/query, table, or
polling path is added. No Claudia System files are modified.

## Claudia handoff

- Claudia commit `2b5d00c394f1646720c09a936ef007ca3c2a5bc8` ("Add Cursor CLI
  status to Control Center").
- Handoff spec (Claudia repo): `docs/specs/claudia_nexus_system_status_handoff_v1.md`.
- Cursor worker spec (Claudia repo): `docs/specs/claudia_cursor_read_only_retrieval_workers_v1.md`.

Architecture unchanged:

```
Claudia service-control status
  → system-status projection
  → build_heartbeat_system_status
  → existing Nexus Connector heartbeat (POST /api/connector/v1/heartbeat)
  → existing Convex Connector status handling (nexusConnectors.systemStatus)
  → Nexus Status page
```

## Part 1 — systemStatus contract (implemented)

### New component key

`cursor_cli`, observation shape `{ active: boolean, observedAt: <ISO-8601 UTC Z> }`.

Allowed component keys are now exactly eight:

```
core_api, nexus_connector, viktor_retrieval, sage_knowledge_base,
cursor_cli, codex_cli, claude_cli, cleanup_storage
```

### Validation (`convex/lib/systemStatus.ts`)

- `systemStatusRecordValidator.components` gains an optional `cursor_cli`
  (`systemComponentRecordValidator`). Because `convex/schema.ts` reuses
  this validator for the stored `nexusConnectors.systemStatus` field, the
  same change extends both the heartbeat arg and persistence.
- `SYSTEM_COMPONENT_KEYS` includes `cursor_cli`. `parseSystemStatus`
  therefore accepts it; unknown keys still fail closed (whole snapshot rejected).
- `active` must be boolean and `observedAt` must be a valid UTC `...Z` instant;
  a malformed Cursor observation is dropped (that component omitted) while other
  valid components persist — same fail-closed rule as Claude/Codex.
- Cursor is optional: heartbeats without `cursor_cli` (older seven-component
  Connectors) are still accepted and persisted.

### Persistence (`convex/connectorRegistry.ts`, `convex/schema.ts`)

- Only `{ active, observedAt }` per component is stored, via the existing
  `nexusConnectors.systemStatus` record. No Cursor table/query/mutation.
- `getSystemStatusForPage` projection adds `cursor_cli` to the bounded
  components object (no snapshotId/sessionId/raw payload exposure).

### Freshness (`convex/lib/systemStatus.ts`, `lib/nexus/systemStatusView.ts`)

- New `CLI_WORKER_KEYS = [cursor_cli, codex_cli, claude_cli]` and
  `isCliWorkerComponent(key)` centralize CLI membership.
- Cursor reuses the existing centralized CLI TTL (`P6_SYSTEM_STATUS.cliObservationTtlMs`,
  24h). No second Cursor-specific TTL.
- Cursor is live/green only when: Connector heartbeat fresh **and** snapshot
  fresh **and** `cursor_cli` present **and** `active === true` **and**
  `observedAt` within the CLI TTL.
- Stale Connector → Cursor (and all Claudia-hosted components) lose green. A
  Cursor failure never marks the Connector offline and never changes Claude or
  Codex status (independent per-component derivation).
- Missing Cursor renders a bounded card (`Unavailable` / no colored light),
  never a crash.

## Part 2 — Status card (implemented)

- Card copy added to `CARD_COPY` in `lib/nexus/systemStatusView.ts`:
  - Title: `Cursor CLI`
  - Description: `Cursor command-line runtime used by governed Claudia workflows.`
  - Live status: `Connected`; inactive: `Not recently verified` /
    `Disconnected` / `Unavailable` (same convention as Claude/Codex).
  - Secondary detail: `Last verified: <relative>` only.
- The card renders via the same `StatusCard` component and CSS class, driven by
  `deriveSystemStatusCards` iterating `SYSTEM_COMPONENT_KEYS`.
- Layout: worker cards ordered **Cursor → Codex → Claude** (Cursor leads as the
  first-priority read-only worker). The existing 2-column responsive grid
  (`.system-status-grid`) now holds eight cards as four balanced rows;
  it collapses to one column at narrow widths. No Status-page redesign, no CSS
  change required.

## Part 3 — worker/runtime display (Case C: cross-repo blocker)

### Source-of-truth audit

The Nexus-facing task-result contract carries **no** worker/runtime/executor
field today:

- Ingestion `convex/http.ts` `complete` action reads only
  `answerText, format, sources, model, toolId, durationMs, dropzoneResult`.
- Mutation `convex/connectorTasks.ts` `completeTask` args have no worker field;
  `completedBy` is the authenticated **connectorId** (machine identity), not an
  executor type.
- Schema `nexusTaskResults` persists `answerText, format, createdAt, completedBy,
  model, toolId, durationMs` — no worker column.
- Projection `convex/taskResults.ts` `getMyTaskResult` exposes the same set.
- UI: the only per-task runtime value rendered is `model`, and only on Deep
  Research (`components/workspace/port/ResearchWorkspace.tsx`). No surface
  currently displays a worker, and no hardcoded "Claude"/"Codex" worker labels
  exist in the task-result path. (The `claude_cli`/`codex_cli` labels live only
  in the unrelated system-status heartbeat surface.)

Claudia side (read-only inspection): the completion payload emitted by
`core_api/nexus_connector/service.py` sends only `answer_text, model, tool_id,
duration_ms`. Commit `2b5d00c` added Cursor to Control Center status only, **not**
to the task-result contract.

**Conclusion: Case C.** A worker/runtime value is not present anywhere in the
Nexus-facing result contract. Per package rules, it is not invented.

### What was implemented for Part 3

- `lib/nexus/workerLabels.ts`: a single shared, allowlisted formatter
  (`formatWorkerLabel`, `workerLabelOrFallback`, `WORKER_UNAVAILABLE_LABEL`).
  Canonical mapping: `cursor_cli`/`cursor` → `Cursor CLI`,
  `codex_cli`/`codex` → `Codex CLI`, `claude_cli`/`claude` → `Claude CLI`.
  Unknown/empty/non-string values resolve to `null` (bounded `Unavailable`
  fallback) so raw untrusted text is never rendered.
- Deep Research `model` display is preserved exactly as-is (actual model string
  from Claudia); worker is **not** conflated with model.

### Model vs. worker

`model` and worker are distinct. The existing `model` string continues to be
displayed verbatim where present (Deep Research). A worker field, when it exists,
would be rendered as a separate `Worker` value using the formatter above — never
replacing the model value.

### Required follow-up cross-repo handoff (blocker)

To display the actual executing worker per task, Claudia must first add a bounded
worker identity to the completion payload, then Nexus wires it through:

1. Claudia: include a canonical `worker` (allowlisted snake_case, e.g.
   `cursor_cli`/`codex_cli`/`claude_cli`) in the `complete` terminal payload from
   `core_api/nexus_connector/service.py`. This is the reported *actual* executor
   (Cursor → Codex → Claude priority is routing only, never display truth).
2. Nexus (future package):
   - forward `worker` in `convex/http.ts` `complete` action;
   - add `worker` to `completeTask` args and `writeCanonicalTaskResult`;
   - add an optional bounded `worker` column to `nexusTaskResults` (schema),
     validated against the allowlist on write (fail closed to omitted);
   - expose `worker` in `getMyTaskResult` (and Deep Research projection);
   - render it with `formatWorkerLabel` alongside `Model` on the relevant
     surfaces (Deep Research result, and Tasks/Vault/transcript detail if/when
     they render runtime), showing `Unavailable` for old rows without a worker.

The strict five-key Deep Research `taskMetadata` contract must **not** be
expanded to carry the worker; the worker belongs on the result row (following the
`model`/`toolId`/`durationMs` precedent).

## Backward compatibility

- Heartbeats without `cursor_cli` are accepted; the Cursor card renders bounded
  `Unavailable` with no green light. Older records without `systemStatus`
  keep the existing "Detailed system status unavailable" behavior.
- Old task results without a worker continue to render; `model` still shows when
  present; no worker is displayed until the contract above lands.
- Claude/Codex cards, freshness, timestamps, and labels are unchanged.

## Security

- Component and worker values are bounded and allowlisted; only fixed hardcoded
  labels/copy are rendered. No paths, command lines, credentials, account names,
  environment values, raw output, or routing diagnostics are exposed.

## Focused tests

- `tests/nexus-system-status-heartbeat.test.ts`: eight-component accept +
  persist; seven-component (no Cursor) accept; `cursor_cli` allowlisted; Cursor
  active non-boolean fails closed (only Cursor dropped); Cursor bad `observedAt`
  fails closed; page query exposes `cursor_cli`; Cursor freshness (green/inactive/
  missing/stale) and independence from Claude/Codex/Connector.
- `tests/nexus-system-status-page.test.tsx`: eight cards render; Cursor
  card present with matching style and copy; eight live dots.
- `tests/nexus-worker-labels.test.ts`: allowlist mapping, whitespace/case
  normalization, unknown → null, missing/non-string → null, bounded fallback.

Run:

```
npx vitest run \
  tests/nexus-system-status-heartbeat.test.ts \
  tests/nexus-system-status-page.test.tsx \
  tests/nexus-worker-labels.test.ts
```

## Activation dependency

Claudia Control Center and the Nexus Connector must be restarted after Claudia
commit `2b5d00c394f1646720c09a936ef007ca3c2a5bc8`, and
`status_publication.enabled: true` set in Claudia config, before Nexus receives
`cursor_cli`. Do not restart Claudia from this repository.

## Live smoke plan (operator-controlled)

1. Deploy Nexus support; restart Claudia Control Center + Connector.
2. Confirm heartbeat contains `cursor_cli`; Cursor CLI card green when connected.
3. Stop/invalidate Cursor only → Cursor loses green; Connector, Claude, Codex
   unaffected.
4. Restore Cursor → status recovers.
5. Confirm old tasks and old (seven-component) heartbeats still render.
6. Worker-per-task display is deferred until the Claudia result-contract handoff
   above lands.

## Rollback

Revert this commit. The heartbeat validator returns to seven components; older
Cursor-bearing heartbeats then drop `cursor_cli` (unknown key → snapshot fails
closed, so Claudia should disable Cursor publication if Nexus is rolled back).
The `workerLabels` module and its test are inert (no callers) and safe to keep or
remove.
```
