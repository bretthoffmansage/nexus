# Nexus P6 — Trusted Connector Queue Protocol (v1)

**Package:** P6 — Nexus/Convex-side trusted remote-worker protocol for the shared task queue
**Status:** Complete (Nexus/Convex side). The local poller is P7 inside `claudia_system` and is **not** implemented here.
**Date:** 2026-07-01
**Related:**
`docs/specs/nexus_p6_p7_connector_handoff_contract_v1.md` (binding contract for the future poller),
`docs/specs/nexus_p5_private_conversations_tasks_shared_queue_v1.md`,
`docs/specs/nexus_p5_data_privacy_and_queue_contract_v1.md`,
`docs/specs/nexus_p5_1_convex_auth_readiness_guard_v1.md`

## 1. Purpose

P6 adds the secure control plane that lets **one future trusted local Connector**
(the P7 poller in `claudia_system`) authenticate as a machine identity, claim
the oldest queued task, hold a time-limited lease, report progress, and
complete/fail/cancel — all over outbound HTTPS, with no inbound Claudia
endpoint and no second queue. P6 does **not** execute tasks and does **not**
implement the poller.

`nexusTasks` remains the single canonical queue. Tasks live in it for their
whole lifecycle (`queued → claimed → running → completed | failed`, or
`queued → cancelled`, or `claimed|running → cancel_requested → cancelled`) and
are never deleted or copied into a separate queue table.

## 2. Security model

- **Humans** authenticate with Clerk (unchanged). The **Connector** never uses a
  Clerk session, cookie, or browser JWT. It authenticates with a separate
  machine credential (an HMAC shared secret) and is granted only the narrow
  protocol capabilities below.
- The Connector can: heartbeat itself; claim the next task; start / heartbeat /
  progress / complete / fail / acknowledge-cancellation / release **its own
  leased task**; read its own task's cancellation state. It cannot enumerate
  user histories, read unrelated tasks, touch users/roles, alter ownership,
  priority, or `queueSequence`, or drive a task it does not hold.
- All worker mutations are Convex `internalMutation`/`internalQuery` — never
  browser-callable. The only externally reachable surface is the signed HTTP
  routes in `convex/http.ts`.

## 3. Transport

Convex **HTTP actions** (`convex/http.ts`), reached at
`https://<deployment>.convex.site`. Chosen because they run in the Convex V8
runtime with Web Crypto (`crypto.subtle`) and `process.env` access, so HMAC
verification and the shared-secret lookup happen server-side in the same place
that dispatches to the internal Convex functions — no separate Next.js route,
no public Convex admin credentials, no inbound Claudia endpoint.

```
P7 poller (claudia_system)  ──outbound HTTPS──▶  P6 signed route (convex/http.ts)
                                                   ├─ verify HMAC (no DB)
                                                   ├─ consume nonce (txn)
                                                   └─ internal Convex mutation ▶ nexusTasks
```

## 4. Connector identity

Table `nexusConnectors` (one row per Connector), created **only** by an
operator running the internal bootstrap — there is no public self-registration.
Fields: `connectorId`, `displayName`, `status` (`active|disabled|revoked`),
`enabled`, `allowedCapabilities`, `allowedToolIds?`, timestamps, `lastSeenAt?`,
`lastHeartbeatAt?`, `operatingState?`, `currentTaskId?`, `currentLeaseId?`,
`softwareVersion?`, `hostLabel?`, `environment?`, `lastErrorCode?`, error/lifecycle
timestamps, bounded `metadata?`. **No secret is stored** — a plaintext secret
field is rejected by the boundary script. Indexes: `by_connector_id`,
`by_status`, `by_last_seen_at`, `by_current_task_id`.

Ordinary users never read this table; only privacy-safe projections are exposed
(`getConnectorStatusPublic` — presence only; `getConnectorAdminProjection` —
content-free operational detail folded into the admin diagnostics query).

## 5. HMAC signing contract

Shared HMAC-SHA256 over a canonical string (`convex/lib/connectorAuth.ts`).
Headers:

| Header | Meaning |
|--------|---------|
| `x-nexus-connector-id` | Connector id |
| `x-nexus-timestamp` | integer ms since epoch |
| `x-nexus-nonce` | unique per request (16–128 url-safe chars) |
| `x-nexus-signature` | 64-char lowercase hex HMAC-SHA256 |
| `x-nexus-protocol-version` | `v1` |

Canonical string (newline-delimited, version-prefixed):

```
nexus-connector-v1
<connectorId>
<timestamp>
<nonce>
<HTTP method, uppercased>
<request path, e.g. /api/connector/v1/claim>
<SHA-256 hex of the raw request body bytes>
```

`signature = hex(HMAC_SHA256(sharedSecret, canonicalString))`

Verification order (cheap → expensive; DB only after crypto): body-size cap →
protocol-version → header/format validation → timestamp skew (±5 min) →
shared-secret lookup → **constant-time** HMAC verify (`crypto.subtle.verify`) →
nonce consume. Method + path + body-hash are all bound into the signature, so a
valid signature cannot be replayed against a different route, verb, or body.
The secret is never logged or returned.

## 6. Replay protection

Table `nexusConnectorNonces` (`by_connector_and_nonce`, `by_expires_at`). After
the signature verifies, `internal.connectorAuthStore.verifyAndConsumeNonce`
inserts the `(connectorId, nonce)` pair transactionally, throwing
`replay_detected` if already present. Nonces are retained
`P6_SIGNING.nonceTtlMs` (10 min, ≥ the ±5 min skew window) and pruned by a cron.

## 7. Endpoints

Consolidated, exact-path routes (Convex `httpRouter` has no path params; the
spec explicitly permits a strict action discriminator):

| Route | Body | Internal target |
|-------|------|-----------------|
| `POST /api/connector/v1/heartbeat` | optional health metadata | `connectorRegistry.heartbeatConnector` |
| `POST /api/connector/v1/claim` | optional `softwareVersion`/`hostLabel` | `connectorTasks.claimNextTask` |
| `POST /api/connector/v1/task` | `{ action, taskId, leaseId, ... }` | dispatched per `action` |

`/task` `action` ∈ `start | lease_heartbeat | cancellation | progress |
complete | fail | acknowledge_cancellation | release`, each mapped to exactly
one internal function with an explicit per-action field projection. There is no
generic "run any function" endpoint.

Response envelopes are stable JSON: `{ ok, requestId, protocolVersion, data }`
or `{ ok, requestId, protocolVersion, error: { code, message } }`. Stable error
codes: `connector_unauthorized`, `connector_disabled`, `connector_revoked`,
`invalid_signature`, `stale_timestamp`, `replay_detected`, `invalid_request`,
`body_too_large`, `no_task_available`/idle, `connector_busy`, `task_not_found`,
`task_not_claimed`, `wrong_connector`, `wrong_lease`, `lease_expired`,
`invalid_task_state`, `cancellation_requested`, `completion_conflict`,
`result_too_large`, `too_many_sources`, `progress_too_large`,
`protocol_version_unsupported`, `internal_error`. No raw stack traces are ever
returned.

## 8. Claim algorithm & queue ordering

`claimNextTask` (atomic): authenticate/require-active Connector → opportunistic
stale-lease recovery → single-worker guard (reject `connector_busy` if the
Connector still holds a valid lease) → scan the oldest `queued` tasks via the
canonical global index `by_status_and_priority_and_queue_sequence` → pick the
first whose `requestedToolId` is in the Connector's allowlist → mark `claimed`,
assign `leaseId` (`crypto.randomUUID()`), `claimedAt`, `leaseExpiresAt`,
`claimAttempt` → append `task_claimed` progress + audit → set the Connector's
`currentTaskId`/`currentLeaseId` → return a **bounded** envelope. Empty queue
returns `{ status: "idle", task: null }` (not an error).

The envelope contains only: `taskId`, `leaseId`, `conversationId`,
`requestMessageId`, `requestedToolId`, `requestText`, `attemptNumber`,
`createdAt`, `queueSequence`, `cancellationState`, `leaseExpiresAt`,
`protocolVersion`. **Never** owner id, email, Clerk profile, other users' tasks,
or unrelated conversation history. (Bounded conversation context, if ever
needed, is an explicit P7/P8 decision — not automatic in P6.)

Global order is preserved across users: within equal (default) priority, lower
`queueSequence` is claimed first.

## 9. Single-worker mode

`P6_CONCURRENCY.maxConcurrentTasksPerConnector = 1`. A Connector with a valid
unexpired lease cannot claim another task. The schema's scalar
`currentTaskId`/`currentLeaseId` intentionally encodes single-worker mode;
raising the limit would require a bounded-list or claims table, not just a
config change (documented so the protocol survives that later change).

## 10. Lease model

Task lease fields: `claimedByConnectorId`, `leaseId`, `leaseExpiresAt`,
`lastLeaseHeartbeatAt`, `claimAttempt`, `recoveryCount`. Config (`P6_LEASE`):
initial 2 min, heartbeat recommendation 30 s, renewal +2 min, connector-offline
threshold 90 s, `maxLeaseRecoveries` 3. Every task-scoped operation verifies, in
order: task exists → lease ownership (`task_not_claimed` / `wrong_connector` /
`wrong_lease` / `lease_expired`) → status permits the op. Terminal transitions
clear the lease fields but **keep** `claimedByConnectorId` (record of the
finishing Connector, used for idempotency + audit); a requeue clears it fully.

## 11. Task start

`start`: `claimed → running` (`startTask`). Requires the correct, unexpired
lease and `claimed` status; refuses if `cancel_requested`. Idempotent — a repeat
call from the same Connector/lease on an already-`running` task returns success.

## 12. Lease heartbeat

`lease_heartbeat` (`heartbeatTaskLease`): correct lease + status in
`claimed|running|cancel_requested`; extends `leaseExpiresAt`, updates
`lastLeaseHeartbeatAt` and the Connector's `lastHeartbeatAt`/`lastSeenAt`.
Returns `{ status, leaseExpiresAt, cancellationRequested }` so the poller learns
about a user cancellation even though Claudia has no inbound channel. Heartbeats
never append user-visible progress. `cancellation` (`getTaskCancellationState`,
a read-only query) reports the same without extending the lease.

## 13. Connector-level heartbeat

`heartbeat` (`heartbeatConnector`): bounded health metadata only —
`softwareVersion`, `hostLabel`, `environment`, `operatingState`
(`idle|claiming|running|degraded`), `lastErrorCode`. No free-form logs, no
filesystem paths, no private network detail. Updates `lastSeenAt`,
`lastHeartbeatAt`, and the status projection.

## 14. Progress

`progress` (`appendConnectorProgress`): correct lease + active status; bounded
message length; `stage` restricted to `accepted|retrieving|analyzing|
synthesizing|finalizing`; optional clamped `percent`. Appends a user-safe
`tool_progress` event. No stdout/stderr, shell output, chain-of-thought, or
unrestricted JSON.

## 15. Cancellation

1. User cancels a `queued` task → `cancelled` immediately; never claimable.
2. User cancels a `claimed`/`running` task → `cancel_requested`; the lease stays
   with the Connector, which sees it via the next lease heartbeat /
   cancellation check.
3. Connector `acknowledge_cancellation` (`acknowledgeCancellation`) →
   `cancelled`, lease + Connector current-task cleared, progress/audit appended.
4. Completing or failing a `cancel_requested` task is refused
   (`cancellation_requested`) — the Connector must acknowledge cancellation
   explicitly.

## 16. Completion

`complete` (`completeTask`): require correct unexpired lease and `running`
status → write the one canonical result (owner **copied from the task**, never
from the payload) → replace bounded ordered sources → append one assistant
`result_summary` message → transition `running → completed` (clears lease) →
clear the Connector's current task → progress/audit. Whole operation is one
atomic Convex mutation (no partial "result stored but task still running"
state). Repeat completion from the same Connector is idempotent (returns the
canonical result, writes nothing new); a **different** Connector completing an
already-completed task is rejected `completion_conflict`. A second, different
result never overwrites a completed task.

## 17. Failure

`fail` (`failTask`): correct lease + `claimed|running` → `failed` with a bounded
`errorCode` + user-safe message (no stack traces, env, stderr, secrets, or
paths) → append a user-visible system `error` message → clear lease + Connector
current task → progress/audit. Remains user-retryable under P5's existing rules
(retry creates a new queued task). Idempotent for the same Connector.

## 18. Stale-lease recovery & execution safety

`recoverStaleLeases` (cron every 60 s + opportunistic in `claimNextTask`).
A task is stale when its status is `claimed|running|cancel_requested` and
`leaseExpiresAt` is in the past (index `by_status_and_lease_expires_at`). Policy
by `executionSafety` class (`convex/lib/p6config.ts`):

- **`claimed`** (never started, no side effects): safely requeued, keeping its
  original `queueSequence` (fairness).
- **`running`**: requeued **only** if the tool is `read_only_idempotent`
  (every P5 tool today) **and** `recoveryCount ≤ maxLeaseRecoveries`; otherwise
  `failed` with retryable `connector_lease_expired`. Unknown tools default to
  `non_idempotent` → failed, never blindly re-run.
- **`cancel_requested`**: finalized to `cancelled` (intent is unambiguous).

Recovery clears the Connector's current task, bumps `recoveryCount`, and writes
`task_lease_recovered` audit. Active unexpired leases are never touched.

Execution-safety classes: `read_only_idempotent`, `write_requires_confirmation`,
`non_idempotent`. P6 only ever auto-requeues `read_only_idempotent` work.

## 19. Ownership inheritance

Every worker write (result, sources, assistant/system message, progress, audit,
transition) copies `ownerClerkUserId` from the task record — never from a
request argument. Claiming changes scheduling state, never ownership. Cross-user
reads still fail with a generic `*_not_found`; `nexus_admin` still cannot read
private content (only the content-free aggregate + Connector projection).

## 20. Status UI

- `SystemPresenceLive` (sidebar + Status page) reads the truthful, content-free
  `getConnectorStatusPublic` presence (`not_configured | offline | online_idle |
  online_busy | degraded | disabled`), gated on P5.1 auth readiness, and maps it
  to the existing presence card. No redesign; welcome/answer/sources/composer/
  diagnostics/sidebar all preserved.
- Chat copy updated to distinguish persistence from execution ("Nexus saves it
  privately and queues it … Execution begins when the Claudia Connector is
  online"); stale "(planned)" markers removed.
- Admin diagnostics gains a content-free `connector` projection (presence,
  operating state, heartbeat timestamps, protocol/software version) — never task
  content.

## 21. User submission while offline

Unchanged from P5/P5.1: requests are still persisted and queued while the
Connector is offline; the UI states "saved · queued · waiting for the Claudia
Connector". No execution time is promised, nothing is discarded. An optional
accumulation cap lives in `P6_QUEUE.maxAccumulatedQueuedTasks` (default
unlimited).

## 22. Environment variables

Set in the **Convex deployment** environment (`npx convex env set …`), never in
`NEXT_PUBLIC_*`, never in a table, never in client code:

- `NEXUS_CONNECTOR_ID` — the canonical Connector id.
- `NEXUS_CONNECTOR_SHARED_SECRET` — its HMAC secret (≥ 32 random chars).
- (multi-Connector, optional) `NEXUS_CONNECTOR_SECRET_<NORMALIZED_ID>`.

`scripts/check-nexus-env.sh` reports presence only (never values).

## 23. Bootstrap procedure (operator)

1. Generate a strong secret (e.g. `openssl rand -hex 32`).
2. `npx convex env set NEXUS_CONNECTOR_ID <id>` and
   `npx convex env set NEXUS_CONNECTOR_SHARED_SECRET <secret>`.
3. Create the identity row:
   `npx convex run connectorRegistry:bootstrapConnector '{"connectorId":"<id>","displayName":"Claudia Mac"}'`.
4. Lifecycle changes later via
   `connectorRegistry:setConnectorStatus '{"connectorId":"<id>","status":"disabled"}'`.

(Real secrets are never placed in docs or committed.)

## 24. Tests

56 new P6 tests (`convex-test`, real HMAC + real HTTP routing via `t.fetch`):

- `tests/nexus-p6-auth.test.ts` (14) — signing round-trip; valid signed request;
  invalid/malformed signature; unknown/disabled/revoked Connector; stale/future
  timestamp; replay; modified body/route/method; oversized body; secret never
  returned; stable error codes only.
- `tests/nexus-p6-claim-lease.test.ts` (11) — oldest-eligible claim; global order
  across users; single-worker `connector_busy`; idle; cancelled/unsupported-tool
  skipped; bounded envelope (no owner/email); start wrong-connector/wrong-lease;
  start idempotent; heartbeat extend + cancellation signal; no client
  queueSequence/priority.
- `tests/nexus-p6-lifecycle.test.ts` (13) — completion (one result, ordered
  sources, one assistant message, owner-copied, lease cleared); wrong
  connector/lease; duplicate idempotent + cross-connector conflict; cross-user &
  admin cannot read; failure clears lease + retryable + idempotent; cancellation
  ack + completion-after-cancel refused; connector cleared on terminal; recovery
  (claimed requeue keeps sequence, running read-only requeue, cancel_requested →
  cancelled, over-max → failed, active lease untouched).
- `tests/nexus-p6-ui.test.tsx` (6) — presence mapping; Nexus Chat heading +
  Welcome preserved; persistence/execution copy; no stale "(planned)"; truthful
  not-configured card; Status page copy.
- `tests/nexus-p6-boundary.test.ts` (12) — config policy; worker functions
  internal-only; no self-registration; client boundary references only the
  public status query; no secret in schema/non-auth modules; no task deletion;
  one canonical queue; owner copied from task; no Claudia/P7 code.

All 178 prior P4/P5/P5.1 tests still pass (234 total).

## 25. Validation

| Check | Result |
|-------|--------|
| `npx convex codegen` | Pass (connected to the linked deployment) |
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm test` | Pass — 234 tests, 26 files |
| `npm run build` | Pass |
| `./scripts/verify-nexus-boundary.sh` | Pass (P6 rules added) |
| `./scripts/check-nexus-env.sh` | Pass (P6 vars reported present/missing; `CLERK_WEBHOOK_SECRET` missing is pre-existing) |

Protocol smoke coverage (invalid signature / stale timestamp / replay / valid
heartbeat / idle / claim / busy / start / lease heartbeat / progress /
completion / user-visible result / wrong lease / duplicate idempotency /
connector-status transition) is exercised by the automated route-level tests
above. No `claudia_system` call and no real Claudia execution occurs.

## 26. P7 boundary / handoff

P6 stops at the Nexus/Convex control plane. The next required work is the P7
**outbound polling loop inside `claudia_system`** — see
`docs/specs/nexus_p6_p7_connector_handoff_contract_v1.md` for the exact,
binding contract it must implement. No Claudia-side code was written in P6.
