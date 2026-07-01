# Nexus Chat session selection persistence (v1)

Package: `nexus_chat_session_selection_persistence_v1`

## Previous reset behavior

`ChatSessionProvider` lived only under `NexusShell` on `/`. Navigating to routes such as `/documents` unmounted the provider, discarding React state (`activeConversationId = null`). `ChatComposer` kept `selectedToolId` in local component state, so it also reset to `P5_DEFAULT_TOOL_ID` (SAGE Knowledge Vault) on every return.

## Persisted fields

Per Clerk `userId`, in `sessionStorage` (`nexus.chat.session.v1:<userId>`):

- `conversationId` — selected conversation ID, or `null` for explicit New chat
- `requestedToolId` — canonical P5 tool ID (`vault.agentic_retrieval` or `membership_io.transcript_retrieve`)

No message bodies or secrets are stored.

## Session scope

Browser `sessionStorage` — survives route changes and remounts; cleared when the tab/session ends.

## User namespacing

Keys include the authenticated Clerk user ID. Account switch re-reads the new namespace. Sign-out clears in-memory selection but does not delete another user’s stored entry.

## Restoration precedence

1. Authenticate and wait for `readyForPrivateQueries`
2. Read namespaced session storage
3. Validate saved `conversationId` against `listMyConversations` (active only)
4. Fall back to New chat and rewrite storage when stale/deleted/archived

No URL conversation parameter exists on `/`; session storage is authoritative.

## Invalid/stale conversation handling

If the saved ID is absent from the owner’s active conversation list, selection clears to New chat and storage updates to `conversationId: null`.

## New chat behavior

`startNewRequest` sets `conversationId: null` in storage immediately.

## Deletion behavior

`ChatHistoryPanel` already calls `selectConversation` / `startNewRequest` after delete; persistence follows that fallback.

## Knowledge-type validation

`parsePersistedToolId` accepts only `P5_SUPPORTED_TOOL_IDS`; unknown values fall back to `vault.agentic_retrieval`.

## Account switching

`userId` change resets React state and re-hydrates from the new user’s namespace.

## Tests

- `tests/chat-session-persistence.test.ts`
- `tests/nexus-chat-session-selection-persistence.test.tsx`

## Live verification

Run the Library navigation checklist on a live Nexus deployment.

## Remaining limitations

- Not shared across browser tabs
- Not persisted across browser restarts (by design)
- Restoration waits for Convex conversation list (brief loading state)

## Rollback

Revert commit; remove session reads/writes. Chat returns to per-visit defaults without data migration.
