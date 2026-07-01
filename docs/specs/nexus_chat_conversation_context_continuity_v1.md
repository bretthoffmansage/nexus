# Nexus Chat conversation context continuity (v1)

Package: `nexus_chat_conversation_context_continuity_v1`

## Intended continuity behavior

Follow-up requests in the same Nexus Chat conversation include up to four recent **completed** user→Nexus round trips (plus compact sources) in the **execution request** sent through the existing queue. The first message in a conversation has no history wrapper.

## Why context is assembled server-side

The browser stores and displays only the user’s typed message. Authoritative turn pairing, ownership checks, and formatting happen in Convex at task creation so context cannot be forged, leaked across conversations, or built from rendered DOM text.

## Display message versus execution request

| Field | Purpose |
| --- | --- |
| `nexusMessages.content` (user message) | Exact visible Chat transcript text |
| `nexusTasks.requestText` | Original user request (Tasks UI + owner queries) |
| `nexusTasks.executionRequestText` (optional) | Immutable contextual payload for the Connector; omitted when identical to `requestText` |

Connector claim returns `effectiveExecutionRequestText(task)` — `executionRequestText ?? requestText`.

## Eligible turn definition

One round trip = user message linked via `requestMessageId` + completed task (`status: completed`) + assistant `result_summary` message linked by `taskId` + optional `nexusTaskSources`.

Excluded: queued/running/failed/cancelled tasks, orphaned user messages, non-owned rows, duplicate result projections (assistant message is canonical).

## Four-round-trip rolling window

Default `CONVERSATION_CONTEXT.maxPriorRoundTrips = 4`. When five completed turns exist, the oldest is dropped; turns 2–5 are included in chronological order, then the current request.

## Same-conversation and same-owner enforcement

`collectEligiblePriorTurns` runs only after `requireOwnedConversation`. Tasks/messages are filtered by `conversationId` and `ownerClerkUserId`. Foreign conversation IDs are rejected at submission (`conversation_not_found`).

## Deterministic context snapshot

`executionRequestText` is written once at `submitKnowledgeRequest` / `retryMyTask` insert time. Connector claim and retries read the stored value; later conversation turns do not alter queued tasks.

## Association model

- Task → `requestMessageId` (user turn)
- Task → assistant message via `nexusMessages.by_task` + `author: assistant`, `kind: result_summary`
- Task → sources via `nexusTaskSources.by_task_and_ordinal`

## Context format

Plain-text delimiters (`PREVIOUS CONVERSATION FOR CONTEXT ONLY` … `END OF PREVIOUS CONVERSATION CONTEXT` … `CURRENT TASK FROM USER:`). Turns separated by `---`. Sources: `- title | sourceType | locator`.

## Source compaction

User-visible source fields only (title, type, locator). No secrets, raw DB IDs, or transcript bodies.

## Size bounds and truncation

Configured in `convex/lib/conversationContextConfig.ts`:

- `maxPriorRoundTrips` (4)
- per-message and per-source caps
- `maxTotalContextChars` (24_000) — oldest turns dropped first
- `maxExecutionRequestLength` (32_000) — final clamp

Current user request is never truncated by historical-window logic.

## Concurrent submission behavior

Each task snapshots only turns completed **before** its creation. Running or queued prior tasks are excluded.

## Retry / idempotency

Retries build a fresh snapshot at the new task’s creation time. Idempotent resubmits return the original task unchanged.

## Deletion compatibility

Hard-deleted conversations remove messages; retained tasks keep historical `conversationId` but are not queried when building context for a different active conversation. Submitting to a deleted conversation ID fails ownership lookup.

## Security and prompt boundaries

Historical text is untrusted context. Wrapper states that only `CURRENT TASK FROM USER` is the active request. No prompt-injection classifier in this pass.

## Tests

- `tests/nexus-conversation-context.test.ts` — formatter, task creation, isolation, eligibility, claim persistence, deletion

## Live verification

Run the Copy Clinic follow-up scenario against a live Nexus + Connector deployment before production sign-off.

## Remaining limitations

- Character-based truncation (not semantic summarization)
- No client-visible “context included” indicator
- Retry rebuilds context at retry time (may differ from original attempt if conversation grew)

## Rollback

Revert commit. `executionRequestText` is optional; legacy tasks continue using `requestText` for Connector claim.

## Removed outdated UI messaging (related package)

See `nexus_chat_response_rendering_and_conversation_management_v1.md` for Chat UI cleanup including the obsolete app-shell setup banner removal (`TopAlertBanner` retained for future notices).
