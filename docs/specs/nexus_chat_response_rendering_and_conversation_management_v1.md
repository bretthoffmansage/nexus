# Nexus Chat response rendering and conversation management (v1)

Package: `nexus_chat_response_rendering_and_conversation_management_v1`

## Scope

Hosted Nexus UI and Nexus-owned conversation storage only. No changes to the Nexus/Convex queue protocol, Claudia Connector contract, task ownership model, or Claudia-side execution.

## Previous type-on failure root cause

There was **no working type-on hook** in the live Chat path. `NexusChatWorkspace` rendered `message.content` directly in the transcript **and** projected `getMyTaskResult` → `AnswerPanel` as a second instant full answer. The completed assistant message from Convex arrived in one subscription update with no pending→completed transition detection for animation, and any hypothetical animation on a duplicate panel would not affect the canonical transcript card.

## Final animation state model

| State | Behavior |
| --- | --- |
| Baseline at conversation seed | Message IDs present when a conversation is first loaded in-session are treated as historical → full text immediately |
| New message after seed | Assistant messages not in baseline animate once |
| Session memory | `typeOnSession` Set records IDs that finished animating (prevents replay in same tab session) |
| Reduced motion | `prefers-reduced-motion: reduce` → full text immediately |

Components: `TranscriptMessage`, `useTypeOnText`, `lib/chat/typeOnSession.ts`.

## Animation speed

`TYPE_ON_CHARS_PER_SECOND = 100` (~two rendered lines/sec at typical width). `requestAnimationFrame` batches character steps proportional to elapsed time.

## Auto-scroll

`NexusChatWorkspace` tracks user scroll pin when >160px from bottom. `onGrowth` from `TranscriptMessage` scrolls only when within 120px of bottom.

## Canonical Chat answer ownership

- **Conversation messages** own Chat transcript rendering (`author: "assistant"` → display label `NEXUS`).
- **Task results** remain in Convex for Tasks/detail; Chat does not render `AnswerPanel` or `getMyTaskResult`.
- **Sources** render from `listMyTaskSources` only when latest task is `completed` and sources exist.

## Duplicate answer removal

Removed lower `ANSWER` section, `AnswerPanel`, and `getMyTaskResult` query from `NexusChatWorkspace`.

## Conditional status and sources

- Queued/running: compact status line only; no Answer/Sources headings or placeholders.
- Completed: answer in transcript only; Sources section only if `sources.length > 0`.
- Failed: compact failed status; no empty Answer/Sources blocks.

## Conversation deletion data model

**Hard delete** via `deleteMyConversation`:

1. `requireOwnedConversation` (server-side Clerk user boundary).
2. Delete all `nexusMessages` for the conversation.
3. Record `conversation_deleted` audit event.
4. Delete `nexusConversations` row.
5. **Do not** delete `nexusTasks`, `nexusTaskResults`, or `nexusTaskSources`.

Tasks retain `conversationId` as immutable metadata. Tasks queries unchanged.

## Task-retention guarantee

Deletion removes conversation + messages only. Tasks, results, sources, and Tasks tab queries continue to work. Verified in `tests/nexus-p5-lifecycle.test.ts` (conversation deletion suite).

## Ownership and privacy

`deleteMyConversation` uses `requireOwnedConversation`. Non-owners receive `conversation_not_found` (no ID oracle). Verified in `tests/nexus-p5-privacy.test.ts`.

## Removed UI elements

- Chat-page Diagnostics button
- Subtitle: “Private knowledge requests · queued for Claudia”
- Composer help: “Requests are saved and queued. Execution waits for the Claudia Connector (not configured yet).”
- Duplicate `ANSWER` panel and pending Answer/Sources placeholders

## Tests

- `tests/nexus-chat-response-rendering.test.tsx` — type-on, single answer, placeholders, labels, deletion UI
- Updated: `nexus-p4-4`, `nexus-p5-ui`, `nexus-p5-1`, `nexus-p6-1`, `chat-composer`, `nexus-p5-lifecycle`, `nexus-p5-privacy`

## Live verification

Manual checklist documented in package prompt. Run against a live Nexus + Connector deployment before claiming production readiness.

## Remaining limitations

- Type-on reveals plain text progressively (markdown structure preserved as characters arrive; no per-token markdown re-parse animation).
- Session animation memory is in-memory only (refresh shows historical answers immediately by design).
- Conversation deletion is permanent (not archive); tasks may reference a deleted `conversationId`.

## Rollback

Revert commit and redeploy. No schema migration required beyond optional `conversation_deleted` audit literal (backward compatible). Tasks unaffected.
