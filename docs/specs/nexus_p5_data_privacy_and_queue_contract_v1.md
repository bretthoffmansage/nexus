# Nexus P5 — Data Privacy and Queue Contract (v1)

**Package:** P5 — Canonical privacy/queue contract for all later Connector/worker work
**Status:** Authoritative contract — binding on P6+ (Console Connector) and any trusted worker
**Date:** 2026-06-30
**Related:** `docs/specs/nexus_p5_private_conversations_tasks_shared_queue_v1.md`,
`docs/specs/nexus_p6_trusted_connector_queue_protocol_v1.md` (P6 implements this contract)

This document is the canonical contract that later Connector work **must**
honor. Where any future implementation conflicts with this contract, this
contract governs until explicitly superseded by a new versioned spec plus an
operator decision.

> **P6 status (2026-07-01):** The trusted Connector queue protocol is now
> implemented on the Nexus/Convex side and honors this contract in full:
> ownership is copied from the task record on every worker write (never from a
> Connector payload), claiming changes only scheduling state (never ownership,
> priority, or `queueSequence`), worker functions are internal-only, the global
> queue is never exposed to ordinary users, and `nexus_admin` still receives no
> private content. The local execution poller (P7, inside `system`)
> remains unimplemented. See the P6 spec and the P6→P7 handoff contract.

## 1. Two visibility planes

Nexus data has exactly two visibility planes, and they must never be conflated:

1. **Owner-private plane** — conversations, messages, tasks, results, sources,
   progress events, and audit events are visible only to the Clerk subject that
   owns them. This is the plane every browser-facing query and mutation operates
   on.
2. **Global queue plane** — the ordered set of tasks awaiting execution. Its
   ordering (`queueSequence`, `priority`, `status`) is visible only to trusted
   worker authority (the future Console Connector). It is never enumerable by an
   ordinary user.

## 2. Ownership derivation (non-negotiable)

- Ownership is derived solely from the verified Convex identity
  `ctx.auth.getUserIdentity().subject` (the Clerk subject).
- The following are **never** trusted as inputs from the browser: `clerkUserId`,
  `ownerId`, `userId`, `requestingUserId`, `role`, `permission`, `email`,
  conversation owner, task owner, `queueSequence`, `priority`.
- A browser may submit a document id; Convex must independently confirm the
  authenticated subject owns that record before returning or modifying it.
- Unauthorized or missing records return a generic `*_not_found` — identical in
  both cases — so record existence never leaks.

## 3. Queue visibility contract

- Queue visibility is **global only to trusted worker authority**. User
  visibility is **owner-private**.
- Ordinary users must not be able to enumerate, count, or infer the full global
  queue, nor learn any other user's identity, task title, request text, result,
  or sources.
- The global indexes (`by_status_and_priority_and_queue_sequence`,
  `by_status_and_queue_sequence`, `by_queue_sequence`) must never back a public
  user query. In P5 they back only the admin-gated aggregate diagnostics
  (counts and one timestamp — no content) and are reserved for the future
  worker's claim query.
- Any user-visible queue position is limited to a truthful status
  ("Queued — waiting for the Console Connector"); no cross-user counts.

## 4. Global ordering guarantees

- `queueSequence` is a server-allocated, monotonically increasing integer from a
  singleton counter, unique and gap-free under concurrency (Convex OCC).
- Order is never derived from client timestamps. Clients cannot supply or alter
  `queueSequence` or `priority`. All user-created tasks start at the default
  priority; users cannot jump the queue.
- Within equal priority, lower `queueSequence` executes first. The Connector
  claims the oldest eligible `queued` task. Cancelled/terminal tasks are not
  queue-eligible.

## 5. Worker API obligations (P6+)

Any future Connector or trusted worker must:

- **Preserve owner ids on claim.** Claiming a task must not alter its
  `ownerClerkUserId`. A claim changes scheduling state, never ownership.
- **Inherit task ownership for all writes.** Results, sources, progress events,
  and assistant/system messages written for a task must copy
  `ownerClerkUserId` from the task record — never from a request argument. This
  is already enforced by the P5 internal mutations
  (`writeTaskResultInternal`, `replaceTaskSourcesInternal`,
  `appendTaskProgressInternal`, `appendAssistantMessage`,
  `appendSystemMessage`, `transitionTaskInternal`).
- **Never return unrelated user content to ordinary users.** A worker API must
  not become a side channel through which one user reads another user's data.
- **Never expose worker-only surfaces to the browser.** Claims, leases,
  heartbeats, completion, and failure are worker transitions. They must remain
  internal/authenticated-worker only and must never be public browser mutations.
- **Respect the status lifecycle** in `convex/lib/taskStatus.ts`. All
  transitions go through the centralized validator.

## 6. User-facing result revalidation

- Every user-facing result/source/progress query must revalidate ownership from
  the verified identity before returning anything, even for results written by a
  trusted worker. Worker authorship does not bypass owner checks.
- Exactly one canonical result exists per task (replaced in place if rewritten).

## 7. Administrator privacy boundary

- Administrators (`nexus_admin`) do **not** automatically gain private-content
  access. Identity administration (approval, roles) and content-free aggregate
  diagnostics are the extent of admin power in P5.
- Reading any user's conversations, messages, tasks, results, or sources would
  require a separate, explicit permission and an operator decision that does not
  exist in P5. No admin content browser exists.
- Aggregate diagnostics must contain counts and coarse timestamps only — never
  message text, request text, result content, source excerpts, or titles.

## 8. Data minimization

The following must never be stored: full Clerk profile JSON, session tokens,
JWTs, passwords, raw webhook payloads, model chain-of-thought, complete local
vault documents, complete transcript bodies, unrestricted tool logs/stdout/
stderr, local filesystem paths, or Connector secrets. Store only what is
required for user-visible history, execution coordination, bounded results,
provenance, and auditability. All user-controlled fields are length- and
count-bounded (see `convex/lib/p5config.ts`).

## 9. Idempotency contract

- Task submission and retry are idempotent, scoped to
  `(ownerClerkUserId, idempotencyKey)`.
- A retried call returns the original ids and creates no duplicate conversation,
  message, or task.
- The same idempotency key under two different owners produces two independent
  tasks; keys never convey ownership and never collide across users.

## 10. Stable error codes

`convex/lib/errors.ts` defines stable application error codes; raw database
errors are never exposed. P5 codes: `conversation_not_found`,
`message_not_found`, `task_not_found`, `invalid_task_state`, `invalid_tool`,
`request_too_large`, `idempotency_conflict`, `retry_not_allowed`,
`cancellation_not_allowed`, `queue_unavailable`, `result_not_available` (plus
the P4 identity codes).
