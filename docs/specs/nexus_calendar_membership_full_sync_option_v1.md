# Nexus Calendar Membership.io Full Sync Option v1

**Package:** `nexus_calendar_membership_full_sync_option_v1`  
**Repository:** `/Users/bretthoffman/Documents/claudia_console`  
**Branch at start:** `main`  
**Starting HEAD:** `d865ac7`

## Canonical Claudia tool

**Tool ID (unchanged, Claudia-owned):** `membership_io.catalog_refresh_and_vault_update`

Nexus does **not** implement scraping, transcript processing, vault placement, or sync logic. It only schedules the canonical tool through the existing global `nexusTasks` queue when Claudia Connector capability is present.

## Current Claudia blockers

The tool exists in Claudia source but is **not yet live through Nexus**:

- no trusted Connector adapter for this full-sync tool;
- `nexus_connector` not yet an allowed caller;
- no calendar-origin write-evidence authorization;
- no Connector capability entry in production;
- no Nexus progress mapping;
- no Claudia-side single-flight lock.

**This package must not enable live scheduling until Claudia implements trusted Connector execution.** Nexus gates save and dispatch on active Connector `allowedToolIds`.

## Scheduled-tool registry

Single surface: `convex/lib/calendarScheduledTools.ts`

| Field | Membership.io full sync |
|-------|-------------------------|
| `requestedToolId` | `membership_io.catalog_refresh_and_vault_update` |
| `displayLabel` | Membership.io full sync |
| `taskKind` | `membership_full_sync` |
| `inputMode` | `no_input_action` |
| `writeCapable` | true |
| `chatAvailable` | false |
| `requiresConnectorCapability` | true |
| `singleFlightKey` | same tool id |
| `executionTimeoutSeconds` | 3600 (Claudia-side guidance) |

Existing text-request tools remain in the same registry unchanged.

## Calendar UI

When **Membership.io full sync** is selected:

- **Shown:** Event name, date, time, timezone, task type, optional Notes, fixed action description, readiness message when unavailable.
- **Hidden:** Task request textarea.
- **Save:** disabled when `available === false`; server rejects forged saves regardless.

Switching from a text tool preserves draft request text in UI state only; server normalizes `taskRequest` to the fixed literal for no-input tools.

## Task shape (when ready)

| Field | Value |
|-------|-------|
| `requestedToolId` | `membership_io.catalog_refresh_and_vault_update` |
| `taskKind` | `membership_full_sync` |
| `requestText` | `Run Membership.io full synchronization` |
| `taskMetadata.kind` | `membership_full_sync` |
| `taskMetadata.explicitUserAction` | `sync` |
| `taskMetadata.scheduledEventId` | event id |
| `taskMetadata.scheduledForUtc` | canonical UTC ms |
| `taskMetadata.idempotencyKey` | `{eventId}:{ISO scheduled instant}` |
| Attachments | none |
| Browser-supplied Claudia flags | none |

## Readiness gating

**Save path:** `validateScheduleInputAsync` → `isCalendarScheduledToolAvailable` → active Connector `allowedToolIds`.

**Dispatch path:** `dispatchOneEvent` rechecks capability before and after dispatch claim.

Tool is in `KNOWN_CONNECTOR_TOOL_IDS` (operator may add via `setConnectorAllowedTools`) but **not** in `DEFAULT_CONNECTOR_TOOL_IDS`.

## Timeout and lease behavior

No one-hour HTTP request. Uses normal queue → claim → renewable lease → progress → terminal completion.

Nexus has no per-task timeout field; Claudia enforces **3600 s**. Connector lease renewal (`P6_LEASE.renewalExtensionMs`) remains the long-run mechanism.

## Single-flight protection

At dispatch, Nexus checks for another active task with the same `requestedToolId` in `queued`, `claimed`, `running`, or `cancel_requested`.

If blocked:

- no second task created;
- event stays `due` / `undispatched`;
- `progressMessage`: `Waiting for existing Membership.io sync`;
- retried on next 5-minute scheduler pass.

## Exactly-once and late-run recovery

Per-event idempotency key `schedule:{eventId}` unchanged. Single-flight wait does **not** consume the event. When eligible, exactly one task is linked.

## Progress and terminal projection

Until Claudia emits Nexus progress, show normal queued/running lifecycle only. Do not fabricate stage labels.

Future terminal mapping (bounded, user-safe): `complete`, `complete_with_transcript_gaps`, `partial`, `failed`, `blocked` — no raw paths, logs, or credentials.

## Ordinary Chat exclusion

Tool is **not** in `P5_SUPPORTED_TOOL_IDS`. Only Calendar explicit scheduling may create it.

## Focused tests

`tests/nexus-calendar-membership-full-sync.test.ts` (13 cases)  
`tests/nexus-calendar-scheduled-dispatch.test.ts` (regression, 15 cases)

## Live verification status

**Not performed** — no live full sync scheduled or executed in this package.

UI verification (before Claudia support):

1. Open Calendar → confirm third option visible with unavailable label.
2. Select it → task request hidden; Save disabled.
3. Server rejects direct mutation without Connector capability.

Coordinated smoke after Claudia package: enable Connector allowlist, schedule future event, confirm single dispatch and no overlap.

## Rollback

Revert commit; remove `membership_full_sync` from schema union and registry entry. Existing failed/unavailable events remain in DB; no automatic migration required.
