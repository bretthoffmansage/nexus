# Nexus P5 — Private Conversations, Persistent Tasks, and Shared Queue (v1)

**Package:** P5 — Private hosted conversations, persistent tasks, shared queue coordination
**Status:** Complete — persistence + queue implemented; no execution (Connector is P6+)
**Date:** 2026-06-30 (audited and re-validated by a takeover pass on 2026-07-01: full validation
suite re-run clean, including a successful `npx convex codegen` against the linked deployment; no
code changes were required)
**Related:**
`docs/specs/nexus_p5_data_privacy_and_queue_contract_v1.md` (canonical privacy/queue contract),
`docs/specs/nexus_p4_4_legacy_workspace_frontend_port_v1.md`,
`docs/specs/nexus_vercel_convex_architecture_correction_v1.md`

## 1. Summary

P5 establishes the canonical hosted persistence and queue model that later
Connector and Claudia execution phases will use. Approved users can now create
and reopen **private conversations**, submit **persisted requests** from Nexus
Chat, and see **real private tasks** in the Tasks workspace. Each submitted
request creates a **queued task** ordered by a deterministic global sequence.

No task executes. Queued work honestly waits for the future Console Connector.
P6 (Connector APIs, HMAC, claims, leases, heartbeats, execution) is **not**
started.

## 2. Domain terminology

| Term | Meaning |
|------|---------|
| **Conversation** | A private user-owned thread containing ordered messages and one or more tasks. Never called a "session" (Clerk owns that term). |
| **Message** | An append-only entry authored by the user, assistant, or system. The browser may only create `user`/`text` messages. |
| **Task** | A durable queued work request that a future trusted worker will claim and execute. |
| **Result** | The structured completion payload produced later by a trusted worker. |
| **Source** | A bounded provenance record attached to a task result. |
| **Progress event** | A bounded chronological status event for a task. |

## 3. Ownership and authentication

Ownership is **always** derived from the verified Convex identity
(`ctx.auth.getUserIdentity().subject` — the Clerk subject), never from a
browser-provided `clerkUserId`, `ownerId`, `userId`, `role`, `email`, or queue
position. The browser may submit a conversation/task document id, but Convex
independently verifies the authenticated subject owns that record first.

Helpers (`convex/lib/ownership.ts`):

- `getCurrentApprovedClerkUserId(ctx)` — authenticated + approved + active.
- `requireApprovedRole(ctx, role)` / `requireKnowledgeReader(ctx)`.
- `requireOwnedConversation` / `requireOwnedTask` / `requireOwnedMessage`.
- `assertConversationTaskLink` / `assertTaskMessageLink` (cross-record integrity).

Cross-user access returns a generic `conversation_not_found` / `task_not_found`
— identical whether the record is missing or owned by someone else — so
existence never leaks.

Every user-facing function: (1) authenticates, (2) requires an approved active
user, (3) requires `knowledge_reader`, (4) derives the subject, (5) verifies
ownership server-side.

## 4. Convex schema

Tables added in `convex/schema.ts` (all owner-scoped by `ownerClerkUserId`):

| Table | Purpose |
|-------|---------|
| `nexusConversations` | Private threads (title, status active/archived, timestamps). |
| `nexusMessages` | Append-only messages (author, kind, content, sequence, optional taskId). |
| `nexusTasks` | Durable queued tasks (status, queueSequence, priority, idempotencyKey, retry lineage, timestamps, bounded result summary/error). |
| `nexusTaskProgressEvents` | Bounded chronological per-task status events. |
| `nexusTaskSources` | Bounded provenance records (excerpt-limited). |
| `nexusTaskResults` | One canonical result per task. |
| `nexusTaskAuditEvents` | Owner-private conversation/task lifecycle audit. |
| `nexusQueueCounter` | Singleton monotonic allocator for the global queue sequence. |

### Indexes

- `nexusConversations`: `by_owner_and_updated_at`, `by_owner_and_status_and_updated_at`, `by_owner_and_created_at`.
- `nexusMessages`: `by_conversation_and_sequence`, `by_owner_and_created_at`, `by_task`.
- `nexusTasks` (user-private): `by_owner_and_created_at`, `by_owner_and_status_and_created_at`, `by_owner_and_conversation_and_created_at`, `by_owner_and_idempotency_key`.
- `nexusTasks` (global future-worker, **not exposed to ordinary user queries**): `by_status_and_priority_and_queue_sequence`, `by_status_and_queue_sequence`, `by_queue_sequence`.
- `nexusTasks` (retry): `by_retry_of_task`.
- `nexusTaskProgressEvents`: `by_task_and_sequence`, `by_owner_and_created_at`.
- `nexusTaskSources`: `by_task_and_ordinal`, `by_owner_and_created_at`.
- `nexusTaskResults`: `by_task`, `by_owner_and_created_at`.
- `nexusTaskAuditEvents`: `by_owner_and_at`, `by_task_and_at`.
- `nexusQueueCounter`: `by_key`.

## 5. Role / permission policy

`convex/lib/permissions.ts`. `knowledge_reader` gains only minimal owner-scoped
permissions: `conversations.create/read_own/update_own`,
`messages.create_own/read_own`, `tasks.create_own/read_own/cancel_own/retry_own`,
`sources.read_own`, `results.read_own`.

`nexus_admin` gains only `diagnostics.read` (aggregate, content-free). It
receives **no** private-content permission: being an administrator never grants
reading other users' chats. No `*_all`, `queue.read_global`, `queue.manage`,
`tasks.claim/complete/fail` permission exists at all.

## 6. Conversation, message, task functions

- `convex/conversations.ts`: `createConversation`, `listMyConversations`, `getMyConversation`, `renameMyConversation`, `archiveMyConversation`, `reopenMyConversation`, `getConversationTranscript`. Titles are whitespace-normalized and length-limited; archived conversations are excluded by default; no deletion (archive only).
- `convex/messages.ts`: `listMyConversationMessages` (public query). `appendAssistantMessage` / `appendSystemMessage` are **internalMutation** — the browser can never author an assistant message; ownership is copied from the conversation.
- `convex/tasks.ts`: `submitKnowledgeRequest` (canonical submission), `listMyTasks`, `listMyTasksByStatus`, `getMyTask`, `myTaskCounts`, `cancelMyTask`, `retryMyTask`, and `transitionTaskInternal` (internal worker/test mover).

### Supported initial tool IDs

Tightly controlled (`convex/lib/p5config.ts`): `vault.agentic_retrieval`
(default) and `membership_io.transcript_retrieve`. Any other `requestedToolId`
is rejected with `invalid_tool`. No Hermes routing in P5.

### Submission flow (`submitKnowledgeRequest`)

1. require approved `knowledge_reader`; 2. validate idempotency key, request
text length, tool id; 3. idempotency short-circuit (return original ids on
replay); 4. resolve owned conversation or create one (default title derived from
the first request — **no model call**); 5. append the user message; 6. allocate
the global `queueSequence`; 7. insert the `queued` task; 8. link message→task;
9. write `task_created` + `task_queued` progress; 10. audit; 11. touch
conversation timestamps; 12. return only user-safe ids + status.

## 7. Idempotency

Scoped to `(ownerClerkUserId, idempotencyKey)` via
`by_owner_and_idempotency_key`. Keys are validated (8–200 chars, URL/UUID-safe).
A retried submission returns the original conversation/message/task ids and
creates no duplicates. The same key under two different users yields independent
tasks (no cross-user collision). The key never conveys ownership.

## 8. Global queue ordering

`convex/lib/queue.ts` allocates `queueSequence` from the singleton
`nexusQueueCounter` row. Convex OCC retries any concurrent writer whose read set
was mutated, so allocations are unique and gap-free under concurrency. Order is
never derived from client timestamps; the client cannot supply or alter
`queueSequence` or `priority` (server-owned; default priority 100).

Scheduling is global; visibility is private. Within equal priority, lower
`queueSequence` runs first. The future Connector will claim the oldest eligible
`queued` task via the global indexes. Ordinary users cannot enumerate the global
queue — there is no public query over the global indexes.

### User-visible queue behavior

Truthful status only: **"Queued — waiting for the Claudia Connector."** No
numerical global position is exposed (avoids any cross-user inference). Each
user sees only their own tasks.

## 9. Task status lifecycle

Centralized in `convex/lib/taskStatus.ts`. Statuses: `queued`,
`cancel_requested`, `cancelled`, `claimed`, `running`, `completed`, `failed`.
Allowed transitions:

```
queued    → claimed | cancel_requested | cancelled
claimed   → running | cancel_requested
running   → completed | failed | cancel_requested
cancel_requested → cancelled
completed | failed | cancelled → (terminal)
```

P5 user state is only `queued`; the worker transitions are reserved for P6 and
enforced now so they cannot be driven from the browser. `transitionTaskInternal`
is the only mover and is internal-only.

## 10. Cancellation

`cancelMyTask(taskId)` — owner-verified. A `queued` task transitions directly to
`cancelled` (no worker holds it). Repeated cancellation is idempotent.
Completed/failed tasks return `cancellation_not_allowed`. The task and original
message are never deleted; a `task_cancelled` progress + audit event is written.

## 11. Retry

`retryMyTask(taskId, idempotencyKey)` — creates a **new** queued task (never
mutates the original). Eligible original statuses: `failed`, `cancelled`. Sets
`retryOfTaskId`, increments `attemptNumber`, preserves conversation, request
text and tool id, allocates a new `queueSequence`, and is idempotent. Retry
depth is bounded.

## 12. Internal future-worker functions

Reserved for P6 / trusted worker, exposed only as `internalMutation` (never
browser-callable). Ownership is copied from the task record, never trusted from
an argument:

- `tasks.transitionTaskInternal`
- `taskResults.writeTaskResultInternal` (one canonical result per task)
- `taskSources.replaceTaskSourcesInternal` (count- and excerpt-bounded)
- `taskProgress.appendTaskProgressInternal`
- `messages.appendAssistantMessage` / `messages.appendSystemMessage`

## 13. Admin diagnostics (privacy-safe)

`convex/diagnostics.ts` — `adminQueueDiagnostics` requires `nexus_admin` and
returns aggregate counts by status, total, and the oldest queued timestamp only.
No message text, request text, result content, source excerpts, titles, or
per-user history. It is the only function permitted to read across owners and it
exposes no row contents.

## 14. Limits and data minimization

Centralized in `convex/lib/p5config.ts` (`P5_LIMITS`): conversation title (200),
request (8 000), message (16 000), result (100 000), result summary (500), source
title (300), locator (2 000), excerpt (500), max sources/task (50), progress
message (1 000), page sizes, retry depth (10), idempotency key length, recent
history limits. P5 never stores Clerk profile JSON, tokens/JWTs, raw webhook
payloads, chain-of-thought, full vault documents, complete transcript bodies,
unrestricted tool logs, or local filesystem paths.

## 15. UI integration

The Nexus Chat page is preserved; persistence was added without redesign.

- **Composer** (`components/chat/ChatComposer.tsx`): enabled for approved
  `knowledge_reader`s, manages input, generates an idempotency key per submit,
  prevents double-submit, clears only on success, surfaces accessible errors.
  Defaults remain disabled so the standalone placeholder is unchanged.
- **Workspace** (`components/chat/NexusChatWorkspace.tsx`): a client orchestrator
  using a shared `ChatSessionContext`. Welcome/Answer/Sources regions preserved;
  active conversations show the transcript + a truthful status line.
- **Request history** (`components/history/TaskHistorySection.tsx`): live private
  conversation list (own only); clicking reopens a conversation.
- **New request** (sidebar): enabled for readers; starts a fresh draft.
- **Tasks workspace** (`components/workspace/port/TasksWorkspace.tsx` +
  `MyTasksPanel.tsx`): real private tasks with All/Queued/Running/Completed/
  Failed/Cancelled views and a detail panel (request, status, submitted time,
  queue note, progress, result, sources, cancel/retry). The ported legacy
  scheduled-prompt editor is preserved as a separate connector-required section.
- Components import typed operations from the `lib/nexus/p5Client.ts` boundary,
  not raw Convex references.

### Connector-absent UX

Availability moved from `connector_required` to a precise split:
`persistence_available` ("Saved · execution pending") with an explicit
"Execution waits for the Claudia Connector (not configured yet)" message.
Requests are saved and queued; no fake answer is shown. Config flag
`P5_QUEUE.allowQueueWithoutConnector` (default `true`) governs accepting queued
work before a Connector exists.

## 16. Tests

`convex-test` (added dev dependency) drives real Convex functions with two
mocked Clerk identities. New suites:

- `tests/nexus-p5-privacy.test.ts` (20) — cross-user denial across every query
  and mutation, guessed-id non-leak, idempotency isolation, durable per-user
  history, admin privacy, auth/approval/suspension gates.
- `tests/nexus-p5-queue.test.ts` (7) — deterministic global ordering, private
  views, idempotency, cancellation eligibility, retry sequencing, client cannot
  supply queueSequence/priority, concurrent uniqueness.
- `tests/nexus-p5-lifecycle.test.ts` (18) — conversations, transactional message
  sequencing, validation, cancellation, retry, transitions, results/sources
  (internal write, private read, bounded, owner-copied), counts.
- `tests/nexus-p5-policy.test.ts` (12) — pure-function limits, tool allowlist,
  idempotency-key validation, status transitions, role/permission policy.
- `tests/nexus-p5-boundary.test.ts` (7) — no client-trusted owner/role/queue
  args; worker writes are internal-only; no P6 primitives; global indexes not
  exposed by user modules.
- `tests/nexus-p5-ui.test.tsx` (7) — composer enable/submit, connector-absent
  messaging, tasks workspace banner.

## 17. Validation results

| Check | Result |
|-------|--------|
| `npx convex codegen` | Pass — connected to the linked deployment and regenerated `convex/_generated/api.d.ts` (adds the 7 new P5 modules + 6 new `lib/*` modules; matches the hand-verified diff produced earlier in the takeover). |
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm test` | Pass — 164 tests, 20 files |
| `npm run build` | Pass — all routes build |
| `./scripts/verify-nexus-boundary.sh` | Pass (extended with P5 checks) |
| `./scripts/check-nexus-env.sh` | Pass (`CLERK_WEBHOOK_SECRET` reported missing — pre-existing, unrelated to P5) |

## 18. Manual two-user smoke

A live two-Clerk-user browser smoke was not executed in this environment (no
second interactive Clerk session / live deployment credentials available here).
Cross-user isolation and durable per-user history are covered by direct Convex
identity tests (`tests/nexus-p5-privacy.test.ts`, cases 14–17). The remaining
manual browser smoke (User A submits A1/A2 → sign out → User B sees none and
submits B1 → User A signs back in and sees A1/A2 but not B1, reopens a prior
conversation) is left as an operator step against the linked deployment.

## 19. Remaining work for P6

- Console Connector authentication (HMAC, credentials, installations).
- `claimNextTask` / lease / renew / heartbeat over the global queue indexes.
- Worker execution wiring the internal mutations
  (`transitionTaskInternal`, `writeTaskResultInternal`,
  `replaceTaskSourcesInternal`, `appendTaskProgressInternal`,
  `appendAssistantMessage`) to real Claudia results.
- `claimed`/`running`/`cancel_requested` user-visible flows.

See `nexus_p5_data_privacy_and_queue_contract_v1.md` for the binding contract
the Connector must honor.
