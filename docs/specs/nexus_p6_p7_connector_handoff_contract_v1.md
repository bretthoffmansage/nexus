# Nexus P6 → P7 Connector Handoff Contract (v1)

**Package:** Binding contract for the future local Connector poller (P7) inside `claudia_system`
**Status:** Authoritative — P7 must implement exactly this. P6 (Nexus/Convex side) is complete; P7 is **not** started.
**Date:** 2026-07-01
**Related:** `docs/specs/nexus_p6_trusted_connector_queue_protocol_v1.md`

This document is the exact wire contract the P7 outbound poller (running on the
Claudia Mac, inside `claudia_system`) must speak to Nexus. Nothing in this
contract is implemented in `claudia_system` yet. Where P7 conflicts with this
document, this document governs until superseded by a versioned successor.

## 1. Base URL & protocol

- Base URL: the Convex **HTTP actions** origin — `https://<deployment>.convex.site`
  (note `.convex.site`, not `.convex.cloud`). Configure as
  `NEXUS_CONNECTOR_BASE_URL` on the Claudia side.
- Protocol version: `v1`. Send header `x-nexus-protocol-version: v1`.
- All requests are `POST` with a JSON body (may be `{}`), outbound only. Nexus
  never calls Claudia; there is no inbound endpoint on the Claudia side.

## 2. Credentials (Claudia side)

- `NEXUS_CONNECTOR_ID` and `NEXUS_CONNECTOR_SHARED_SECRET` — provisioned by the
  operator; identical to the Convex deployment env values. Store them in the
  Claudia machine's secret store, **never** in source, logs, or client-visible
  config. The secret is used only to compute HMACs; it is never transmitted.

## 3. Required headers (every request)

| Header | Value |
|--------|-------|
| `content-type` | `application/json` |
| `x-nexus-connector-id` | `NEXUS_CONNECTOR_ID` |
| `x-nexus-timestamp` | current time in **integer milliseconds** since epoch |
| `x-nexus-nonce` | fresh unique token, 16–128 chars from `[A-Za-z0-9_.-]` |
| `x-nexus-signature` | lowercase hex HMAC-SHA256 (see §4) |
| `x-nexus-protocol-version` | `v1` |

Clock skew: the timestamp must be within **±5 minutes** of Nexus server time.
Keep the Claudia clock NTP-synced. Generate a new nonce per request (a UUID or
128-bit random hex is fine); never reuse one.

## 4. Signing (pseudocode)

```
bodyString   = JSON.stringify(body)          // exact bytes you will send; "" if no body
bodySha256   = hex(SHA256(utf8(bodyString)))
canonical    = "nexus-connector-v1" + "\n" +
               connectorId          + "\n" +
               timestamp            + "\n" +   // same string as the header
               nonce                + "\n" +
               "POST"               + "\n" +   // uppercased HTTP method
               path                 + "\n" +   // URL pathname only, e.g. /api/connector/v1/claim
               bodySha256
signature    = hex(HMAC_SHA256(sharedSecret, utf8(canonical)))
```

Bind the **exact** body bytes you transmit (serialize once, sign and send the
same string). `path` is the URL pathname with no host and no query string.
Method and path are part of the signature, so a signature is valid for exactly
one route+verb+body.

## 5. Response envelope

Success: `{ "ok": true, "requestId", "protocolVersion": "v1", "data": { … } }`
Error: `{ "ok": false, "requestId", "protocolVersion": "v1", "error": { "code", "message" } }`

Treat any non-2xx or `ok:false` as a failure of that call (see §14 for
retry/idempotency). Never parse or depend on `message` text — branch on `code`.

## 6. Clock-skew requirement

The Connector's timestamp must be within ±5 minutes of server time or the
request is rejected `stale_timestamp`. If you see repeated `stale_timestamp`,
resync the clock — do not widen retries.

## 7. Nonce generation

One fresh nonce per HTTP request (including retries — a retried request is a new
signed request with a new nonce and timestamp). Reusing a nonce returns
`replay_detected`.

## 8. Heartbeat cadence

- **Connector health:** `POST /api/connector/v1/heartbeat` roughly every 30 s
  while running, and at least once per offline-threshold window (90 s) to stay
  "online". Body (all optional): `{ softwareVersion, hostLabel, environment,
  operatingState: "idle"|"claiming"|"running"|"degraded", lastErrorCode }`.
- **Task lease:** while executing a task, send a lease heartbeat (§11) about
  every 30 s and always before `leaseExpiresAt`.

## 9. Claim

`POST /api/connector/v1/claim` — body optional `{ softwareVersion, hostLabel }`.

- Idle: `data = { "status": "idle", "task": null }` → sleep, then poll again.
- Claimed: `data = { "status": "claimed", "task": { taskId, leaseId,
  conversationId, requestMessageId, requestedToolId, requestText, attemptNumber,
  createdAt, queueSequence, cancellationState, leaseExpiresAt, protocolVersion } }`.
- `connector_busy` → you still hold a task; finish or release it first (you
  should not normally claim while busy in single-worker mode).

Store `taskId` + `leaseId`; both are required for every subsequent task call.

## 10. Start

`POST /api/connector/v1/task` body `{ action: "start", taskId, leaseId }` →
transitions `claimed → running`. Idempotent. Call once before doing work.

## 11. Task lease heartbeat

`POST /api/connector/v1/task` body `{ action: "lease_heartbeat", taskId, leaseId }`
→ `data = { status, leaseExpiresAt, cancellationRequested }`. Renew before
`leaseExpiresAt`. **If `cancellationRequested` is true, stop work and go to
§13.** A cheaper read-only check is `{ action: "cancellation", taskId, leaseId }`
(same shape, does not extend the lease).

## 12. Progress

`POST /api/connector/v1/task` body `{ action: "progress", taskId, leaseId,
message?, stage?, percent? }`. `stage` ∈ `accepted | retrieving | analyzing |
synthesizing | finalizing`. Keep `message` short and user-safe — **never**
stdout/stderr, shell output, chain-of-thought, secrets, or filesystem paths.

## 13. Cancellation handling

If a lease heartbeat / cancellation check reports `cancellationRequested: true`
(or you otherwise learn of it): stop execution and send
`{ action: "acknowledge_cancellation", taskId, leaseId }` → task becomes
`cancelled`. Do **not** send `complete` or `fail` for a cancel-requested task —
those return `cancellation_requested`.

## 14. Completion

`POST /api/connector/v1/task` body `{ action: "complete", taskId, leaseId,
answerText, format?: "markdown"|"plain", sources?: [{ sourceType, title,
locator?, excerpt?, provenanceLabel? }], model?, toolId?, durationMs? }`.
`sourceType` ∈ `vault_note | membership_transcript | web | file | other`.
Bounds are enforced server-side (answer length, ≤ 50 sources, excerpt length).
Repeating an identical completion is idempotent; a conflicting later completion
is rejected `completion_conflict`.

## 15. Failure

`POST /api/connector/v1/task` body `{ action: "fail", taskId, leaseId, errorCode,
userSafeMessage, retryable?, stage? }`. Send only bounded, user-safe fields —
**never** a stack trace, exception dump, env var, stderr, secret, or path. The
task becomes `failed` and stays user-retryable. Idempotent.

## 16. Optional early release

`POST /api/connector/v1/task` body `{ action: "release", taskId, leaseId, reason? }`
returns a `claimed` (not yet started) task to `queued`, keeping its queue
position. Only valid before `start`.

## 17. Retry behavior for network errors

- On a network/timeout error with no parsed response, retry the **same logical
  operation** with a **new nonce + timestamp** (and thus a new signature), with
  bounded exponential backoff. All task operations are safe to retry:
  start/heartbeat/complete/fail/ack are idempotent for the same
  `(connectorId, taskId, leaseId)`.
- Do not retry through a `lease_expired` — instead stop, re-`claim`, and only
  resume work if you get the task again.

## 18. Idempotency & lease-expiry behavior

- Idempotent operations return the canonical current state on repeat.
- If any task call returns `lease_expired`, `wrong_lease`, `wrong_connector`, or
  `task_not_claimed`: **stop working on that task immediately** and discard its
  `leaseId`. Nexus's stale-lease recovery may have requeued or failed it. Go
  back to `claim`.
- `read_only_idempotent` tasks (all current tools) may be safely re-executed
  after recovery; never assume a write-side effect succeeded across a lease
  loss.

## 19. Safe logging rules

Log only: `requestId`, `taskId`, `leaseId`, action, response `code`, timing.
**Never** log the shared secret, signatures, full request bodies containing user
content, `answerText`, source excerpts, or request text. No filesystem paths of
user data.

## 20. Secrets handling

The shared secret is read once from the machine secret store into memory, used
only for HMAC, and never transmitted, logged, or written to disk in plaintext.
Rotating it is an operator action on both sides (Convex env + Claudia store).

## 21. Single-task loop (pseudocode)

```
loop forever:
    heartbeatConnector(operatingState = idle)          # ~every 30s regardless
    res = claim()
    if res.data.status == "idle":
        sleep(pollInterval); continue
    task = res.data.task
    start(task.taskId, task.leaseId)
    startLeaseHeartbeatTimer(task, every ~30s)         # renew before expiry
    try:
        for each phase of Claudia execution:
            hb = leaseHeartbeat(task.taskId, task.leaseId)
            if hb.cancellationRequested:
                acknowledgeCancellation(task.taskId, task.leaseId); break out
            progress(task.taskId, task.leaseId, stage=…, message=…)
            … run read-only retrieval via Claudia locally …
        if not cancelled:
            complete(task.taskId, task.leaseId, answerText, sources, …)
    catch userSafeError e:
        fail(task.taskId, task.leaseId, e.code, e.userSafeMessage)
    catch leaseLost:                                    # lease_expired/wrong_lease
        stop work; discard lease                        # recovery will handle it
    finally:
        stopLeaseHeartbeatTimer()
    # loop back to claim
```

## 22. What P7 must NOT do

- Do **not** expose any inbound HTTP endpoint on the Claudia machine.
- Do **not** open a public tunnel or accept Nexus-initiated connections.
- Do **not** hold Convex deployment admin credentials or call Convex functions
  directly — only the signed HTTP routes in this contract.
- Do **not** send raw stdout/stderr, chain-of-thought, secrets, filesystem
  paths, or full documents in progress/results/errors.
- Do **not** claim more than one task at a time (single-worker mode).
- Do **not** invent new actions, routes, or a second queue; do not delete or
  mutate tasks except via the actions above.
- Do **not** trust or send an owner id, role, priority, or `queueSequence` —
  Nexus derives all of those; the Connector only ever echoes `taskId`/`leaseId`.
- Do **not** re-run a `non_idempotent` tool after a lease loss without operator
  confirmation (P6 only auto-requeues `read_only_idempotent` work).

## 23. Provisioning prerequisite (before P7 runs)

The operator must have completed the P6 bootstrap (see the implementation spec
§23): set the Convex env vars, and created the `nexusConnectors` row via
`connectorRegistry:bootstrapConnector`. Until then, `claim`/`heartbeat` return
`connector_unauthorized`.
