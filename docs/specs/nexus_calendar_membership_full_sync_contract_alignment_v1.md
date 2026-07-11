# Nexus Calendar Membership.io Full Sync — Contract Alignment v1

**Package:** `nexus_calendar_membership_full_sync_contract_alignment_v1`  
**Repository:** `/Users/bretthoffman/Documents/console`  
**Branch at start:** `main`  
**Starting HEAD:** `a83572b`  
**Prior Calendar package:** `a83572b` — Add Membership.io full sync to Nexus Calendar  
**Nexus implementation reference:** branch `nexus-core-reconciliation-and-tooling`, HEAD `ffaa8d8`

## Nexus contract (authoritative)

When a Calendar event becomes due, Nexus creates one task on the global `nexusTasks` queue:

```json
{
  "requestedToolId": "membership_io.catalog_refresh_and_vault_update",
  "taskKind": "membership_full_sync",
  "requestText": "Run Membership.io full synchronization",
  "taskMetadata": {
    "kind": "membership_full_sync",
    "explicitUserAction": "sync",
    "scheduledEventId": "<calendar event id>",
    "scheduledForUtc": "<ISO 8601 UTC fire instant>",
    "idempotencyKey": "<calendar event id>:<same ISO UTC string>"
  }
}
```

Example ISO instant: `2026-07-02T00:55:00.000Z`  
Example idempotency key: `abc123:2026-07-02T00:55:00.000Z`

## Contract correction (this package)

**Before:** `taskMetadata.scheduledForUtc` was epoch milliseconds (misaligned with Nexus).

**After:** `taskMetadata.scheduledForUtc` is canonical ISO 8601 UTC from `buildMembershipFullSyncTaskMetadata()` in `convex/lib/calendarScheduledTools.ts`. The Calendar event continues storing `scheduledForUtc` as numeric UTC ms internally.

## Exact metadata allowlist

For `membership_full_sync`, server-built metadata contains **exactly**:

1. `kind`
2. `explicitUserAction`
3. `scheduledEventId`
4. `scheduledForUtc` (ISO string)
5. `idempotencyKey`

No `lateDispatch`, Notes, timezone, local time, or client-supplied fields.

## Capability gating (unchanged)

Tool id `membership_io.catalog_refresh_and_vault_update` must appear on an active Connector `allowedToolIds`. Save and dispatch reject when absent. Not inferred from Nexus source.

## Operator dependency

Before the option is available, the Nexus operator must enable in `config/nexus_connector/connector.yaml`:

```yaml
membership_full_sync:
  ingress: membership_full_sync  # canonical ingress name
```

…and include `membership_io.catalog_refresh_and_vault_update` in the Connector tool allowlist, then restart the Nexus Nexus Connector.

Nexus observes capability through the existing Connector registry only.

## No-input behavior (unchanged)

- Fixed server-side `requestText`
- No task-request field in Calendar UI
- No browser arguments
- Ordinary Chat exclusion preserved

## Exactly-once and single-flight (unchanged)

- One event → at most one task (`schedule:{eventId}`)
- Duplicate scheduler passes do not duplicate
- Active full-sync task blocks overlap; event stays due and retries later

## Terminal projection

| Outcome | Calendar status | Display |
|---------|-----------------|---------|
| Normal completion | `completed` | Safe `answerText` / summary |
| Normal failure | `failed` | Safe `userSafeMessage` + bounded error code |
| `execution_state_uncertain` | `needs_review` | Safe message; no automatic retry or second task |

No Membership.io report parsing, counts, paths, or worker output.

## Focused tests

`tests/nexus-calendar-membership-full-sync.test.ts` — 18 cases including ISO metadata, allowlist keys, capability gating, duplicate dispatch, single-flight, completion/failure/uncertain projection.

## Live verification plan

1. Enable Console Connector capability and restart Connector.
2. Confirm Nexus shows Membership.io full sync as available.
3. Schedule one controlled future event.
4. When due, confirm exactly one task with ISO `scheduledForUtc` and matching idempotency key.
5. Confirm Nexus claims and runs the canonical tool.
6. Confirm completion/failure/uncertain projection on the Calendar event.

**Not executed in this package.**

## Rollback

Revert this commit; restores ms-based metadata (breaks Nexus contract). Coordinate with Nexus before rollback if Connector is live.
